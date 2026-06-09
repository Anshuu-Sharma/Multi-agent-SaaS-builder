"""Approval gate API routes — the human-in-the-loop interface."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_api_key
from app.core.events import Event, EventType
from app.core.redis import redis_client
from app.database import get_db
from app.models.document import Document
from app.models.gate import ApprovalGate
from app.orchestrator.gate_manager import GateManager, GATE_DEFINITIONS
from app.schemas.gate import GateRead, GateReview

router = APIRouter(
    prefix="/api/projects/{project_id}/gates", tags=["gates"],
    dependencies=[Depends(require_api_key)],
)


@router.get("", response_model=list[GateRead])
async def list_gates(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ApprovalGate)
        .where(ApprovalGate.project_id == project_id)
        .order_by(ApprovalGate.gate_number)
    )
    return list(result.scalars().all())


@router.get("/pending", response_model=list[GateRead])
async def get_pending_gates(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    gate_mgr = GateManager(db)
    return await gate_mgr.get_pending_gates(project_id)


@router.get("/{gate_id}", response_model=GateRead)
async def get_gate(
    project_id: uuid.UUID, gate_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ApprovalGate)
        .where(ApprovalGate.id == gate_id)
        .where(ApprovalGate.project_id == project_id)
    )
    gate = result.scalar_one_or_none()
    if not gate:
        raise HTTPException(404, "Gate not found")
    return gate


@router.get("/{gate_id}/artifact")
async def get_gate_artifact(
    project_id: uuid.UUID, gate_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    """Get the document/artifact associated with a gate for review."""
    result = await db.execute(
        select(ApprovalGate)
        .where(ApprovalGate.id == gate_id)
        .where(ApprovalGate.project_id == project_id)
    )
    gate = result.scalar_one_or_none()
    if not gate or not gate.artifact_id:
        raise HTTPException(404, "Gate or artifact not found")

    doc_result = await db.execute(
        select(Document).where(Document.id == gate.artifact_id)
    )
    doc = doc_result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Artifact document not found")

    return {
        "gate": GateRead.model_validate(gate),
        "artifact": {
            "id": str(doc.id),
            "type": doc.doc_type,
            "title": doc.title,
            "content": doc.content,
            "created_by": doc.created_by,
            "created_at": doc.created_at.isoformat(),
        },
    }


@router.post("/{gate_id}/review", response_model=GateRead)
async def review_gate(
    project_id: uuid.UUID,
    gate_id: uuid.UUID,
    body: GateReview,
    db: AsyncSession = Depends(get_db),
):
    """CEO approves or rejects a gate."""
    gate_mgr = GateManager(db)
    try:
        gate = await gate_mgr.review_gate(
            gate_id=gate_id,
            project_id=project_id,
            action=body.action,
            reviewer="ceo",
            notes=body.notes,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    # Find the gate key from the gate number
    gate_key = None
    for key, defn in GATE_DEFINITIONS.items():
        if defn["number"] == gate.gate_number:
            gate_key = key
            break

    if gate_key is None:
        raise HTTPException(status_code=500, detail=f"Unknown gate number: {gate.gate_number}")

    # Publish gate reviewed event → orchestrator handles next steps
    await redis_client.publish_event(Event(
        type=EventType.GATE_REVIEWED,
        project_id=project_id,
        source="ceo",
        payload={
            "gate_id": str(gate_id),
            "gate_key": gate_key,
            "action": body.action,
            "notes": body.notes,
        },
    ))

    return gate
