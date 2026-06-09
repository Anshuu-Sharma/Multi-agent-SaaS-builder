"""Manages approval gates — the hard checkpoints where humans must approve."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gate import ApprovalGate
from app.models.audit import AuditLog

GATE_DEFINITIONS = {
    "gate_1_prd": {"number": 1, "name": "CEO approves PRD", "artifact_type": "prd"},
    "gate_1_arch": {"number": 5, "name": "CEO approves architecture", "artifact_type": "architecture"},
    "gate_2_arch_budget": {"number": 2, "name": "CEO approves budget", "artifact_type": "budget"},
    "gate_3_uat": {"number": 3, "name": "CPO accepts features (UAT)", "artifact_type": "feature"},
    "gate_4_release": {"number": 4, "name": "CEO approves release", "artifact_type": "release"},
}


class GateManager:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def submit_gate(
        self,
        project_id: uuid.UUID,
        gate_key: str,
        artifact_id: uuid.UUID,
        submitted_by: str,
    ) -> ApprovalGate:
        defn = GATE_DEFINITIONS[gate_key]
        gate = ApprovalGate(
            project_id=project_id,
            gate_number=defn["number"],
            gate_name=defn["name"],
            artifact_type=defn["artifact_type"],
            artifact_id=artifact_id,
            submitted_by=submitted_by,
            status="pending",
        )
        self.db.add(gate)

        # Audit
        self.db.add(AuditLog(
            project_id=project_id,
            actor=submitted_by,
            action="gate.submitted",
            entity_type="gate",
            entity_id=gate.id,
            details={"gate_key": gate_key, "gate_name": defn["name"]},
        ))
        await self.db.flush()
        return gate

    async def review_gate(
        self,
        gate_id: uuid.UUID,
        project_id: uuid.UUID,
        action: str,  # "approve" or "reject"
        reviewer: str,
        notes: str = "",
    ) -> ApprovalGate:
        result = await self.db.execute(
            select(ApprovalGate)
            .where(ApprovalGate.id == gate_id)
            .where(ApprovalGate.project_id == project_id)
        )
        gate = result.scalar_one_or_none()
        if not gate:
            raise ValueError(f"Gate {gate_id} not found for project {project_id}")

        # Idempotency guard: reject if gate is already reviewed
        if gate.status != "pending":
            raise ValueError(f"Gate {gate_id} is already {gate.status}, cannot review again")

        gate.status = "approved" if action == "approve" else "rejected"
        gate.reviewed_by = reviewer
        gate.review_notes = notes
        gate.reviewed_at = datetime.now(timezone.utc)

        # Audit
        self.db.add(AuditLog(
            project_id=gate.project_id,
            actor=reviewer,
            action=f"gate.{action}d",
            entity_type="gate",
            entity_id=gate.id,
            details={"notes": notes},
        ))
        await self.db.flush()
        return gate

    async def get_pending_gates(self, project_id: uuid.UUID) -> list[ApprovalGate]:
        result = await self.db.execute(
            select(ApprovalGate)
            .where(ApprovalGate.project_id == project_id)
            .where(ApprovalGate.status == "pending")
            .order_by(ApprovalGate.gate_number)
        )
        return list(result.scalars().all())

    async def is_gate_approved(self, project_id: uuid.UUID, gate_key: str) -> bool:
        defn = GATE_DEFINITIONS[gate_key]
        result = await self.db.execute(
            select(ApprovalGate)
            .where(ApprovalGate.project_id == project_id)
            .where(ApprovalGate.gate_number == defn["number"])
            .where(ApprovalGate.status == "approved")
        )
        return result.scalar_one_or_none() is not None
