"""CTO (Chief Technology Officer) Agent.

Responsible for system architecture, technical decision-making, task breakdown
into epics/stories/subtasks, sprint planning, and code review.
"""

import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import BaseAgent, AgentResult
from app.llm.base import BaseLLMProvider, LLMConfig
from app.schemas.agent_output import (
    CTOArchitectureOutput,
    CTOTaskBreakdownOutput,
    CodeReviewOutput,
)


CTO_SYSTEM_PROMPT = """\
You are the Chief Technology Officer (CTO) of an elite software consultancy.
You have 15+ years of hands-on engineering leadership at companies like Google,
Vercel, and Supabase. You bridge the gap between product vision and technical
execution. You make definitive architectural decisions, not wishy-washy suggestions.

YOUR CORE RESPONSIBILITIES:
- System architecture: choose the right tech stack, design data models, define API contracts
- Task breakdown: decompose a PRD into epics, features, stories, and subtasks with hour estimates
- Sprint planning: sequence work across sprints with clear dependency ordering
- Code review: review diffs for correctness, security, performance, and maintainability
- Risk assessment: identify technical risks early and propose concrete mitigations

ARCHITECTURAL PRINCIPLES:
- Start simple. Monolith-first unless there is a proven scaling requirement.
- Prefer boring technology over cutting-edge unless the project specifically demands it.
- Design for 10x current load, not 1000x. Over-engineering is a failure mode.
- Every API endpoint must have clear request/response contracts defined upfront.
- Database schema should be normalized to 3NF by default; denormalize only with justification.
- Security is non-negotiable: auth, input validation, rate limiting, HTTPS, secrets management.
- Always include a deployment plan: CI/CD, environments (dev/staging/prod), rollback strategy.

TASK BREAKDOWN RULES:
- An epic maps to a major product feature area.
- A feature maps to a shippable unit of work within an epic.
- A story maps to a single developer task (2-8 hours of work).
- If a story exceeds 8 hours, break it down further.
- Every story MUST have acceptance criteria and a clear "done" definition.
- Assign stories to "backend_dev" or "frontend_dev" based on where the work lives.
- Order sprints so that backend APIs come before frontend integration.
- Sprint 1 should always include project scaffolding and core data models.

CODE REVIEW STANDARDS:
- Check for: correctness, edge cases, error handling, naming, DRY, SOLID principles.
- Severity levels: critical (blocks merge), high (should fix), medium (improve), low (nit).
- Always provide constructive feedback. Explain WHY something is a problem.
- Security issues are always critical severity.

GUARDRAILS:
- NEVER make product decisions. Defer feature questions to the CPO.
- NEVER estimate budget/cost. That is the CFO's domain.
- Be prescriptive: choose ONE approach, not "you could do A or B."
- If the PRD is missing technical details, state what assumptions you are making.

OUTPUT FORMAT:
- You MUST respond with valid JSON matching the exact schema provided.
- Do NOT include markdown code fences, explanations, or any text outside the JSON object.
- Use snake_case for all keys exactly as specified in the schema.
"""


class CTOAgent(BaseAgent):
    """Chief Technology Officer — owns architecture, task breakdown, and code review."""

    role: str = "cto"
    display_name: str = "CTO"
    system_prompt: str = CTO_SYSTEM_PROMPT
    llm_config: LLMConfig = LLMConfig(
        model="gemini-2.0-flash",
        temperature=0.3,
        max_output_tokens=8192,
        response_format="json",
    )
    output_schema = None  # Set per-method

    def __init__(
        self,
        llm: BaseLLMProvider,
        db: AsyncSession,
        project_id: uuid.UUID,
    ):
        super().__init__(llm, db, project_id)

    async def design_architecture(self, prd: str) -> AgentResult:
        """Design the system architecture based on the PRD.

        Produces a complete technical architecture including tech stack,
        system design, database schema, API contracts, security approach,
        deployment plan, and risk assessment.

        Args:
            prd: The full PRD content (typically JSON string of CPOPRDOutput).

        Returns:
            AgentResult with content as CTOArchitectureOutput.
        """
        self.output_schema = CTOArchitectureOutput

        input_message = (
            f"[ARCHITECTURE DESIGN REQUEST]\n\n"
            f"The CPO has finalized the following PRD:\n\n"
            f'"""\n{prd}\n"""\n\n'
            f"Your task:\n"
            f"1. Choose a tech stack. For each choice (language, framework, database, etc.), "
            f"provide the name as the value. Be specific (e.g., 'PostgreSQL 16', not just 'SQL').\n"
            f"2. Write a system design overview explaining the high-level architecture "
            f"(monolith vs microservices, key components, data flow).\n"
            f"3. Define the database schema in DDL-like notation (tables, columns, types, relationships).\n"
            f"4. Define all API endpoints with method, path, description, and request/response bodies.\n"
            f"5. Describe the security approach (auth mechanism, data protection, input validation).\n"
            f"6. Provide a deployment plan (hosting, CI/CD, environments, monitoring).\n"
            f"7. List technical risks with severity and mitigation strategies.\n"
            f"8. Add scalability notes if relevant.\n\n"
            f"Respond with a JSON object matching this schema:\n"
            f"{json.dumps(CTOArchitectureOutput.model_json_schema(), indent=2)}"
        )

        return await self.run(input_message, phase="architecture")

    async def break_down_tasks(self, prd: str, architecture: str) -> AgentResult:
        """Break the PRD and architecture into epics, features, stories, and sprints.

        Args:
            prd: The full PRD content.
            architecture: The full architecture document.

        Returns:
            AgentResult with content as CTOTaskBreakdownOutput.
        """
        self.output_schema = CTOTaskBreakdownOutput

        input_message = (
            f"[TASK BREAKDOWN REQUEST]\n\n"
            f"PRD:\n\"\"\"\n{prd}\n\"\"\"\n\n"
            f"Architecture:\n\"\"\"\n{architecture}\n\"\"\"\n\n"
            f"Your task:\n"
            f"Break down the project into a structured work plan.\n\n"
            f"1. Create epics (major feature areas).\n"
            f"2. Within each epic, create features (shippable units).\n"
            f"3. Within each feature, create stories with:\n"
            f"   - Clear title and description\n"
            f"   - Acceptance criteria (at least 2 per story)\n"
            f"   - Subtasks (concrete implementation steps)\n"
            f"   - Estimated hours (2-8 hours per story; break down further if larger)\n"
            f"4. Assign each feature to 'backend_dev' or 'frontend_dev'.\n"
            f"5. List dependencies between features (e.g., 'API must exist before frontend integration').\n"
            f"6. Create a sprint plan: group stories into sprints (each sprint ~40 hours of work).\n"
            f"   - Sprint 1: scaffolding, core models, basic API\n"
            f"   - Sprint 2+: features in dependency order\n"
            f"   - Each sprint entry should be a dict with 'sprint_number' (int) and 'tasks' (list of story titles).\n\n"
            f"Respond with a JSON object matching this schema:\n"
            f"{json.dumps(CTOTaskBreakdownOutput.model_json_schema(), indent=2)}"
        )

        return await self.run(input_message, phase="sprint_planning")

    async def review_code(self, diff: str, task_context: str) -> AgentResult:
        """Review a code diff against the task requirements.

        Args:
            diff: The code diff to review (unified diff format or file contents).
            task_context: The story/task description and acceptance criteria this code implements.

        Returns:
            AgentResult with content as CodeReviewOutput.
        """
        self.output_schema = CodeReviewOutput

        input_message = (
            f"[CODE REVIEW REQUEST]\n\n"
            f"Task context:\n\"\"\"\n{task_context}\n\"\"\"\n\n"
            f"Code diff to review:\n```\n{diff}\n```\n\n"
            f"Your task:\n"
            f"Review this code against the task requirements and engineering standards.\n\n"
            f"1. Check correctness: does the code fulfill the acceptance criteria?\n"
            f"2. Check error handling: are edge cases and failures handled?\n"
            f"3. Check security: any injection risks, auth bypasses, or data leaks?\n"
            f"4. Check code quality: naming, structure, DRY, SOLID.\n"
            f"5. Check performance: any obvious N+1 queries, unnecessary loops, or memory issues?\n\n"
            f"For each issue found, provide:\n"
            f"  - file: the filename\n"
            f"  - line: approximate line number (0 if not applicable)\n"
            f"  - comment: what the issue is and how to fix it\n"
            f"  - severity: 'critical', 'high', 'medium', or 'low'\n\n"
            f"Set 'approved' to true ONLY if there are no critical or high severity issues.\n"
            f"List all required changes (things that MUST be fixed before merge).\n"
            f"Provide a brief summary of the overall code quality.\n\n"
            f"Respond with a JSON object matching this schema:\n"
            f"{json.dumps(CodeReviewOutput.model_json_schema(), indent=2)}"
        )

        return await self.run(input_message, phase="code_review")
