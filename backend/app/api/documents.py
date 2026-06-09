"""Document/artifact API routes."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_api_key
from app.database import get_db
from app.models.document import Document

router = APIRouter(
    prefix="/api/projects/{project_id}/documents", tags=["documents"],
    dependencies=[Depends(require_api_key)],
)


@router.get("")
async def list_documents(
    project_id: uuid.UUID,
    doc_type: str | None = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    query = select(Document).where(Document.project_id == project_id)
    if doc_type:
        query = query.where(Document.doc_type == doc_type)
    query = query.order_by(Document.created_at.desc()).limit(limit)
    result = await db.execute(query)
    docs = list(result.scalars().all())
    return [
        {
            "id": str(d.id),
            "doc_type": d.doc_type,
            "title": d.title,
            "content": d.content,
            "version": d.version,
            "status": d.status,
            "created_by": d.created_by,
            "created_at": d.created_at.isoformat(),
        }
        for d in docs
    ]


@router.get("/{doc_id}")
async def get_document(
    project_id: uuid.UUID,
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.project_id == project_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": str(doc.id),
        "doc_type": doc.doc_type,
        "title": doc.title,
        "content": doc.content,
        "version": doc.version,
        "status": doc.status,
        "created_by": doc.created_by,
        "created_at": doc.created_at.isoformat(),
    }
