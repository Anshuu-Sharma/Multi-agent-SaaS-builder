"""CPO (Chief Product Officer) Agent.

Responsible for product discovery, PRD creation, feature prioritization,
and user acceptance testing. Uses MoSCoW prioritization and user-centric thinking.
"""

import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import BaseAgent, AgentResult
from app.llm.base import BaseLLMProvider, LLMConfig
from app.schemas.agent_output import CPODiscoveryOutput, CPOPRDOutput


CPO_SYSTEM_PROMPT = """\
You are the Chief Product Officer (CPO) of an elite software consultancy.
You are a seasoned product leader with 15+ years of experience shipping products
at companies like Stripe, Figma, and Notion. Your role is to translate vague ideas
into clear, actionable product requirements that engineering teams can build.

YOUR CORE RESPONSIBILITIES:
- Product discovery: ask the RIGHT clarifying questions to understand the problem space
- User persona identification: define who the users are and what they care about
- Feature prioritization using MoSCoW (Must-have, Should-have, Could-have, Won't-have)
- Writing clear user stories in the format "As a [persona], I want [action], so that [outcome]"
- Defining measurable acceptance criteria for every user story
- Competitive analysis: understand the landscape and identify differentiation
- Success metrics: define KPIs that matter (not vanity metrics)
- UI/UX direction: provide high-level guidance on user experience

PRIORITIZATION RULES:
- Must-have: features without which the product has no viable launch
- Should-have: important features that significantly increase value but can be deferred 1 sprint
- Could-have: nice-to-have features for post-MVP polish
- Won't-have (this time): explicitly out of scope to prevent scope creep

GUARDRAILS:
- NEVER suggest specific technical implementations. That is the CTO's domain.
- ALWAYS ground features in user needs, not technical curiosity.
- Keep scope realistic: an MVP should be buildable in 2-4 sprints.
- Every feature MUST trace back to at least one user story.
- Every user story MUST have at least 2 acceptance criteria.
- If the brief is ambiguous, ask questions FIRST rather than making assumptions.
- Be opinionated: recommend what to cut, not just what to add.

OUTPUT FORMAT:
- You MUST respond with valid JSON matching the exact schema provided.
- Do NOT include markdown code fences, explanations, or any text outside the JSON object.
- If a field expects a list, always provide at least one item.
- Use snake_case for all keys exactly as specified in the schema.
"""


class CPOAgent(BaseAgent):
    """Chief Product Officer — owns product vision, PRD, and acceptance."""

    role: str = "cpo"
    display_name: str = "CPO"
    system_prompt: str = CPO_SYSTEM_PROMPT
    llm_config: LLMConfig = LLMConfig(
        model="gemini-2.0-flash",
        temperature=0.7,
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

    async def discover(self, brief: str) -> AgentResult:
        """Run product discovery on a raw project brief.

        Produces clarifying questions, initial personas, competitive analysis,
        and recommended success metrics.

        Args:
            brief: The raw project brief or idea description from the user.

        Returns:
            AgentResult with content as CPODiscoveryOutput.
        """
        self.output_schema = CPODiscoveryOutput

        input_message = (
            f"[PRODUCT DISCOVERY REQUEST]\n\n"
            f"The client has submitted the following project brief:\n\n"
            f'"""\n{brief}\n"""\n\n'
            f"Your task:\n"
            f"1. Generate 5-10 clarifying questions that will help refine this idea. "
            f"Focus on target audience, core pain points, existing alternatives, and constraints.\n"
            f"2. Propose 2-4 initial user personas based on what you can infer.\n"
            f"3. Provide a brief competitive analysis (who else solves this problem and how).\n"
            f"4. Suggest 3-6 measurable success metrics (e.g., 'Time to first value < 5 minutes').\n\n"
            f"Respond with a JSON object matching this schema:\n"
            f"{json.dumps(CPODiscoveryOutput.model_json_schema(), indent=2)}"
        )

        return await self.run(input_message, phase="discovery")

    async def create_prd(
        self,
        brief: str,
        answers: dict[str, str] | None = None,
        feedback: str | None = None,
    ) -> AgentResult:
        """Create a full PRD from the brief, discovery answers, and any feedback.

        Args:
            brief: The original project brief.
            answers: Optional dict of question -> answer from discovery phase.
            feedback: Optional human feedback to incorporate.

        Returns:
            AgentResult with content as CPOPRDOutput.
        """
        self.output_schema = CPOPRDOutput

        sections = [
            f"[PRD CREATION REQUEST]\n\n"
            f"Original brief:\n\"\"\"\n{brief}\n\"\"\"\n"
        ]

        if answers:
            qa_text = "\n".join(f"Q: {q}\nA: {a}" for q, a in answers.items())
            sections.append(
                f"Discovery answers from the client:\n\"\"\"\n{qa_text}\n\"\"\"\n"
            )

        if feedback:
            sections.append(
                f"Additional feedback / direction:\n\"\"\"\n{feedback}\n\"\"\"\n"
            )

        sections.append(
            f"Your task:\n"
            f"Create a comprehensive Product Requirements Document. Include:\n"
            f"1. Product vision (1-2 sentences, inspiring and specific)\n"
            f"2. Goals (3-5 measurable goals)\n"
            f"3. User stories with MoSCoW priorities and acceptance criteria\n"
            f"4. Features organized by priority\n"
            f"5. Non-functional requirements (performance, security, accessibility)\n"
            f"6. Success metrics with targets\n"
            f"7. UI/UX notes (key interactions, design principles)\n\n"
            f"Every feature MUST have at least one user story reference.\n"
            f"Use MoSCoW: must-have, should-have, could-have, wont-have.\n"
            f"Aim for 6-12 user stories covering the core experience.\n\n"
            f"Respond with a JSON object matching this schema:\n"
            f"{json.dumps(CPOPRDOutput.model_json_schema(), indent=2)}"
        )

        input_message = "\n\n".join(sections)
        return await self.run(input_message, phase="prd_creation")

    async def accept_feature(
        self,
        feature_summary: str,
        acceptance_criteria: list[str],
    ) -> AgentResult:
        """Run User Acceptance Testing on a completed feature.

        Evaluates whether the delivered feature meets the acceptance criteria
        defined in the PRD.

        Args:
            feature_summary: Summary of what was built, including code/diff references.
            acceptance_criteria: List of acceptance criteria to verify against.

        Returns:
            AgentResult with content as raw text (pass/fail with reasoning).
        """
        self.output_schema = None  # Free-form text for UAT

        criteria_text = "\n".join(f"  - {c}" for c in acceptance_criteria)

        input_message = (
            f"[USER ACCEPTANCE TEST]\n\n"
            f"Feature delivered:\n\"\"\"\n{feature_summary}\n\"\"\"\n\n"
            f"Acceptance criteria to verify:\n{criteria_text}\n\n"
            f"Your task:\n"
            f"1. Evaluate each acceptance criterion — does the delivered feature meet it? "
            f"Mark each as PASS or FAIL with a brief explanation.\n"
            f"2. Provide an overall verdict: ACCEPTED or REJECTED.\n"
            f"3. If REJECTED, list the specific criteria that failed and what needs to change.\n"
            f"4. If ACCEPTED, note any minor improvements for a future iteration.\n\n"
            f"Be rigorous but fair. A feature can pass even if it has minor polish issues, "
            f"as long as all acceptance criteria are met."
        )

        # Switch to text mode for UAT
        original_format = self.llm_config.response_format
        self.llm_config = self.llm_config.model_copy(
            update={"response_format": "text"}
        )
        try:
            return await self.run(input_message, phase="uat")
        finally:
            self.llm_config = self.llm_config.model_copy(
                update={"response_format": original_format}
            )
