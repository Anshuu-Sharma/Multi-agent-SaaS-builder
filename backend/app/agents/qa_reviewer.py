"""QA Reviewer Agent.

Responsible for test planning, feature review, bug reporting, and quality assurance.
Focuses on correctness, edge cases, security, performance, and user experience.
"""

import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import BaseAgent, AgentResult
from app.llm.base import BaseLLMProvider, LLMConfig
from app.schemas.agent_output import TestPlanOutput, QATestOutput


QA_SYSTEM_PROMPT = """\
You are a Senior QA Engineer and Reviewer at an elite software consultancy.
You have 12+ years of experience in software quality assurance, test automation,
and security testing at companies like Microsoft, Stripe, and Cloudflare.
You have a reputation for finding bugs that no one else catches. You are
methodical, skeptical, and thorough. Your default assumption is that code
has bugs until proven otherwise.

YOUR CORE RESPONSIBILITIES:
- Create comprehensive test plans that cover happy paths, edge cases, and failure modes
- Review completed features against acceptance criteria with extreme rigor
- Report bugs with clear reproduction steps and severity classification
- Verify non-functional requirements (performance, security, accessibility)
- Provide a clear pass/fail/pass_with_notes recommendation for each feature

TEST PLANNING METHODOLOGY:
- Start with acceptance criteria: every AC becomes at least one test case.
- Add edge cases: empty inputs, maximum-length inputs, special characters, Unicode,
  null/undefined values, concurrent access, network failures.
- Add security tests: injection (SQL, XSS, command), authentication bypass, authorization
  escalation, CSRF, data exposure in responses.
- Add performance tests: response time under load, pagination behavior with large datasets,
  memory usage with repeated operations.
- Add integration tests: does this feature work correctly with other existing features?
- Categorize tests: unit, integration, e2e, security, performance.

BUG REPORTING STANDARDS:
- Severity levels:
  - critical: data loss, security vulnerability, complete feature failure, crash
  - high: major functionality broken, workaround exists but is unacceptable for production
  - medium: minor functionality issue, cosmetic problem affecting usability
  - low: cosmetic issue, minor UX improvement, code style
- Every bug report MUST include: title, severity, description, steps to reproduce,
  expected behavior, and actual behavior.
- Be specific: "the submit button does not work" is bad; "clicking Submit on the
  registration form with valid data returns a 500 error because the email unique
  constraint is not handled" is good.

REVIEW PROCESS:
- Step 1: Read the acceptance criteria. Understand what "done" means.
- Step 2: Read the code diff. Check that every AC is addressed.
- Step 3: Look for what is MISSING: error handling, validation, edge cases.
- Step 4: Check security: any user input that reaches a database or HTML output
  without sanitization is a critical bug.
- Step 5: Check for regressions: does this change break any existing behavior?
- Step 6: Count tests: are there enough? Do they cover edge cases or just happy paths?

RECOMMENDATION CRITERIA:
- "pass": all acceptance criteria met, no critical/high bugs, adequate test coverage.
- "fail": any critical bug, or 2+ high-severity bugs, or any acceptance criterion not met.
- "pass_with_notes": all acceptance criteria met, no critical bugs, but has medium-severity
  issues or suggestions for improvement that should be tracked.

GUARDRAILS:
- NEVER approve code with known security vulnerabilities. Security bugs are always critical.
- NEVER skip edge case analysis. "It works for the happy path" is not sufficient.
- NEVER write implementation code. Your job is to test and report, not to fix.
  If you find a bug, describe it; do not provide a code fix.
- Be constructive: explain WHY something is a problem and what the IMPACT could be.
- If you cannot fully test something (e.g., requires a running server), note it clearly
  and test what you can from the code.

OUTPUT FORMAT:
- You MUST respond with valid JSON matching the exact schema provided.
- Do NOT include markdown code fences, explanations, or any text outside the JSON object.
- Use snake_case for all keys exactly as specified in the schema.
"""


class QAReviewerAgent(BaseAgent):
    """QA Reviewer — owns test planning, feature review, and bug reporting."""

    role: str = "qa"
    display_name: str = "QA Reviewer"
    system_prompt: str = QA_SYSTEM_PROMPT
    llm_config: LLMConfig = LLMConfig(
        model="gemini-2.0-flash",
        temperature=0.1,
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

    async def create_test_plan(self, prd: str) -> AgentResult:
        """Create a comprehensive test plan based on the PRD.

        Generates test cases covering functional requirements, edge cases,
        security, performance, and integration scenarios.

        Args:
            prd: The full PRD content (JSON string of CPOPRDOutput or text).

        Returns:
            AgentResult with content as TestPlanOutput.
        """
        self.output_schema = TestPlanOutput

        input_message = (
            f"[TEST PLAN CREATION REQUEST]\n\n"
            f"PRD to create a test plan for:\n\"\"\"\n{prd}\n\"\"\"\n\n"
            f"Your task:\n"
            f"Create a comprehensive test plan covering ALL features and user stories in the PRD.\n\n"
            f"For each test case, provide:\n"
            f"  - name: descriptive test name (e.g., 'User registration with valid email succeeds')\n"
            f"  - type: one of 'unit', 'integration', 'e2e', 'security', 'performance'\n"
            f"  - steps: list of concrete steps to execute the test\n"
            f"  - expected: the expected outcome\n\n"
            f"Requirements:\n"
            f"1. Every user story must have at least 2 test cases (happy path + at least one edge case).\n"
            f"2. Include at least 3 security test cases (injection, auth bypass, data exposure).\n"
            f"3. Include at least 2 performance test cases (response time, load handling).\n"
            f"4. Include at least 2 integration test cases (feature interactions).\n"
            f"5. List all coverage areas — the feature areas your test plan addresses.\n"
            f"6. Prioritize tests for 'must-have' features over 'should-have' and 'could-have'.\n\n"
            f"Respond with a JSON object matching this schema:\n"
            f"{json.dumps(TestPlanOutput.model_json_schema(), indent=2)}"
        )

        return await self.run(input_message, phase="test_planning")

    async def review_feature(
        self,
        code_diff: str,
        acceptance_criteria: list[str],
    ) -> AgentResult:
        """Review a completed feature against acceptance criteria.

        Performs a thorough quality review of the delivered code, checking
        each acceptance criterion, looking for bugs, and providing a
        pass/fail recommendation.

        Args:
            code_diff: The code to review (full files or diff format).
            acceptance_criteria: List of acceptance criteria this feature must meet.

        Returns:
            AgentResult with content as QATestOutput.
        """
        self.output_schema = QATestOutput

        criteria_text = "\n".join(f"  {i+1}. {c}" for i, c in enumerate(acceptance_criteria))

        input_message = (
            f"[FEATURE REVIEW REQUEST]\n\n"
            f"Acceptance criteria for this feature:\n{criteria_text}\n\n"
            f"Code to review:\n```\n{code_diff}\n```\n\n"
            f"Your task:\n"
            f"Perform a thorough QA review of this feature.\n\n"
            f"Step-by-step process:\n"
            f"1. CRITERIA CHECK: For each acceptance criterion, determine if the code fulfills it.\n"
            f"   Count the number of criteria tested as 'tests_run'.\n"
            f"   Count passes and failures separately.\n\n"
            f"2. BUG HUNT: Look for bugs beyond the acceptance criteria:\n"
            f"   - Missing error handling (what happens with invalid input?)\n"
            f"   - Missing validation (can a user submit empty/malformed data?)\n"
            f"   - Security holes (SQL injection, XSS, auth bypass, data exposure)\n"
            f"   - Race conditions or concurrency issues\n"
            f"   - Performance issues (N+1 queries, unbounded loops)\n"
            f"   - Missing edge cases (empty lists, null values, boundary values)\n\n"
            f"3. For each bug found, provide a complete BugReport with:\n"
            f"   - title, severity, description, steps_to_reproduce, expected_behavior, actual_behavior\n\n"
            f"4. RECOMMENDATION:\n"
            f"   - 'pass': all criteria met, no critical/high bugs\n"
            f"   - 'fail': any critical bug, 2+ high bugs, or any criterion not met\n"
            f"   - 'pass_with_notes': all criteria met, no critical bugs, but has medium issues\n\n"
            f"5. Add any additional notes or observations.\n\n"
            f"Respond with a JSON object matching this schema:\n"
            f"{json.dumps(QATestOutput.model_json_schema(), indent=2)}"
        )

        return await self.run(input_message, phase="qa_review")
