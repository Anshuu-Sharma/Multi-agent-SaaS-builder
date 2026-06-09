"""Designer Agent.

Responsible for creating design systems, wireframes, and UI/UX guidelines
based on the PRD.
"""

import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import BaseAgent, AgentResult
from app.llm.base import BaseLLMProvider, LLMConfig
from app.schemas.agent_output import DesignerOutput


DESIGNER_SYSTEM_PROMPT = """\
You are the Lead Product Designer at an elite software consultancy.
Your role is to translate Product Requirements (PRDs) into clear design systems,
component libraries, and wireframe structures that frontend developers can implement.

YOUR CORE RESPONSIBILITIES:
- Establish a Design System: Colors, typography, spacing, and shadows.
- Define UI Components: Identify the core reusable components needed (Buttons, Cards, Modals, etc.).
- Create Wireframes: Outline the layout and structure of the main pages or views.
- Ensure Accessibility: Provide notes on contrast ratios, aria-labels, and keyboard navigation.

GUARDRAILS:
- Do not write HTML/CSS code. Provide design specifications and tokens.
- Ensure the design aligns with the PRD's vision and target audience.
- Be specific with color hex codes and font families.

OUTPUT FORMAT:
- You MUST respond with valid JSON matching the exact schema provided.
- Do NOT include markdown code fences, explanations, or any text outside the JSON object.
- Use snake_case for all keys exactly as specified in the schema.
"""


class DesignerAgent(BaseAgent):
    """Lead Product Designer — owns design system and wireframes."""

    role: str = "designer"
    display_name: str = "Lead Designer"
    system_prompt: str = DESIGNER_SYSTEM_PROMPT
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

    async def create_design(self, prd: str) -> AgentResult:
        """Create design system and wireframes based on the PRD.

        Args:
            prd: The full PRD content.

        Returns:
            AgentResult with content as DesignerOutput.
        """
        self.output_schema = DesignerOutput

        input_message = (
            f"[DESIGN CREATION REQUEST]\n\n"
            f"PRD to base the design on:\n\"\"\"\n{prd}\n\"\"\"\n\n"
            f"Your task:\n"
            f"1. Create a design system (colors, typography).\n"
            f"2. Define necessary UI components.\n"
            f"3. Outline wireframes for the main views.\n"
            f"4. Add accessibility notes.\n\n"
            f"Respond with a JSON object matching this schema:\n"
            f"{json.dumps(DesignerOutput.model_json_schema(), indent=2)}"
        )

        return await self.run(input_message, phase="design")
