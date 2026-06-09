"""Meeting API routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_api_key
from app.database import get_db
from app.models.meeting import Meeting
from app.schemas.meeting import MeetingCreate, MeetingRead

router = APIRouter(
    prefix="/api/projects/{project_id}/meetings", tags=["meetings"],
    dependencies=[Depends(require_api_key)],
)


@router.get("", response_model=list[MeetingRead])
async def list_meetings(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Meeting)
        .where(Meeting.project_id == project_id)
        .order_by(Meeting.started_at.desc())
    )
    return list(result.scalars().all())


@router.get("/{meeting_id}", response_model=MeetingRead)
async def get_meeting(
    project_id: uuid.UUID, meeting_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Meeting)
        .where(Meeting.id == meeting_id)
        .where(Meeting.project_id == project_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    return meeting


@router.get("/{meeting_id}/transcript")
async def get_meeting_transcript(
    project_id: uuid.UUID, meeting_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Meeting)
        .where(Meeting.id == meeting_id)
        .where(Meeting.project_id == project_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(404, "Meeting not found")

    return {
        "meeting_type": meeting.meeting_type,
        "participants": meeting.participants,
        "transcript": meeting.transcript,
        "decisions": meeting.decisions,
        "action_items": meeting.action_items,
    }
