"""Task ledger API routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_api_key
from app.database import get_db
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate, TaskWithChildren

router = APIRouter(
    prefix="/api/projects/{project_id}/tasks", tags=["tasks"],
    dependencies=[Depends(require_api_key)],
)


@router.get("", response_model=list[TaskRead])
async def list_tasks(
    project_id: uuid.UUID,
    status: str | None = None,
    task_type: str | None = None,
    assigned_to: str | None = None,
    parent_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Task).where(Task.project_id == project_id)
    if status:
        query = query.where(Task.status == status)
    if task_type:
        query = query.where(Task.task_type == task_type)
    if assigned_to:
        query = query.where(Task.assigned_to == assigned_to)
    if parent_id:
        query = query.where(Task.parent_id == parent_id)
    else:
        # Default: only top-level tasks (epics)
        query = query.where(Task.parent_id.is_(None))

    query = query.order_by(Task.sort_order, Task.created_at)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/tree", response_model=list[TaskWithChildren])
async def get_task_tree(project_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get full task hierarchy (epics with nested features, stories, subtasks)."""
    # Get all tasks for project
    result = await db.execute(
        select(Task)
        .where(Task.project_id == project_id)
        .order_by(Task.sort_order, Task.created_at)
    )
    all_tasks = list(result.scalars().all())

    # Build tree
    tasks_by_id = {t.id: t for t in all_tasks}
    children_map: dict[uuid.UUID | None, list[Task]] = {}
    for t in all_tasks:
        children_map.setdefault(t.parent_id, []).append(t)

    # Return top-level (epics) with children
    epics = children_map.get(None, [])
    tree = []
    for epic in epics:
        tree.append(TaskWithChildren(
            **TaskRead.model_validate(epic).model_dump(),
            children=[TaskRead.model_validate(c) for c in children_map.get(epic.id, [])],
        ))
    return tree


@router.get("/{task_id}", response_model=TaskWithChildren)
async def get_task(
    project_id: uuid.UUID, task_id: uuid.UUID, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        .where(Task.project_id == project_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")

    # Get children
    children_result = await db.execute(
        select(Task)
        .where(Task.parent_id == task_id)
        .order_by(Task.sort_order)
    )
    children = list(children_result.scalars().all())

    # Get dependency IDs
    blocked_by_ids = [dep.id for dep in task.blocked_by] if hasattr(task, 'blocked_by') and task.blocked_by else []
    blocks_ids = [dep.id for dep in task.blocks] if hasattr(task, 'blocks') and task.blocks else []

    return TaskWithChildren(
        **TaskRead.model_validate(task).model_dump(),
        children=[TaskRead.model_validate(c) for c in children],
        blocked_by_ids=blocked_by_ids,
        blocks_ids=blocks_ids,
    )


@router.post("", response_model=TaskRead, status_code=201)
async def create_task(
    project_id: uuid.UUID, body: TaskCreate, db: AsyncSession = Depends(get_db)
):
    task = Task(
        project_id=project_id,
        parent_id=body.parent_id,
        task_type=body.task_type,
        title=body.title,
        description=body.description,
        acceptance_criteria=body.acceptance_criteria,
        priority=body.priority,
        assigned_to=body.assigned_to,
        estimated_hours=body.estimated_hours,
    )
    db.add(task)
    await db.flush()
    return task


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Task)
        .where(Task.id == task_id)
        .where(Task.project_id == project_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)

    await db.flush()
    return task
