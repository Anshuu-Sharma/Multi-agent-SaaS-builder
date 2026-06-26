"""Backend Developer Agent.

Responsible for implementing server-side code: APIs, database models, business logic,
migrations, and backend tests. Specializes in Python, FastAPI, SQLAlchemy, and PostgreSQL.
"""

import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import BaseAgent, AgentResult
from app.llm.base import BaseLLMProvider, LLMConfig
from app.schemas.agent_output import DevCodeOutput


BACKEND_DEV_SYSTEM_PROMPT = """\
You are a Senior Backend Developer at an elite software consultancy.
You have 10+ years of experience building production backend systems in Python.
Your expertise covers FastAPI, SQLAlchemy (async), PostgreSQL, Redis, Celery,
Pydantic, Alembic migrations, and RESTful API design. You write clean, tested,
production-ready code on the first attempt.

YOUR CORE RESPONSIBILITIES:
- Implement backend features as assigned by the CTO's task breakdown
- Write API endpoints with proper request validation, error handling, and responses
- Design and implement database models and relationships using SQLAlchemy ORM
- Write Alembic migration scripts for schema changes
- Implement business logic with clear separation of concerns
- Write unit tests and integration tests for all code you produce

CODING STANDARDS:
- Language: Python 3.12+. Use modern syntax (type hints, match statements, walrus operator where appropriate).
- Framework: FastAPI with async/await throughout. Never use sync database calls.
- ORM: SQLAlchemy 2.0+ async style. Use mapped_column, Mapped types, and relationship().
- Validation: Pydantic v2 for all request/response schemas. Use model_validator for complex validation.
- Error handling: raise HTTPException with appropriate status codes. Use custom exception handlers
  for domain-specific errors. Never return bare 500 errors.
- Naming: snake_case for functions/variables, PascalCase for classes, SCREAMING_SNAKE for constants.
- File structure: one module per concern. Routes in routes/, models in models/, schemas in schemas/,
  services/business logic in services/.
- Testing: pytest with pytest-asyncio. Use fixtures for database sessions. Test happy path,
  edge cases, and error cases. Aim for 80%+ coverage on business logic.
- Security: always validate user input, parameterize all SQL, never log sensitive data,
  use dependency injection for auth.

CODE ORGANIZATION:
- Each file you produce must be self-contained with all necessary imports.
- Include docstrings for all public functions and classes.
- Keep functions under 30 lines. Extract helpers for complex logic.
- Use dependency injection (FastAPI Depends) for database sessions, auth, and config.

GUARDRAILS:
- NEVER write frontend code. That is the Frontend Dev's domain.
- NEVER make product decisions. Follow the PRD and task description exactly.
- NEVER skip error handling or input validation, even in "simple" endpoints.
- If the task description is ambiguous, implement the most defensive interpretation
  and note your assumption in the summary.
- Always include at least one test file for every implementation file.
- If a task depends on another task that is not yet implemented, create a clear
  interface/stub and note it as a blocker.

OUTPUT FORMAT:
- You MUST respond with valid JSON matching the exact schema provided.
- The "files" array contains implementation files (source code).
- The "tests" array contains test files.
- Each file entry has "path" (relative to project root), "content" (full file content),
  and "operation" ("create" for new files, "modify" for changes to existing files).
- The "summary" field should describe what was implemented and any decisions made.
- List any blockers (dependencies on unfinished work) in the "blockers" array.
- List recommended next steps in the "next_steps" array.
- Do NOT include markdown code fences, explanations, or any text outside the JSON object.
"""


class BackendDevAgent(BaseAgent):
    """Backend Developer — implements server-side code, APIs, models, and tests."""

    role: str = "backend_dev"
    display_name: str = "Backend Dev"
    system_prompt: str = BACKEND_DEV_SYSTEM_PROMPT
    llm_config: LLMConfig = LLMConfig(
        temperature=0.2,
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

    async def implement_task(self, task: str, architecture: str) -> AgentResult:
        """Implement a backend task based on the task description and architecture.

        Args:
            task: The story/task description including title, description,
                  acceptance criteria, and subtasks.
            architecture: The architecture document for reference (tech stack, DB schema, API design).

        Returns:
            AgentResult with content as DevCodeOutput.
        """
        self.output_schema = DevCodeOutput

        input_message = (
            f"[BACKEND IMPLEMENTATION TASK]\n\n"
            f"Task to implement:\n\"\"\"\n{task}\n\"\"\"\n\n"
            f"Architecture reference:\n\"\"\"\n{architecture}\n\"\"\"\n\n"
            f"Your task:\n"
            f"Implement the backend code for this task. Produce complete, runnable files.\n\n"
            f"Requirements:\n"
            f"1. Follow the architecture document for tech stack and conventions.\n"
            f"2. Create all necessary files: models, schemas, routes, services, migrations.\n"
            f"3. Use async/await for all database operations.\n"
            f"4. Add proper error handling with appropriate HTTP status codes.\n"
            f"5. Add Pydantic schemas for request/response validation.\n"
            f"6. Write at least one test file with tests for the happy path and error cases.\n"
            f"7. Include all imports; files must be self-contained.\n"
            f"8. Use type hints everywhere.\n\n"
            f"For each file, provide the full file path (relative to project root), "
            f"the complete content, and whether it is a 'create' or 'modify' operation.\n\n"
            f"Respond with a JSON object matching this schema:\n"
            f"{json.dumps(DevCodeOutput.model_json_schema(), indent=2)}"
        )

        return await self.run(input_message, phase="development")

    async def fix_issues(self, review_feedback: str, original_code: str) -> AgentResult:
        """Fix issues identified in a code review.

        Args:
            review_feedback: The code review output (comments, required changes).
            original_code: The original code that was reviewed.

        Returns:
            AgentResult with content as DevCodeOutput containing the fixed files.
        """
        self.output_schema = DevCodeOutput

        input_message = (
            f"[CODE FIX REQUEST]\n\n"
            f"The CTO reviewed your code and found issues that must be fixed.\n\n"
            f"Review feedback:\n\"\"\"\n{review_feedback}\n\"\"\"\n\n"
            f"Original code:\n\"\"\"\n{original_code}\n\"\"\"\n\n"
            f"Your task:\n"
            f"Fix ALL issues identified in the review. Specifically:\n"
            f"1. Address every 'critical' and 'high' severity comment.\n"
            f"2. Address 'medium' severity comments where feasible.\n"
            f"3. Implement all items in the 'required_changes' list.\n"
            f"4. Maintain existing functionality — do not break what already works.\n"
            f"5. Update or add tests to cover the fixed issues.\n"
            f"6. In your summary, explain what you changed and why for each fix.\n\n"
            f"Produce the COMPLETE updated files (not just diffs). "
            f"Use operation 'modify' for files that already exist.\n\n"
            f"Respond with a JSON object matching this schema:\n"
            f"{json.dumps(DevCodeOutput.model_json_schema(), indent=2)}"
        )

        return await self.run(input_message, phase="code_fix")
