import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    meeting_type: Mapped[str] = mapped_column(String(50), nullable=False)
    participants: Mapped[list] = mapped_column(ARRAY(String(50)), nullable=False)
    agenda: Mapped[dict] = mapped_column(JSONB, nullable=False)
    transcript: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)
    decisions: Mapped[dict] = mapped_column(JSONB, default=list)
    action_items: Mapped[dict] = mapped_column(JSONB, default=list)
    token_usage: Mapped[int | None] = mapped_column(Integer)
    cost_cents: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    project = relationship("Project", back_populates="meetings")
