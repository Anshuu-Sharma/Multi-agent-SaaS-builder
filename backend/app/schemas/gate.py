from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class GateRead(BaseModel):
    id: UUID
    project_id: UUID
    gate_number: int
    gate_name: str
    status: str
    artifact_type: str | None
    artifact_id: UUID | None
    submitted_by: str | None
    reviewed_by: str | None
    review_notes: str | None
    created_at: datetime
    reviewed_at: datetime | None

    model_config = {"from_attributes": True}


class GateReview(BaseModel):
    action: Literal["approve", "reject"]
    notes: str = ""
