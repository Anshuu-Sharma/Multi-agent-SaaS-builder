from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class MeetingRead(BaseModel):
    id: UUID
    project_id: UUID
    meeting_type: str
    participants: list[str]
    agenda: dict
    transcript: list
    decisions: list
    action_items: list
    token_usage: int | None
    cost_cents: int | None
    started_at: datetime
    ended_at: datetime | None

    model_config = {"from_attributes": True}


class MeetingCreate(BaseModel):
    meeting_type: str
    agenda_topics: list[str] = []
