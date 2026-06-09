"""Workspace file browsing API — exposes project workspace files to the frontend."""

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.file_service import FileService

router = APIRouter(prefix="/api/projects/{project_id}/files", tags=["files"])


class FileInfoResponse(BaseModel):
    path: str
    name: str
    size: int
    is_dir: bool


@router.get("", response_model=list[FileInfoResponse])
async def list_files(project_id: uuid.UUID):
    """List all files in the project workspace."""
    files = FileService.list_files(project_id)
    return [FileInfoResponse(path=f.path, name=f.name, size=f.size, is_dir=f.is_dir) for f in files]


@router.get("/{file_path:path}")
async def read_file(project_id: uuid.UUID, file_path: str):
    """Read a single file's content from the project workspace."""
    try:
        content = FileService.read_file(project_id, file_path)
        return {"path": file_path, "content": content}
    except FileNotFoundError:
        raise HTTPException(404, f"File not found: {file_path}")
