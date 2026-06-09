"""CFO (Chief Financial Officer) Agent.

Responsible for budget estimation, cost tracking, and financial reporting.
Hybrid approach: calculations are done in code, narratives are generated via LLM.
"""

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import BaseAgent, AgentResult
from app.llm.base import BaseLLMProvider, LLMConfig
from app.models.budget import Budget, CostEntry
from app.schemas.agent_output import CFOBudgetOutput


CFO_SYSTEM_PROMPT = """\
You are the Chief Financial Officer (CFO) of an elite software consultancy.
You have 15+ years of experience managing budgets for software projects at
companies like McKinsey Digital, Accenture, and Thoughtworks. You bring
financial discipline to engineering projects without stifling innovation.

YOUR CORE RESPONSIBILITIES:
- Budget estimation: translate architecture and PRD into realistic cost projections
- Cost tracking: monitor actual spend against budget and raise alerts early
- Financial reporting: produce clear, executive-friendly summaries of project financials
- ROI analysis: help the team understand the cost-benefit tradeoff of technical decisions

BUDGET ESTIMATION RULES:
- LLM costs: estimate based on expected call volume, average token count, and model pricing.
  Use these reference rates (per 1M tokens):
    - gemini-2.0-flash input: $0.10, output: $0.40
    - gemini-2.0-flash-lite input: $0.025, output: $0.10
  Convert dollar amounts to cents for all output fields.
- Infrastructure costs: estimate hosting, database, CDN, monitoring based on the architecture.
- Development costs: estimate based on task hours and a blended rate (default $50/hour for
  time-equivalent if you need a reference, but focus on LLM + infra for automated projects).
- Always include a 15-20% contingency buffer.
- Break down costs by category: llm, infrastructure, third_party, contingency.
- State your assumptions explicitly. Every number must trace to a stated assumption.

REPORTING RULES:
- Reports should be clear to non-technical stakeholders.
- Always include: total budget, spent to date, remaining, burn rate, projected overrun (if any).
- Flag risks: if spend is trending above budget, say so clearly with a recommended action.
- Use plain language, not jargon. "We have spent 60% of the LLM budget with 40% of features
  delivered" is better than "Token utilization is at 60% of allocated capacity."

GUARDRAILS:
- NEVER make product decisions. Defer feature questions to the CPO.
- NEVER make technical decisions. Defer architecture questions to the CTO.
- Be conservative in estimates. It is better to over-budget by 20% than under-budget by 5%.
- Always express monetary amounts in cents (integer) to avoid floating-point issues.
- If you lack data to estimate a category, state the assumption and use a reasonable default.

OUTPUT FORMAT:
- For budget creation: respond with valid JSON matching the exact schema provided.
- For reports: respond with a well-structured plain-text report.
- Do NOT include markdown code fences, explanations, or any text outside the required format.
"""


# ---------- Cost calculation constants (cents) ----------
# Per 1M tokens
_MODEL_COSTS = {
    "gemini-2.0-flash": {"input": 10, "output": 40},  # cents per 1M tokens
    "gemini-2.0-flash-lite": {"input": 2.5, "output": 10},
}

# Default assumptions when no architecture detail is available
_DEFAULT_MONTHLY_INFRA_CENTS = 2000  # $20/month baseline (hobby tier hosting)
_CONTINGENCY_RATE = 0.15


class CFOAgent(BaseAgent):
    """Chief Financial Officer — owns budgeting, cost tracking, and financial reporting."""

    role: str = "cfo"
    display_name: str = "CFO"
    system_prompt: str = CFO_SYSTEM_PROMPT
    llm_config: LLMConfig = LLMConfig(
        model="gemini-2.0-flash",
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

    # ------------------------------------------------------------------
    # Internal helpers: deterministic calculations done in code
    # ------------------------------------------------------------------

    def _estimate_llm_cost_cents(
        self,
        num_agent_calls: int,
        avg_input_tokens: int = 4000,
        avg_output_tokens: int = 2000,
        model: str = "gemini-2.0-flash",
    ) -> int:
        """Estimate total LLM cost in cents for a batch of calls."""
        rates = _MODEL_COSTS.get(model, _MODEL_COSTS["gemini-2.0-flash"])
        input_cost = (num_agent_calls * avg_input_tokens / 1_000_000) * rates["input"]
        output_cost = (num_agent_calls * avg_output_tokens / 1_000_000) * rates["output"]
        return int((input_cost + output_cost) * 100)  # dollars to cents

    def _apply_contingency(self, total_cents: int) -> int:
        """Add contingency buffer."""
        return int(total_cents * (1 + _CONTINGENCY_RATE))

    async def _get_actual_costs(self) -> dict:
        """Fetch actual cost data from the database for this project."""
        result = await self.db.execute(
            select(CostEntry)
            .where(CostEntry.project_id == self.project_id)
            .order_by(CostEntry.created_at.asc())
        )
        entries = result.scalars().all()

        by_category: dict[str, int] = {}
        by_agent: dict[str, int] = {}
        total = 0
        for entry in entries:
            by_category[entry.category] = by_category.get(entry.category, 0) + entry.amount_cents
            by_agent[entry.agent_role] = by_agent.get(entry.agent_role, 0) + entry.amount_cents
            total += entry.amount_cents

        budget_result = await self.db.execute(
            select(Budget).where(Budget.project_id == self.project_id)
        )
        budget = budget_result.scalar_one_or_none()

        return {
            "total_spent_cents": total,
            "by_category": by_category,
            "by_agent": by_agent,
            "budget_total_cents": budget.total_budget_cents if budget else 0,
            "budget_remaining_cents": (budget.total_budget_cents - budget.spent_cents) if budget else 0,
            "alert_level": budget.alert_level if budget else "none",
            "entry_count": len(entries),
        }

    # ------------------------------------------------------------------
    # Public agent methods
    # ------------------------------------------------------------------

    async def create_budget(self, prd: str, architecture: str) -> AgentResult:
        """Create a budget estimate based on the PRD and architecture.

        Uses a hybrid approach:
        - Deterministic calculations for LLM token cost estimates
        - LLM for infrastructure sizing, narrative assumptions, and recommendations

        Args:
            prd: The full PRD content.
            architecture: The full architecture document.

        Returns:
            AgentResult with content as CFOBudgetOutput.
        """
        self.output_schema = CFOBudgetOutput

        # Pre-calculate LLM cost estimate to feed into the LLM prompt
        # Rough estimate: ~50 agent calls for a small project, ~150 for a medium one
        estimated_calls_low = 50
        estimated_calls_high = 150
        llm_cost_low = self._estimate_llm_cost_cents(estimated_calls_low)
        llm_cost_high = self._estimate_llm_cost_cents(estimated_calls_high)

        input_message = (
            f"[BUDGET CREATION REQUEST]\n\n"
            f"PRD:\n\"\"\"\n{prd}\n\"\"\"\n\n"
            f"Architecture:\n\"\"\"\n{architecture}\n\"\"\"\n\n"
            f"PRE-CALCULATED ESTIMATES (use these as anchors):\n"
            f"- LLM cost range: {llm_cost_low}-{llm_cost_high} cents "
            f"({llm_cost_low/100:.2f}-{llm_cost_high/100:.2f} USD)\n"
            f"  Based on {estimated_calls_low}-{estimated_calls_high} agent calls, "
            f"avg 4000 input + 2000 output tokens, gemini-2.0-flash pricing.\n"
            f"- Baseline monthly infra: {_DEFAULT_MONTHLY_INFRA_CENTS} cents "
            f"({_DEFAULT_MONTHLY_INFRA_CENTS/100:.2f} USD/month)\n"
            f"- Contingency rate: {_CONTINGENCY_RATE*100:.0f}%\n\n"
            f"Your task:\n"
            f"1. Estimate total project cost in cents. Use the pre-calculated LLM estimates as "
            f"a starting point, then add infrastructure, third-party services, and contingency.\n"
            f"2. Provide a breakdown by category. Required categories: 'llm', 'infrastructure', "
            f"'third_party', 'contingency'. Values in cents.\n"
            f"3. List all assumptions you made (at least 3).\n"
            f"4. List financial risks (e.g., 'If user traffic exceeds 10K/day, DB costs increase 3x').\n"
            f"5. Provide actionable recommendations to control costs.\n"
            f"6. Include monthly_runway: how many months can the project run at current burn rate.\n\n"
            f"All monetary amounts MUST be in cents (integers, no decimals).\n\n"
            f"Respond with a JSON object matching this schema:\n"
            f"{json.dumps(CFOBudgetOutput.model_json_schema(), indent=2)}"
        )

        return await self.run(input_message, phase="budget")

    async def generate_report(self, costs_data: dict | None = None) -> AgentResult:
        """Generate a financial status report.

        If costs_data is not provided, fetches actual data from the database.

        Args:
            costs_data: Optional pre-computed cost data dict. If None, queries the DB.

        Returns:
            AgentResult with content as plain text report.
        """
        self.output_schema = None  # Free-form text report

        if costs_data is None:
            costs_data = await self._get_actual_costs()

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

        input_message = (
            f"[FINANCIAL REPORT REQUEST]\n\n"
            f"Report date: {now}\n\n"
            f"Actual cost data:\n"
            f"{json.dumps(costs_data, indent=2)}\n\n"
            f"Your task:\n"
            f"Generate a clear, executive-friendly financial status report. Include:\n\n"
            f"1. EXECUTIVE SUMMARY: 2-3 sentences on overall financial health.\n"
            f"2. BUDGET vs ACTUAL: total budget, total spent, remaining, percentage used.\n"
            f"3. BREAKDOWN BY CATEGORY: how much was spent in each category.\n"
            f"4. BREAKDOWN BY AGENT: which agents are consuming the most resources.\n"
            f"5. BURN RATE: current daily/weekly spend rate and projected total at this rate.\n"
            f"6. RISK ASSESSMENT: any flags based on alert_level or overspend trends.\n"
            f"7. RECOMMENDATIONS: 2-3 actionable suggestions to optimize costs.\n\n"
            f"Write in plain language suitable for a non-technical stakeholder.\n"
            f"Use actual numbers from the data provided. Do not invent figures.\n"
            f"Format as a clean text report with section headers."
        )

        # Switch to text mode for narrative report
        original_format = self.llm_config.response_format
        self.llm_config = self.llm_config.model_copy(
            update={"response_format": "text"}
        )
        try:
            return await self.run(input_message, phase="reporting")
        finally:
            self.llm_config = self.llm_config.model_copy(
                update={"response_format": original_format}
            )
