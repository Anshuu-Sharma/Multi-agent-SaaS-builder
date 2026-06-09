"""Agent status and activity API routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_api_key
from app.database import get_db
from app.models.agent_message import AgentMessage
from app.models.project import ProjectAgent
from app.schemas.project import AgentStatusRead

router = APIRouter(
    prefix="/api/projects/{project_id}/agents", tags=["agents"],
    dependencies=[Depends(require_api_key)],
)


@router.get("", response_model=list[AgentStatusRead])
async def list_agents(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ProjectAgent)
        .where(ProjectAgent.project_id == project_id)
        .order_by(ProjectAgent.role)
    )
    return list(result.scalars().all())


@router.get("/{role}/messages")
async def get_agent_messages(
    project_id: uuid.UUID,
    role: str,
    phase: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(AgentMessage)
        .where(AgentMessage.project_id == project_id)
        .where(AgentMessage.agent_role == role)
    )
    if phase:
        query = query.where(AgentMessage.phase == phase)

    query = query.order_by(AgentMessage.created_at.desc()).limit(limit)
    result = await db.execute(query)
    messages = list(result.scalars().all())
    messages.reverse()  # Return oldest first

    return [
        {
            "id": str(m.id),
            "role": m.agent_role,
            "phase": m.phase,
            "direction": m.direction,
            "content": m.content,
            "message_type": m.message_type,
            "metadata": m.metadata_,
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]


@router.get("/{role}/activity")
async def get_agent_activity(
    project_id: uuid.UUID, role: str, db: AsyncSession = Depends(get_db)
):
    """Get a summary of an agent's activity."""
    # Agent status
    result = await db.execute(
        select(ProjectAgent)
        .where(ProjectAgent.project_id == project_id)
        .where(ProjectAgent.role == role)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, f"Agent '{role}' not found for this project")

    # Recent messages
    msg_result = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.project_id == project_id)
        .where(AgentMessage.agent_role == role)
        .order_by(AgentMessage.created_at.desc())
        .limit(10)
    )
    recent_messages = list(msg_result.scalars().all())

    return {
        "role": agent.role,
        "status": agent.status,
        "token_usage_total": agent.token_usage_total,
        "cost_total_cents": agent.cost_total_cents,
        "recent_messages": [
            {
                "phase": m.phase,
                "direction": m.direction,
                "content": m.content[:200] + "..." if len(m.content) > 200 else m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in reversed(recent_messages)
        ],
    }
