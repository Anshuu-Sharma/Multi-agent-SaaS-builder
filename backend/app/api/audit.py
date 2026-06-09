"""Audit log API routes."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_api_key
from app.database import get_db
from app.models.audit import AuditLog

router = APIRouter(
    prefix="/api/projects/{project_id}/audit", tags=["audit"],
    dependencies=[Depends(require_api_key)],
)


@router.get("")
async def get_audit_log(
    project_id: uuid.UUID,
    action: str | None = None,
    actor: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(AuditLog)
        .where(AuditLog.project_id == project_id)
    )
    if action:
        query = query.where(AuditLog.action == action)
    if actor:
        query = query.where(AuditLog.actor == actor)

    query = query.order_by(AuditLog.created_at.desc()).limit(limit)
    result = await db.execute(query)
    entries = list(result.scalars().all())

    return [
        {
            "id": str(e.id),
            "actor": e.actor,
            "action": e.action,
            "entity_type": e.entity_type,
            "entity_id": str(e.entity_id) if e.entity_id else None,
            "details": e.details,
            "created_at": e.created_at.isoformat(),
        }
        for e in entries
    ]
