"""Cost tracking service — records LLM costs, enforces budget thresholds, publishes alerts.

Centralizes all budget logic so agents and the orchestrator can call it
without duplicating threshold checks.
"""

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import Event, EventType
from app.core.redis import redis_client
from app.llm.base import LLMResponse
from app.models.budget import Budget, CostEntry

logger = logging.getLogger(__name__)

# Budget alert thresholds (ratio of spent / total)
THRESHOLD_WARNING = 0.60
THRESHOLD_CRITICAL = 0.80
THRESHOLD_ESCALATION = 0.95

ALERT_LEVELS = [
    (THRESHOLD_ESCALATION, "escalation"),
    (THRESHOLD_CRITICAL, "critical"),
    (THRESHOLD_WARNING, "warning"),
]


@dataclass
class CostSummary:
    total_budget_cents: int
    spent_cents: int
    remaining_cents: int
    utilisation_pct: float
    alert_level: str
    by_category: dict[str, int]
    by_agent: dict[str, int]


class CostTracker:
    """Tracks LLM and infra costs for a project, enforces budget thresholds."""

    # ------------------------------------------------------------------
    # Record a new cost entry and update the project budget
    # ------------------------------------------------------------------
    @staticmethod
    async def record_cost(
        db: AsyncSession,
        project_id: uuid.UUID,
        agent_role: str,
        llm_response: LLMResponse,
    ) -> CostEntry:
        """Save a CostEntry for an LLM call and update Budget totals.

        Returns the persisted CostEntry.
        """
        entry = CostEntry(
            project_id=project_id,
            category="llm",
            agent_role=agent_role,
            description=f"{agent_role} LLM call ({llm_response.model})",
            amount_cents=llm_response.cost_cents,
            token_count=llm_response.input_tokens + llm_response.output_tokens,
            model_used=llm_response.model,
        )
        db.add(entry)

        # Update the project-level budget row
        result = await db.execute(
            select(Budget).where(Budget.project_id == project_id)
        )
        budget = result.scalar_one_or_none()
        if budget is not None:
            budget.spent_cents += llm_response.cost_cents
            budget.llm_budget_cents += llm_response.cost_cents

        await db.flush()
        return entry

    # ------------------------------------------------------------------
    # Threshold checks — returns the current alert level after evaluation
    # ------------------------------------------------------------------
    @staticmethod
    async def check_thresholds(
        db: AsyncSession,
        project_id: uuid.UUID,
    ) -> str:
        """Evaluate budget thresholds. Updates the Budget row and publishes
        a ``BUDGET_ALERT`` event when a new threshold is crossed.

        Returns the current alert level (``"normal"`` if within budget).
        """
        result = await db.execute(
            select(Budget).where(Budget.project_id == project_id)
        )
        budget = result.scalar_one_or_none()
        if budget is None:
            return "normal"

        if budget.total_budget_cents <= 0:
            return "normal"

        ratio = budget.spent_cents / budget.total_budget_cents
        new_level = "normal"
        for threshold, level in ALERT_LEVELS:
            if ratio >= threshold:
                new_level = level
                break

        previous_level = budget.alert_level or "normal"
        if new_level != previous_level:
            budget.alert_level = new_level
            await db.flush()

            logger.warning(
                "Budget alert %s → %s for project %s (%.1f%%)",
                previous_level,
                new_level,
                project_id,
                ratio * 100,
            )

            # Publish event so the orchestrator and dashboard can react
            await redis_client.publish_event(
                Event(
                    type=EventType.BUDGET_ALERT,
                    project_id=project_id,
                    source="cost_tracker",
                    payload={
                        "level": new_level,
                        "previous_level": previous_level,
                        "spent_cents": budget.spent_cents,
                        "total_budget_cents": budget.total_budget_cents,
                        "utilisation_pct": round(ratio * 100, 2),
                    },
                )
            )

        return new_level

    # ------------------------------------------------------------------
    # Aggregated cost summary
    # ------------------------------------------------------------------
    @staticmethod
    async def get_project_costs(
        db: AsyncSession,
        project_id: uuid.UUID,
    ) -> CostSummary:
        """Return a full cost summary for a project, broken down by
        category and agent role.
        """
        # Fetch budget row
        result = await db.execute(
            select(Budget).where(Budget.project_id == project_id)
        )
        budget = result.scalar_one_or_none()

        total_budget = budget.total_budget_cents if budget else 0
        spent = budget.spent_cents if budget else 0
        alert = budget.alert_level if budget else "normal"

        # Breakdown by category
        cat_rows = await db.execute(
            select(CostEntry.category, func.sum(CostEntry.amount_cents))
            .where(CostEntry.project_id == project_id)
            .group_by(CostEntry.category)
        )
        by_category: dict[str, int] = {
            row[0]: int(row[1]) for row in cat_rows.all()
        }

        # Breakdown by agent role
        agent_rows = await db.execute(
            select(CostEntry.agent_role, func.sum(CostEntry.amount_cents))
            .where(CostEntry.project_id == project_id)
            .where(CostEntry.agent_role.isnot(None))
            .group_by(CostEntry.agent_role)
        )
        by_agent: dict[str, int] = {
            row[0]: int(row[1]) for row in agent_rows.all()
        }

        remaining = max(total_budget - spent, 0)
        utilisation = (spent / total_budget * 100) if total_budget > 0 else 0.0

        return CostSummary(
            total_budget_cents=total_budget,
            spent_cents=spent,
            remaining_cents=remaining,
            utilisation_pct=round(utilisation, 2),
            alert_level=alert,
            by_category=by_category,
            by_agent=by_agent,
        )

    # ------------------------------------------------------------------
    # Recent cost entries
    # ------------------------------------------------------------------
    @staticmethod
    async def get_cost_entries(
        db: AsyncSession,
        project_id: uuid.UUID,
        limit: int = 50,
    ) -> list[CostEntry]:
        """Return the most recent cost entries for a project."""
        result = await db.execute(
            select(CostEntry)
            .where(CostEntry.project_id == project_id)
            .order_by(CostEntry.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
