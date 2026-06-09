"""Main orchestrator engine — the brain of the MET system.

Listens for events, manages state transitions, triggers agents,
enforces gates, handles errors. This is deterministic — no LLM calls.
"""

import asyncio
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import Event, EventType
from app.core.exceptions import BudgetExceeded, GateNotApproved, InvalidStateTransition
from app.core.redis import redis_client
from app.database import async_session
from app.models.audit import AuditLog
from app.models.project import Project, ProjectAgent, StateTransition
from app.models.document import Document
from app.orchestrator.agent_manager import agent_manager
from app.orchestrator.gate_manager import GateManager
from app.orchestrator.state_machine import StateMachine

logger = logging.getLogger(__name__)


class OrchestratorEngine:
    def __init__(self, llm_provider=None):
        self.state_machine = StateMachine()
        self.llm_provider = llm_provider
        self._running = False

    async def start_listening(self):
        """Subscribe to events and process them."""
        self._running = True
        await redis_client.subscribe_global()
        logger.info("Orchestrator listening for events")

        async for event in redis_client.listen():
            if not self._running:
                break
            try:
                await self._handle_event(event)
            except Exception as e:
                logger.error(f"Error handling event {event.type}: {e}", exc_info=True)

    async def stop(self):
        self._running = False

    async def _handle_event(self, event: Event):
        match event.type:
            case EventType.PROJECT_STARTED:
                await self._handle_project_started(event)
            case EventType.PROJECT_RETRIED:
                await self._handle_project_retry(event)
            case EventType.AGENT_OUTPUT:
                await self._handle_agent_output(event)
            case EventType.GATE_REVIEWED:
                await self._handle_gate_reviewed(event)
            case EventType.AGENT_ERROR:
                await self._handle_agent_error(event)
            case EventType.BUDGET_ALERT:
                await self._handle_budget_alert(event)

    async def _handle_project_started(self, event: Event):
        """CEO submitted a brief → transition to discovery → start CPO."""
        async with async_session() as db:
            project = await self._get_project(db, event.project_id)
            if project.state != "briefing":
                return

            await self._transition_state(db, project, "discovery", "system", "Project started")

            # Initialize all agent records
            for role in ["cpo", "designer", "cto", "cfo", "backend_dev", "frontend_dev", "qa"]:
                db.add(ProjectAgent(project_id=project.id, role=role, status="idle"))
            await db.flush()

            # Start CPO discovery
            await agent_manager.start_agent(
                db=db,
                project_id=project.id,
                role="cpo",
                input_message=f"Analyze this project brief and generate clarifying questions, user personas, competitive analysis, and success metrics:\n\n{project.brief}",
                phase="discovery",
                llm_provider=self.llm_provider,
            )
            await db.commit()

    async def _handle_agent_output(self, event: Event):
        """Agent finished work → determine next step."""
        async with async_session() as db:
            project = await self._get_project(db, event.project_id)
            role = event.source
            phase = event.payload.get("phase", "")
            output = event.payload.get("output", {})

            logger.info(f"Agent {role} completed phase {phase} for project {project.id}")

            # Save agent output as document
            if isinstance(output, dict):
                import json
                content = json.dumps(output, indent=2)
            else:
                content = str(output)

            doc = Document(
                project_id=project.id,
                doc_type=phase,
                title=f"{role} output - {phase}",
                content=content,
                created_by=role,
            )
            db.add(doc)
            await db.flush()

            # If dev agent output contains files, write them to the workspace
            if role in ("backend_dev", "frontend_dev") and isinstance(output, dict):
                await self._write_code_to_workspace(project.id, role, output)

            # Route based on current state and which agent completed
            await self._route_after_agent(db, project, role, phase, output, doc.id)
            await db.commit()

    async def _route_after_agent(
        self, db: AsyncSession, project: Project, role: str,
        phase: str, output: dict | str, doc_id: uuid.UUID
    ):
        """Determine what happens after an agent completes."""
        state = project.state

        if state == "discovery" and role == "cpo":
            # CPO finished discovery → move to PRD creation
            await self._transition_state(db, project, "prd_creation", role, "Discovery complete")
            await agent_manager.start_agent(
                db=db, project_id=project.id, role="cpo",
                input_message=f"Create a comprehensive PRD based on discovery findings:\n\n{output}",
                phase="prd_creation", llm_provider=self.llm_provider,
            )

        elif state == "prd_creation" and role == "cpo":
            # CPO finished PRD → move to review (CEO approval needed)
            await self._transition_state(db, project, "prd_review", role, "PRD ready for review")
            gate_mgr = GateManager(db)
            await gate_mgr.submit_gate(project.id, "gate_1_prd", doc_id, "cpo")
            # Now we wait for CEO to approve via the API

        elif state == "design" and role == "designer":
            # Designer finished design → move to review
            await self._transition_state(db, project, "design_review", role, "Design ready for review")
            gate_mgr = GateManager(db)
            await gate_mgr.submit_gate(project.id, "gate_1_design", doc_id, "designer")

        elif state == "architecture" and role == "cto":
            # CTO finished architecture → move to arch review, submit gate for CEO approval
            await self._transition_state(db, project, "arch_review", role, "Architecture ready for review")
            gate_mgr = GateManager(db)
            await gate_mgr.submit_gate(project.id, "gate_1_arch", doc_id, "cto")

        elif state == "budget" and role == "cfo":
            # CFO finished budget → move to budget review
            await self._transition_state(db, project, "budget_review", role, "Budget ready for review")
            gate_mgr = GateManager(db)
            await gate_mgr.submit_gate(project.id, "gate_2_arch_budget", doc_id, "cfo")

        elif state == "sprint_planning" and role == "cto":
            # CTO finished task breakdown → move to development.
            # Only CTO triggers this (not CPO) to avoid double-triggering
            # when both are active in sprint_planning.
            await self._transition_state(db, project, "development", role, "Sprint planned")
            
            # Create isolated branch for development phase
            from app.services.git_service import GitService
            workspace = GitService.init_workspace(project.id)
            GitService.create_branch(workspace, "feature/development")
            
            # Start parallel development
            await agent_manager.start_parallel(
                db=db, project_id=project.id,
                agent_specs=[
                    {"role": "backend_dev", "input": f"Implement your assigned tasks. Architecture and task breakdown:\n\n{output}", "phase": "development"},
                    {"role": "frontend_dev", "input": f"Implement your assigned tasks. Architecture and task breakdown:\n\n{output}", "phase": "development"},
                ],
                llm_provider=self.llm_provider,
            )

        elif state == "development" and role in ("backend_dev", "frontend_dev"):
            # Check if all devs are done using the DB agent status
            # (authoritative source) rather than in-memory task.done()
            # which suffers from race conditions.
            await self._check_dev_completion(db, project)

        elif state == "code_review" and role == "cto":
            # CTO reviewed code
            approved = output.get("approved", False) if isinstance(output, dict) else False
            if approved:
                await self._transition_state(db, project, "qa_testing", role, "Code approved")
                await agent_manager.start_agent(
                    db=db, project_id=project.id, role="qa",
                    input_message="Run QA testing on all completed features.",
                    phase="qa_testing", llm_provider=self.llm_provider,
                )
            else:
                await self._transition_state(db, project, "development", role, "Code changes required")
                # Restart dev agents with feedback
                await agent_manager.start_parallel(
                    db=db, project_id=project.id,
                    agent_specs=[
                        {"role": "backend_dev", "input": f"Fix these code review issues:\n\n{output}", "phase": "development"},
                        {"role": "frontend_dev", "input": f"Fix these code review issues:\n\n{output}", "phase": "development"},
                    ],
                    llm_provider=self.llm_provider,
                )

        elif state == "qa_testing" and role == "qa":
            recommendation = output.get("recommendation", "fail") if isinstance(output, dict) else "fail"
            if recommendation == "pass":
                await self._transition_state(db, project, "uat", role, "QA passed")
                gate_mgr = GateManager(db)
                await gate_mgr.submit_gate(project.id, "gate_3_uat", doc_id, "qa")
            elif recommendation == "pass_with_notes":
                await self._transition_state(db, project, "uat", role, "QA passed with notes")
                gate_mgr = GateManager(db)
                await gate_mgr.submit_gate(project.id, "gate_3_uat", doc_id, "qa")
            else:
                # QA failed → back to development
                await self._transition_state(db, project, "development", role, "QA failed")

    async def _check_dev_completion(self, db: AsyncSession, project: Project):
        """Check if all dev agents are done and transition to code_review.

        Uses the DB agent status (authoritative) instead of in-memory
        task.done() which races with event publication timing.
        """
        # Re-read project state to avoid stale data
        refreshed = await self._get_project(db, project.id)
        if refreshed.state != "development":
            logger.info(f"Project already moved past development (now {refreshed.state}), skipping")
            return

        # Query DB for dev agent statuses — the source of truth
        result = await db.execute(
            select(ProjectAgent)
            .where(ProjectAgent.project_id == project.id)
            .where(ProjectAgent.role.in_(["backend_dev", "frontend_dev"]))
        )
        dev_agents = result.scalars().all()

        # Both devs must be done (idle or error — not "working")
        all_done = all(a.status in ("idle", "error") for a in dev_agents)
        if not all_done:
            still_working = [a.role for a in dev_agents if a.status not in ("idle", "error")]
            logger.info(f"Dev agents still working: {still_working}")
            return

        # If ALL devs errored, fail the project
        all_errored = all(a.status == "error" for a in dev_agents)
        if all_errored:
            logger.critical(f"All dev agents errored for project {project.id}")
            await self._transition_state(db, refreshed, "failed", "system", "All dev agents failed")
            return

        # All devs done → code review
        logger.info(f"All dev agents idle for project {project.id}, transitioning to code_review")
        await self._transition_state(db, refreshed, "code_review", "system", "Development complete")
        await agent_manager.start_agent(
            db=db, project_id=project.id, role="cto",
            input_message="Review all code changes from development phase.",
            phase="code_review", llm_provider=self.llm_provider,
        )

    async def _handle_gate_reviewed(self, event: Event):
        """CEO approved or rejected a gate → trigger next phase."""
        async with async_session() as db:
            project = await self._get_project(db, event.project_id)
            action = event.payload.get("action", "")
            gate_key = event.payload.get("gate_key", "")

            if action == "approve":
                await self._handle_gate_approval(db, project, gate_key)
            else:
                await self._handle_gate_rejection(db, project, gate_key, event.payload.get("notes", ""))
            await db.commit()

    async def _handle_gate_approval(self, db: AsyncSession, project: Project, gate_key: str):
        if gate_key == "gate_1_prd":
            # PRD approved → start Designer
            await self._transition_state(db, project, "design", "ceo", "PRD approved", gate_approved=True)
            prd = await self._get_latest_document(db, project.id, "prd_creation")
            await agent_manager.start_agent(
                db=db, project_id=project.id, role="designer",
                input_message=f"Create a design system and wireframes based on this PRD:\n\n{prd}",
                phase="design", llm_provider=self.llm_provider,
            )

        elif gate_key == "gate_1_design":
            # Design approved → start CTO architecture
            await self._transition_state(db, project, "architecture", "ceo", "Design approved", gate_approved=True)
            prd = await self._get_latest_document(db, project.id, "prd_creation")
            design = await self._get_latest_document(db, project.id, "design")
            await agent_manager.start_agent(
                db=db, project_id=project.id, role="cto",
                input_message=f"Design the technical architecture based on this PRD and Design:\n\nPRD:\n{prd}\n\nDesign:\n{design}",
                phase="architecture", llm_provider=self.llm_provider,
            )

        elif gate_key == "gate_1_arch":
            # Architecture approved → start CFO budget estimation
            await self._transition_state(db, project, "budget", "ceo", "Architecture approved", gate_approved=True)
            arch = await self._get_latest_document(db, project.id, "architecture")
            prd = await self._get_latest_document(db, project.id, "prd_creation")
            await agent_manager.start_agent(
                db=db, project_id=project.id, role="cfo",
                input_message=f"Estimate the budget for this project based on the PRD and architecture:\n\nPRD:\n{prd}\n\nArchitecture:\n{arch}",
                phase="budget", llm_provider=self.llm_provider,
            )

        elif gate_key == "gate_2_arch_budget":
            # Budget approved → sprint planning
            await self._transition_state(db, project, "sprint_planning", "ceo", "Budget approved", gate_approved=True)
            arch = await self._get_latest_document(db, project.id, "architecture")
            prd = await self._get_latest_document(db, project.id, "prd_creation")
            await agent_manager.start_agent(
                db=db, project_id=project.id, role="cto",
                input_message=f"Break down the PRD and architecture into tasks and create a sprint plan:\n\nPRD:\n{prd}\n\nArchitecture:\n{arch}",
                phase="sprint_planning", llm_provider=self.llm_provider,
            )

        elif gate_key == "gate_3_uat":
            # UAT approved → deployment
            
            # Merge the feature/development branch back to main
            from app.services.git_service import GitService
            workspace = GitService.init_workspace(project.id)
            # Ensure we are on main
            GitService.create_branch(workspace, "main")
            GitService.merge_branch(workspace, "feature/development")
            
            await self._transition_state(db, project, "deployment", "ceo", "UAT accepted", gate_approved=True)
            gate_mgr = GateManager(db)
            # Auto-submit gate 4 for CEO release approval
            await gate_mgr.submit_gate(project.id, "gate_4_release", project.id, "system")

        elif gate_key == "gate_4_release":
            # Release approved → complete
            await self._transition_state(db, project, "complete", "ceo", "Released to production", gate_approved=True)

    async def _handle_gate_rejection(
        self, db: AsyncSession, project: Project, gate_key: str, notes: str
    ):
        if gate_key == "gate_1_prd":
            # PRD rejected → back to PRD creation
            await self._transition_state(db, project, "prd_creation", "ceo", f"PRD rejected: {notes}")
            await agent_manager.start_agent(
                db=db, project_id=project.id, role="cpo",
                input_message=f"Revise the PRD based on CEO feedback:\n\n{notes}",
                phase="prd_creation", llm_provider=self.llm_provider,
            )

        elif gate_key == "gate_1_design":
            # Design rejected → back to design creation
            await self._transition_state(db, project, "design", "ceo", f"Design rejected: {notes}")
            prd = await self._get_latest_document(db, project.id, "prd_creation")
            await agent_manager.start_agent(
                db=db, project_id=project.id, role="designer",
                input_message=f"Revise the design based on CEO feedback:\n\n{notes}\n\nOriginal PRD:\n{prd}",
                phase="design", llm_provider=self.llm_provider,
            )

        elif gate_key == "gate_1_arch":
            # Architecture rejected → back to architecture
            await self._transition_state(db, project, "architecture", "ceo", f"Architecture rejected: {notes}")
            await agent_manager.start_agent(
                db=db, project_id=project.id, role="cto",
                input_message=f"Revise the architecture based on CEO feedback:\n\n{notes}",
                phase="architecture", llm_provider=self.llm_provider,
            )

        elif gate_key == "gate_2_arch_budget":
            # Budget rejected → back to budget estimation with CFO
            await self._transition_state(db, project, "budget", "ceo", f"Budget rejected: {notes}")
            arch = await self._get_latest_document(db, project.id, "architecture")
            await agent_manager.start_agent(
                db=db, project_id=project.id, role="cfo",
                input_message=f"Revise the budget based on CEO feedback:\n\n{notes}\n\nArchitecture:\n{arch}",
                phase="budget", llm_provider=self.llm_provider,
            )

        elif gate_key == "gate_3_uat":
            # UAT rejected → back to sprint planning
            await self._transition_state(db, project, "sprint_planning", "ceo", f"UAT rejected: {notes}")

    async def _handle_agent_error(self, event: Event):
        """Agent failed → retry up to 2 times, then escalate to failed state."""
        role = event.source
        error_msg = event.payload.get("error", "unknown")
        phase = event.payload.get("phase", "")
        logger.error(f"Agent error: {role} - {error_msg}")

        async with async_session() as db:
            project = await self._get_project(db, event.project_id)

            if self.state_machine.is_terminal(project.state):
                return

            # Track retry count via audit log
            from sqlalchemy import func
            retry_result = await db.execute(
                select(func.count())
                .select_from(AuditLog)
                .where(AuditLog.project_id == event.project_id)
                .where(AuditLog.action == "agent.error_retry")
                .where(AuditLog.actor == role)
            )
            retry_count = retry_result.scalar() or 0

            if retry_count < 2:
                # Retry the agent
                logger.warning(f"Retrying agent {role} (attempt {retry_count + 1}/2)")
                db.add(AuditLog(
                    project_id=event.project_id,
                    actor=role,
                    action="agent.error_retry",
                    entity_type="agent",
                    entity_id=event.project_id,
                    details={"error": error_msg, "retry": retry_count + 1, "phase": phase},
                ))
                await db.commit()

                # Exponential backoff: sleep for 2^retry_count seconds
                backoff_seconds = 2 ** retry_count
                logger.info(f"Exponential backoff: sleeping for {backoff_seconds}s before retrying agent {role}")
                await asyncio.sleep(backoff_seconds)

                # Re-start the agent with a fresh session
                async with async_session() as retry_db:
                    await agent_manager.start_agent(
                        db=retry_db,
                        project_id=event.project_id,
                        role=role,
                        input_message=f"Your previous attempt failed with error: {error_msg}\n\nPlease try again.",
                        phase=phase,
                        llm_provider=self.llm_provider,
                    )
                    await retry_db.commit()
            else:
                # Exhausted retries
                logger.critical(f"Agent {role} exhausted retries for project {event.project_id}")
                db.add(AuditLog(
                    project_id=event.project_id,
                    actor=role,
                    action="agent.error_exhausted",
                    entity_type="agent",
                    entity_id=event.project_id,
                    details={"error": error_msg, "phase": phase},
                ))

                # During development, a single dev failing shouldn't kill the
                # whole project — check if the OTHER dev finished successfully
                # and move to code_review with whatever code was produced.
                if project.state == "development" and role in ("backend_dev", "frontend_dev"):
                    logger.warning(f"Dev agent {role} failed, checking if other dev completed")
                    await db.commit()
                    async with async_session() as check_db:
                        refreshed = await self._get_project(check_db, event.project_id)
                        if refreshed.state == "development":
                            await self._check_dev_completion(check_db, refreshed)
                            await check_db.commit()
                else:
                    await self._transition_state(
                        db, project, "failed", role,
                        f"Agent {role} failed after 2 retries: {error_msg}",
                    )
                    await db.commit()

    async def _handle_budget_alert(self, event: Event):
        """Budget threshold crossed → pause agents at 95%."""
        level = event.payload.get("level", "warning")
        if level == "warning":
            logger.warning(
                f"Budget warning (60%) for project {event.project_id}: "
                f"{event.payload.get('spent_cents', '?')}/{event.payload.get('total_budget_cents', '?')} cents"
            )
        elif level == "critical":
            logger.warning(
                f"Budget critical (80%) for project {event.project_id}: "
                f"{event.payload.get('spent_cents', '?')}/{event.payload.get('total_budget_cents', '?')} cents"
            )
        elif level == "escalation":
            logger.critical(f"Budget hard-stop (95%) for project {event.project_id}!")
            # Cancel all running agents for this project
            cancelled = await agent_manager.stop_all_agents(event.project_id)
            if cancelled:
                logger.critical(f"Cancelled agents due to budget: {cancelled}")
            # Transition project to failed state
            async with async_session() as db:
                project = await self._get_project(db, event.project_id)
                if not self.state_machine.is_terminal(project.state):
                    await self._transition_state(
                        db, project, "failed", "system",
                        f"Budget exceeded 95% — all agents stopped. Spent: {event.payload.get('spent_cents', '?')} cents",
                    )
                await db.commit()

    async def _write_code_to_workspace(
        self, project_id: uuid.UUID, role: str, output: dict
    ):
        """Write dev agent code output to the project workspace on disk.

        GitService operations are synchronous (file I/O + subprocess calls),
        so we run them in a thread to avoid blocking the async event loop.
        """
        from app.schemas.agent_output import FileWrite
        from app.services.git_service import GitService

        try:
            raw_files = output.get("files", [])
            raw_tests = output.get("tests", [])
            all_files: list[FileWrite] = []

            for f in raw_files + raw_tests:
                if isinstance(f, dict) and f.get("path") and f.get("content"):
                    all_files.append(FileWrite(
                        path=f["path"],
                        content=f["content"],
                        operation=f.get("operation", "create"),
                    ))

            if not all_files:
                return

            def _sync_write():
                workspace = GitService.init_workspace(project_id)
                GitService.write_files(workspace, all_files)
                summary = output.get("summary", "Code update")[:72]
                GitService.commit(workspace, f"{role}: {summary}")
                return len(all_files)

            count = await asyncio.to_thread(_sync_write)
            logger.info(
                f"Wrote {count} files to workspace for project {project_id}"
            )
        except Exception as e:
            logger.error(f"Failed to write code to workspace: {e}", exc_info=True)

    async def _transition_state(
        self, db: AsyncSession, project: Project,
        to_state: str, triggered_by: str, reason: str,
        gate_approved: bool = False,
    ):
        from_state = project.state
        try:
            self.state_machine.validate_transition(from_state, to_state, gate_approved=gate_approved)
        except (InvalidStateTransition, GateNotApproved) as e:
            logger.error(f"Invalid transition {from_state} → {to_state}: {e}")
            raise

        project.state = to_state

        # Log transition
        db.add(StateTransition(
            project_id=project.id,
            from_state=from_state,
            to_state=to_state,
            triggered_by=triggered_by,
            reason=reason,
        ))
        db.add(AuditLog(
            project_id=project.id,
            actor=triggered_by,
            action="state.changed",
            entity_type="project",
            entity_id=project.id,
            details={"from": from_state, "to": to_state, "reason": reason},
        ))
        await db.flush()

        # Publish state change event
        await redis_client.publish_event(Event(
            type=EventType.STATE_CHANGED,
            project_id=project.id,
            source="system",
            payload={"from_state": from_state, "to_state": to_state, "reason": reason},
        ))

        logger.info(f"Project {project.id}: {from_state} → {to_state} ({reason})")

    async def _get_project(self, db: AsyncSession, project_id: uuid.UUID) -> Project:
        result = await db.execute(select(Project).where(Project.id == project_id))
        return result.scalar_one()

    async def _get_latest_document(self, db: AsyncSession, project_id: uuid.UUID, doc_type: str) -> str:
        result = await db.execute(
            select(Document)
            .where(Document.project_id == project_id)
            .where(Document.doc_type == doc_type)
            .order_by(Document.created_at.desc())
            .limit(1)
        )
        doc = result.scalar_one_or_none()
        return doc.content if doc else ""

    async def _handle_project_retry(self, event: Event):
        """User retried a failed project. Find previous state and resume."""
        async with async_session() as db:
            project = await self._get_project(db, event.project_id)
            if project.state != "failed":
                return

            # Find the state before it was failed
            result = await db.execute(
                select(StateTransition)
                .where(StateTransition.project_id == project.id)
                .where(StateTransition.to_state == "failed")
                .order_by(StateTransition.created_at.desc())
                .limit(1)
            )
            failed_transition = result.scalar_one_or_none()
            if not failed_transition:
                logger.error(f"Cannot retry project {project.id}: no previous failed transition found.")
                return

            resume_state = failed_transition.from_state
            logger.info(f"Retrying project {project.id}, resuming from state: {resume_state}")

            # Transition out of failed
            await self._transition_state(
                db, project, resume_state, "ceo", "Project retried by user"
            )

            # Re-trigger the appropriate agents or actions for the resumed state
            if resume_state == "discovery":
                await agent_manager.start_agent(
                    db=db, project_id=project.id, role="cpo",
                    input_message="Resume discovery phase. Please retry your analysis.",
                    phase="discovery", llm_provider=self.llm_provider,
                )
            elif resume_state == "prd_creation":
                output = await self._get_latest_document(db, project.id, "discovery")
                await agent_manager.start_agent(
                    db=db, project_id=project.id, role="cpo",
                    input_message=f"Resume PRD creation. Please retry creating the PRD based on discovery findings:\n\n{output}",
                    phase="prd_creation", llm_provider=self.llm_provider,
                )
            elif resume_state == "design":
                prd = await self._get_latest_document(db, project.id, "prd_creation")
                await agent_manager.start_agent(
                    db=db, project_id=project.id, role="designer",
                    input_message=f"Resume design phase. Please retry creating a design system and wireframes based on this PRD:\n\n{prd}",
                    phase="design", llm_provider=self.llm_provider,
                )
            elif resume_state == "architecture":
                prd = await self._get_latest_document(db, project.id, "prd_creation")
                design = await self._get_latest_document(db, project.id, "design")
                await agent_manager.start_agent(
                    db=db, project_id=project.id, role="cto",
                    input_message=f"Resume architecture phase. Please retry designing the technical architecture based on this PRD and Design:\n\nPRD:\n{prd}\n\nDesign:\n{design}",
                    phase="architecture", llm_provider=self.llm_provider,
                )
            elif resume_state == "budget":
                arch = await self._get_latest_document(db, project.id, "architecture")
                prd = await self._get_latest_document(db, project.id, "prd_creation")
                await agent_manager.start_agent(
                    db=db, project_id=project.id, role="cfo",
                    input_message=f"Resume budget phase. Please retry estimating the budget for this project based on the PRD and architecture:\n\nPRD:\n{prd}\n\nArchitecture:\n{arch}",
                    phase="budget", llm_provider=self.llm_provider,
                )
            elif resume_state == "sprint_planning":
                arch = await self._get_latest_document(db, project.id, "architecture")
                prd = await self._get_latest_document(db, project.id, "prd_creation")
                await agent_manager.start_agent(
                    db=db, project_id=project.id, role="cto",
                    input_message=f"Resume sprint planning phase. Please retry breaking down the PRD and architecture into tasks and creating a sprint plan:\n\nPRD:\n{prd}\n\nArchitecture:\n{arch}",
                    phase="sprint_planning", llm_provider=self.llm_provider,
                )
            elif resume_state == "development":
                arch = await self._get_latest_document(db, project.id, "sprint_planning")
                await agent_manager.start_parallel(
                    db=db, project_id=project.id,
                    agent_specs=[
                        {"role": "backend_dev", "input": f"Resume development. Please retry your implementation based on architecture and task breakdown:\n\n{arch}", "phase": "development"},
                        {"role": "frontend_dev", "input": f"Resume development. Please retry your implementation based on architecture and task breakdown:\n\n{arch}", "phase": "development"},
                    ],
                    llm_provider=self.llm_provider,
                )
            elif resume_state == "code_review":
                await agent_manager.start_agent(
                    db=db, project_id=project.id, role="cto",
                    input_message="Resume code review. Please retry reviewing all code changes from development phase.",
                    phase="code_review", llm_provider=self.llm_provider,
                )
            elif resume_state == "qa_testing":
                await agent_manager.start_agent(
                    db=db, project_id=project.id, role="qa",
                    input_message="Resume QA testing. Please retry running QA testing on all completed features.",
                    phase="qa_testing", llm_provider=self.llm_provider,
                )
            else:
                logger.info(f"Resumed to review state {resume_state}, awaiting user interaction.")
            
            await db.commit()
