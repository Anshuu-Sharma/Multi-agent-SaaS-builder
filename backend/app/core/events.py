from datetime import datetime, timezone
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, field_validator


class EventType(str, Enum):
    AGENT_OUTPUT = "agent.output"
    AGENT_ERROR = "agent.error"
    AGENT_STARTED = "agent.started"
    AGENT_COMPLETED = "agent.completed"
    GATE_SUBMITTED = "gate.submitted"
    GATE_REVIEWED = "gate.reviewed"
    STATE_CHANGED = "state.changed"
    TASK_UPDATED = "task.updated"
    BUDGET_ALERT = "budget.alert"
    MEETING_STARTED = "meeting.started"
    MEETING_ENDED = "meeting.ended"
    MESSAGE = "message"
    PROJECT_STARTED = "project.started"
    PROJECT_RETRIED = "project.retried"


class Event(BaseModel):
    type: EventType
    project_id: UUID
    source: str  # agent role or "system" or "ceo"
    payload: dict = {}
    timestamp: datetime | None = None

    def model_post_init(self, __context):
        if self.timestamp is None:
            self.timestamp = datetime.now(timezone.utc)
