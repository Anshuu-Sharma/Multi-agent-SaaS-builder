"""Project CRUD and lifecycle API routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.auth import require_api_key
from app.core.events import Event, EventType
from app.core.redis import redis_client
from app.database import get_db
from app.models.budget import Budget
from app.models.gate import ApprovalGate
from app.models.project import Project, ProjectAgent
from app.models.task import Task
from app.schemas.project import AgentStatusRead, ProjectCreate, ProjectDetail, ProjectRead

router = APIRouter(
    prefix="/api/projects", tags=["projects"],
    dependencies=[Depends(require_api_key)],
)


@router.post("", response_model=ProjectRead, status_code=201)
async def create_project(body: ProjectCreate, db: AsyncSession = Depends(get_db)):
    project = Project(name=body.name, brief=body.brief, config=body.config)
    db.add(project)
    await db.flush()  # Flush to get project.id

    # Create default budget
    budget = Budget(
        project_id=project.id,
        total_budget_cents=body.config.get("budget_cents", 5000),
    )
    db.add(budget)
    await db.flush()
    return project


@router.get("", response_model=list[ProjectRead])
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).order_by(Project.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project)
        .options(selectinload(Project.agents))
        .where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    # Get pending gates count
    gates_result = await db.execute(
        select(func.count())
        .select_from(ApprovalGate)
        .where(ApprovalGate.project_id == project_id)
        .where(ApprovalGate.status == "pending")
    )
    pending_gates = gates_result.scalar() or 0

    # Get task summary
    tasks_result = await db.execute(
        select(Task.status, func.count())
        .where(Task.project_id == project_id)
        .group_by(Task.status)
    )
    task_summary = {status: count for status, count in tasks_result.all()}

    # Get budget summary
    budget_result = await db.execute(
        select(Budget).where(Budget.project_id == project_id)
    )
    budget = budget_result.scalar_one_or_none()
    budget_summary = {}
    if budget:
        budget_summary = {
            "total_cents": budget.total_budget_cents,
            "spent_cents": budget.spent_cents,
            "remaining_cents": budget.total_budget_cents - budget.spent_cents,
            "alert_level": budget.alert_level,
        }

    return ProjectDetail(
        id=project.id,
        name=project.name,
        brief=project.brief,
        state=project.state,
        config=project.config,
        created_at=project.created_at,
        agents=[AgentStatusRead.model_validate(a) for a in project.agents],
        pending_gates=pending_gates,
        task_summary=task_summary,
        budget_summary=budget_summary,
    )


@router.post("/{project_id}/start")
async def start_project(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Kick off the project orchestration."""
    # Use SELECT FOR UPDATE to prevent two concurrent POSTs from both starting the project
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .with_for_update()
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.state != "briefing":
        raise HTTPException(400, f"Project is in state '{project.state}', expected 'briefing'")

    # Publish project started event
    await redis_client.publish_event(Event(
        type=EventType.PROJECT_STARTED,
        project_id=project_id,
        source="ceo",
        payload={"brief": project.brief},
    ))

    return {"status": "started", "project_id": str(project_id)}

@router.post("/{project_id}/retry")
async def retry_project(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Retry a failed project."""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id)
        .with_for_update()
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if project.state != "failed":
        raise HTTPException(400, f"Project is in state '{project.state}', can only retry 'failed' projects")

    await redis_client.publish_event(Event(
        type=EventType.PROJECT_RETRIED,
        project_id=project_id,
        source="ceo",
        payload={},
    ))

    return {"status": "retried", "project_id": str(project_id)}
