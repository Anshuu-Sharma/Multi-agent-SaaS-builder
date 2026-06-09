from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    brief: str
    config: dict = {}


class ProjectRead(BaseModel):
    id: UUID
    name: str
    brief: str
    state: str
    config: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectDetail(ProjectRead):
    agents: list["AgentStatusRead"] = []
    pending_gates: int = 0
    task_summary: dict = {}
    budget_summary: dict = {}


class AgentStatusRead(BaseModel):
    role: str
    status: str
    current_task_id: UUID | None = None
    token_usage_total: int = 0
    cost_total_cents: int = 0

    model_config = {"from_attributes": True}


class StateTransitionRead(BaseModel):
    from_state: str
    to_state: str
    triggered_by: str
    reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
