from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TaskCreate(BaseModel):
    project_id: UUID
    parent_id: UUID | None = None
    task_type: str  # epic, feature, story, subtask
    title: str
    description: str | None = None
    acceptance_criteria: str | None = None
    priority: str = "medium"
    assigned_to: str | None = None
    estimated_hours: float | None = None


class TaskRead(BaseModel):
    id: UUID
    project_id: UUID
    parent_id: UUID | None
    task_type: str
    title: str
    description: str | None
    acceptance_criteria: str | None
    status: str
    priority: str
    assigned_to: str | None
    estimated_hours: float | None
    actual_hours: float | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskUpdate(BaseModel):
    status: str | None = None
    assigned_to: str | None = None
    actual_hours: float | None = None
    description: str | None = None


class TaskWithChildren(TaskRead):
    children: list["TaskRead"] = []
    blocked_by_ids: list[UUID] = []
    blocks_ids: list[UUID] = []
