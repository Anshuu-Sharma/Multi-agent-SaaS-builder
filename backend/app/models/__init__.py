import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# Import all models so Alembic can detect them
from app.models.project import Project, StateTransition, ProjectAgent  # noqa: E402, F401
from app.models.agent_message import AgentMessage  # noqa: E402, F401
from app.models.gate import ApprovalGate  # noqa: E402, F401
from app.models.task import Task, TaskDependency  # noqa: E402, F401
from app.models.document import Document  # noqa: E402, F401
from app.models.meeting import Meeting  # noqa: E402, F401
from app.models.budget import Budget, CostEntry  # noqa: E402, F401
from app.models.bug import Bug  # noqa: E402, F401
from app.models.audit import AuditLog  # noqa: E402, F401
