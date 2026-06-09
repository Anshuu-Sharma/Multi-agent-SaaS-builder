"""File service — safe file I/O within project workspaces.

Every read/write is validated to ensure the resolved path stays inside the
project's workspace directory, preventing directory-traversal attacks.
"""

import logging
import os
import uuid
from dataclasses import dataclass
from pathlib import Path

from app.config import settings
from app.core.exceptions import WorkspaceSecurityError

logger = logging.getLogger(__name__)


@dataclass
class FileInfo:
    """Metadata about a single file in the workspace."""
    path: str       # relative to workspace root
    name: str
    size: int
    is_dir: bool


class FileService:
    """Safe file operations scoped to a project's workspace."""

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _workspace_for(project_id: uuid.UUID) -> Path:
        """Resolved workspace path for the given project."""
        return (Path(settings.workspace_root) / str(project_id)).resolve()

    @staticmethod
    def validate_path(project_id: uuid.UUID, file_path: str) -> Path:
        """Resolve *file_path* within the project workspace and ensure it
        does not escape.

        Returns the fully resolved ``Path``.

        Raises:
            WorkspaceSecurityError: if the resolved path is outside the
                project workspace.
        """
        workspace = FileService._workspace_for(project_id)
        # Join and resolve (collapses .., symlinks, etc.)
        target = (workspace / file_path).resolve()

        # The target must be the workspace itself or strictly inside it
        if target != workspace and not str(target).startswith(str(workspace) + os.sep):
            raise WorkspaceSecurityError(str(file_path))

        return target

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------
    @staticmethod
    def write_file(
        project_id: uuid.UUID,
        path: str,
        content: str,
    ) -> Path:
        """Write *content* to *path* inside the project workspace.

        Creates intermediate directories as needed.

        Returns the absolute ``Path`` of the written file.

        Raises:
            WorkspaceSecurityError: if *path* resolves outside the workspace.
        """
        target = FileService.validate_path(project_id, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        logger.debug("Wrote file %s for project %s", path, project_id)
        return target

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------
    @staticmethod
    def read_file(project_id: uuid.UUID, path: str) -> str:
        """Read and return the textual content of *path* within the
        project workspace.

        Raises:
            WorkspaceSecurityError: if *path* resolves outside the workspace.
            FileNotFoundError: if the file does not exist.
        """
        target = FileService.validate_path(project_id, path)
        if not target.is_file():
            raise FileNotFoundError(f"File not found: {path}")
        return target.read_text(encoding="utf-8")

    # ------------------------------------------------------------------
    # List
    # ------------------------------------------------------------------
    @staticmethod
    def list_files(project_id: uuid.UUID) -> list[FileInfo]:
        """Return a flat list of all files and directories in the project
        workspace (excluding ``.git``).

        Returns:
            Sorted list of ``FileInfo`` objects with paths relative to the
            workspace root.
        """
        workspace = FileService._workspace_for(project_id)
        if not workspace.is_dir():
            return []

        items: list[FileInfo] = []
        for root, dirs, filenames in os.walk(workspace):
            # Skip hidden VCS directories
            dirs[:] = [d for d in dirs if d != ".git"]

            for name in filenames:
                full = Path(root) / name
                rel = full.relative_to(workspace)
                items.append(
                    FileInfo(
                        path=str(rel),
                        name=name,
                        size=full.stat().st_size,
                        is_dir=False,
                    )
                )
            for name in dirs:
                full = Path(root) / name
                rel = full.relative_to(workspace)
                items.append(
                    FileInfo(
                        path=str(rel),
                        name=name,
                        size=0,
                        is_dir=True,
                    )
                )

        return sorted(items, key=lambda f: f.path)
