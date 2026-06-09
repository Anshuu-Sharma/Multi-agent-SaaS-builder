"""Budget and cost tracking API routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_api_key
from app.database import get_db
from app.models.budget import Budget, CostEntry

router = APIRouter(
    prefix="/api/projects/{project_id}/budget", tags=["budget"],
    dependencies=[Depends(require_api_key)],
)


@router.get("")
async def get_budget(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Budget).where(Budget.project_id == project_id)
    )
    budget = result.scalar_one_or_none()
    if not budget:
        raise HTTPException(404, "Budget not found")

    return {
        "total_budget_cents": budget.total_budget_cents,
        "spent_cents": budget.spent_cents,
        "remaining_cents": budget.total_budget_cents - budget.spent_cents,
        "utilization_pct": round(budget.spent_cents / budget.total_budget_cents * 100, 1) if budget.total_budget_cents > 0 else 0,
        "alert_level": budget.alert_level,
        "breakdown": {
            "llm": budget.llm_budget_cents,
            "infrastructure": budget.infra_budget_cents,
            "third_party": budget.third_party_budget_cents,
        },
    }


@router.get("/costs")
async def get_cost_entries(
    project_id: uuid.UUID, limit: int = 50, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(CostEntry)
        .where(CostEntry.project_id == project_id)
        .order_by(CostEntry.created_at.desc())
        .limit(limit)
    )
    entries = list(result.scalars().all())

    return [
        {
            "id": str(e.id),
            "category": e.category,
            "agent_role": e.agent_role,
            "description": e.description,
            "amount_cents": e.amount_cents,
            "token_count": e.token_count,
            "model_used": e.model_used,
            "created_at": e.created_at.isoformat(),
        }
        for e in entries
    ]


@router.get("/by-agent")
async def get_costs_by_agent(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(
            CostEntry.agent_role,
            func.sum(CostEntry.amount_cents).label("total_cents"),
            func.sum(CostEntry.token_count).label("total_tokens"),
            func.count().label("call_count"),
        )
        .where(CostEntry.project_id == project_id)
        .group_by(CostEntry.agent_role)
    )
    return [
        {
            "agent_role": row.agent_role,
            "total_cents": row.total_cents or 0,
            "total_tokens": row.total_tokens or 0,
            "call_count": row.call_count,
        }
        for row in result.all()
    ]
