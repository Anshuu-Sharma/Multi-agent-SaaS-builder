"""Manages agent lifecycle — starting, stopping, tracking active agents.

CRITICAL: Each agent runs in its own asyncio task with its own DB session.
The orchestrator session must NOT be shared with agent tasks.
"""

import asyncio
import json
import logging
import uuid

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import BaseAgent, AgentResult
from app.core.events import Event, EventType
from app.core.redis import redis_client
from app.database import async_session
from app.models.project import ProjectAgent
from app.schemas.agent_output import (
    CFOBudgetOutput,
    CodeReviewOutput,
    CPODiscoveryOutput,
    CPOPRDOutput,
    DesignerOutput,
    CTOArchitectureOutput,
    CTOTaskBreakdownOutput,
    DevCodeOutput,
    QATestOutput,
    TestPlanOutput,
)

logger = logging.getLogger(__name__)

# Mapping from (role, phase) → Pydantic output schema.
# When a schema is set, BaseAgent.run() will validate the LLM response
# against it and retry on validation failure. When None, the raw LLM
# text is returned (used for free-form text like UAT or financial reports).
PHASE_SCHEMA_MAP: dict[tuple[str, str], type[BaseModel] | None] = {
    ("cpo", "discovery"): CPODiscoveryOutput,
    ("cpo", "prd_creation"): CPOPRDOutput,
    ("cpo", "uat"): None,  # free-form text
    ("designer", "design"): DesignerOutput,
    ("cto", "architecture"): CTOArchitectureOutput,
    ("cto", "sprint_planning"): CTOTaskBreakdownOutput,
    ("cto", "code_review"): CodeReviewOutput,
    ("cfo", "budget"): CFOBudgetOutput,
    ("cfo", "reporting"): None,  # free-form text
    ("backend_dev", "development"): DevCodeOutput,
    ("backend_dev", "code_fix"): DevCodeOutput,
    ("frontend_dev", "development"): DevCodeOutput,
    ("frontend_dev", "code_fix"): DevCodeOutput,
    ("qa", "test_planning"): TestPlanOutput,
    ("qa", "qa_testing"): QATestOutput,
    ("qa", "qa_review"): QATestOutput,
}

# Default timeout for agent execution (5 minutes)
AGENT_TIMEOUT_SECONDS = 300


class AgentManager:
    def __init__(self):
        self._active_tasks: dict[str, asyncio.Task] = {}
        self._agents: dict[str, type[BaseAgent]] = {}
        self._lock = asyncio.Lock()

    def register_agent(self, role: str, agent_class: type[BaseAgent]):
        self._agents[role] = agent_class

    async def start_agent(
        self,
        db: AsyncSession,
        project_id: uuid.UUID,
        role: str,
        input_message: str,
        phase: str,
        llm_provider=None,
    ) -> None:
        async with self._lock:
            key = f"{project_id}:{role}"
            if key in self._active_tasks and not self._active_tasks[key].done():
                logger.warning(f"Agent {role} already running for project {project_id}")
                return

            agent_class = self._agents.get(role)
            if not agent_class:
                raise ValueError(f"Unknown agent role: {role}")

            # Update agent status using the orchestrator's session
            await self._update_agent_status(db, project_id, role, "working")

            # Publish started event
            await redis_client.publish_event(Event(
                type=EventType.AGENT_STARTED,
                project_id=project_id,
                source=role,
                payload={"phase": phase},
            ))

            # Launch agent in its OWN asyncio task with its OWN DB session
            task = asyncio.create_task(
                self._run_agent_with_own_session(
                    agent_class, project_id, role, input_message, phase, llm_provider
                )
            )
            self._active_tasks[key] = task

    async def start_parallel(
        self,
        db: AsyncSession,
        project_id: uuid.UUID,
        agent_specs: list[dict],
        llm_provider=None,
    ) -> list[asyncio.Task]:
        tasks = []
        for spec in agent_specs:
            await self.start_agent(
                db=db,
                project_id=project_id,
                role=spec["role"],
                input_message=spec["input"],
                phase=spec["phase"],
                llm_provider=llm_provider,
            )
            key = f"{project_id}:{spec['role']}"
            tasks.append(self._active_tasks[key])
        return tasks

    async def _run_agent_with_own_session(
        self,
        agent_class: type[BaseAgent],
        project_id: uuid.UUID,
        role: str,
        input_message: str,
        phase: str,
        llm_provider,
    ):
        """Run agent with its own independent DB session and timeout."""
        async with async_session() as db:
            try:
                agent = agent_class(llm=llm_provider, db=db, project_id=project_id)

                # Set the correct output_schema based on (role, phase).
                # This is what the individual agent methods (discover, create_prd, etc.)
                # do internally, but the orchestrator calls run() directly.
                schema_key = (role, phase)
                if schema_key in PHASE_SCHEMA_MAP:
                    schema = PHASE_SCHEMA_MAP[schema_key]
                    agent.output_schema = schema
                    # For text-only phases (UAT, reports), also switch response format
                    if schema is None:
                        agent.llm_config = agent.llm_config.model_copy(
                            update={"response_format": "text"}
                        )
                    # Append JSON schema hint to help the LLM produce valid output
                    if schema is not None:
                        schema_hint = json.dumps(schema.model_json_schema(), indent=2)
                        input_message += (
                            f"\n\nRespond with a JSON object matching this schema:\n"
                            f"{schema_hint}"
                        )
                else:
                    logger.warning(
                        f"No schema mapping for ({role}, {phase}), using raw text output"
                    )

                result = await asyncio.wait_for(
                    agent.run(input_message, phase),
                    timeout=AGENT_TIMEOUT_SECONDS,
                )
                await db.commit()

                # Publish output event
                output = result.content
                if hasattr(output, "model_dump"):
                    output = output.model_dump()
                elif not isinstance(output, (str, dict)):
                    output = str(output)

                # Update DB status to idle BEFORE publishing the event.
                # The orchestrator checks DB agent status to decide transitions,
                # so the DB must reflect "idle" by the time the event is processed.
                await self._update_agent_status_fresh(project_id, role, "idle")

                await redis_client.publish_event(Event(
                    type=EventType.AGENT_OUTPUT,
                    project_id=project_id,
                    source=role,
                    payload={"phase": phase, "output": output},
                ))
                return result

            except TimeoutError:
                logger.error(f"Agent {role} timed out after {AGENT_TIMEOUT_SECONDS}s")
                await db.rollback()

                await redis_client.publish_event(Event(
                    type=EventType.AGENT_ERROR,
                    project_id=project_id,
                    source=role,
                    payload={"error": f"Agent timed out after {AGENT_TIMEOUT_SECONDS}s", "phase": phase},
                ))
                await self._update_agent_status_fresh(project_id, role, "error")
                raise

            except Exception as e:
                logger.error(f"Agent {role} failed: {e}")
                await db.rollback()

                await redis_client.publish_event(Event(
                    type=EventType.AGENT_ERROR,
                    project_id=project_id,
                    source=role,
                    payload={"error": str(e), "phase": phase},
                ))
                await self._update_agent_status_fresh(project_id, role, "error")
                raise

    async def _update_agent_status(
        self, db: AsyncSession, project_id: uuid.UUID, role: str, status: str
    ):
        """Update agent status using an existing session."""
        result = await db.execute(
            select(ProjectAgent)
            .where(ProjectAgent.project_id == project_id)
            .where(ProjectAgent.role == role)
        )
        agent_record = result.scalar_one_or_none()
        if agent_record:
            agent_record.status = status
            await db.flush()

    async def _update_agent_status_fresh(
        self, project_id: uuid.UUID, role: str, status: str
    ):
        """Update agent status with a fresh DB session."""
        async with async_session() as db:
            result = await db.execute(
                select(ProjectAgent)
                .where(ProjectAgent.project_id == project_id)
                .where(ProjectAgent.role == role)
            )
            agent_record = result.scalar_one_or_none()
            if agent_record:
                agent_record.status = status
                await db.commit()

    async def stop_all_agents(self, project_id: uuid.UUID) -> list[str]:
        """Cancel all running agent tasks for a project. Returns list of cancelled roles."""
        async with self._lock:
            cancelled = []
            for key, task in list(self._active_tasks.items()):
                pid, role = key.split(":", 1)
                if pid == str(project_id) and not task.done():
                    task.cancel()
                    cancelled.append(role)
                    logger.warning(f"Budget hard-stop: cancelled agent {role} for project {project_id}")
            return cancelled

    def is_agent_running(self, project_id: uuid.UUID, role: str) -> bool:
        key = f"{project_id}:{role}"
        task = self._active_tasks.get(key)
        return task is not None and not task.done()

    def get_active_agents(self, project_id: uuid.UUID) -> list[str]:
        active = []
        for key, task in self._active_tasks.items():
            pid, role = key.split(":", 1)
            if pid == str(project_id) and not task.done():
                active.append(role)
        return active


agent_manager = AgentManager()
