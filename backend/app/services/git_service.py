"""Git service — manages per-project workspaces with real Git repos.

Each project gets a directory under ``settings.workspace_root``.
All path operations are validated to prevent directory-traversal attacks.
"""

import logging
import os
import uuid
from dataclasses import dataclass
from pathlib import Path

from git import Repo
from git.exc import GitCommandError, InvalidGitRepositoryError

from app.config import settings
from app.core.exceptions import WorkspaceSecurityError
from app.schemas.agent_output import FileWrite

logger = logging.getLogger(__name__)


@dataclass
class DiffResult:
    """Structured representation of a git diff."""
    summary: str
    files_changed: int
    insertions: int
    deletions: int
    raw_diff: str


@dataclass
class FileNode:
    """Single node in a file tree listing."""
    path: str
    name: str
    is_dir: bool
    size: int = 0


class GitService:
    """Manages Git workspaces for MET projects."""

    @staticmethod
    def _sanitize_branch_name(branch_name: str) -> str:
        """Sanitise branch name: only allow alphanum, dash, underscore, slash, dot."""
        safe = "".join(c for c in branch_name if c.isalnum() or c in "-_/.")
        if not safe:
            safe = "main"
        return safe

    # ------------------------------------------------------------------
    # Path helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _workspace_root() -> Path:
        """Return the resolved workspace root directory."""
        return Path(settings.workspace_root).resolve()

    @staticmethod
    def _project_dir(project_id: uuid.UUID) -> Path:
        """Return the resolved directory for a specific project."""
        return GitService._workspace_root() / str(project_id)

    @staticmethod
    def _validate_path(workspace_path: Path, target: Path) -> Path:
        """Ensure *target* is strictly inside *workspace_path*.

        Raises ``WorkspaceSecurityError`` if the resolved target escapes
        the workspace.
        """
        resolved = target.resolve()
        workspace_resolved = workspace_path.resolve()
        if not str(resolved).startswith(str(workspace_resolved) + os.sep) and resolved != workspace_resolved:
            raise WorkspaceSecurityError(str(target))
        return resolved

    # ------------------------------------------------------------------
    # Workspace lifecycle
    # ------------------------------------------------------------------
    @staticmethod
    def init_workspace(project_id: uuid.UUID) -> Path:
        """Create a workspace directory and initialise a bare-bones Git repo.

        Returns the ``Path`` of the created workspace.
        """
        workspace = GitService._project_dir(project_id)
        workspace.mkdir(parents=True, exist_ok=True)

        try:
            Repo(workspace)
            logger.info("Workspace already initialised: %s", workspace)
        except InvalidGitRepositoryError:
            repo = Repo.init(workspace)
            # Create an initial empty commit so branches can be created
            repo.index.commit("Initial commit (workspace created)")
            logger.info("Workspace initialised: %s", workspace)

        return workspace

    # ------------------------------------------------------------------
    # Branch operations
    # ------------------------------------------------------------------
    @staticmethod
    def create_branch(workspace_path: Path, branch_name: str) -> str:
        """Create a new branch and check it out.

        Returns the name of the newly created branch.
        """
        GitService._validate_path(GitService._workspace_root(), workspace_path)
        repo = Repo(workspace_path)

        safe_name = GitService._sanitize_branch_name(branch_name)
        if safe_name == "main":
            safe_name = "feature/unnamed"

        if safe_name in [h.name for h in repo.heads]:
            repo.heads[safe_name].checkout()
        else:
            repo.create_head(safe_name).checkout()

        logger.info("Checked out branch '%s' in %s", safe_name, workspace_path)
        return safe_name

    # ------------------------------------------------------------------
    # File writing
    # ------------------------------------------------------------------
    @staticmethod
    def write_files(workspace_path: Path, files: list[FileWrite]) -> list[str]:
        """Write a batch of files into the workspace.

        Each ``FileWrite`` contains *path* (relative to workspace) and
        *content*.  Returns a list of relative paths that were written.
        """
        GitService._validate_path(GitService._workspace_root(), workspace_path)
        written: list[str] = []

        for fw in files:
            # Construct full target path and validate it
            target = (workspace_path / fw.path).resolve()
            GitService._validate_path(workspace_path, target)

            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(fw.content, encoding="utf-8")
            written.append(fw.path)
            logger.debug("Wrote file: %s", fw.path)

        logger.info(
            "Wrote %d file(s) to workspace %s", len(written), workspace_path
        )
        return written

    # ------------------------------------------------------------------
    # Commit
    # ------------------------------------------------------------------
    @staticmethod
    def commit(
        workspace_path: Path,
        message: str,
        author: str = "MET Agent",
    ) -> str:
        """Stage all changes and create a commit.

        Returns the short SHA of the new commit.
        """
        GitService._validate_path(GitService._workspace_root(), workspace_path)
        repo = Repo(workspace_path)

        # Stage everything
        repo.git.add(A=True)

        if not repo.is_dirty(index=True, working_tree=False, untracked_files=False):
            logger.info("Nothing to commit in %s", workspace_path)
            return repo.head.commit.hexsha[:8]

        commit = repo.index.commit(
            message,
            author=f"{author} <{author.lower().replace(' ', '.')}@met.local>",
        )
        short_sha = commit.hexsha[:8]
        logger.info("Committed %s in %s: %s", short_sha, workspace_path, message)
        return short_sha

    # ------------------------------------------------------------------
    # Diff
    # ------------------------------------------------------------------
    @staticmethod
    def get_diff(workspace_path: Path, branch: str = "main") -> DiffResult:
        """Return the diff of the current HEAD against *branch*.

        If *branch* does not exist, returns the diff of the last commit.
        """
        GitService._validate_path(GitService._workspace_root(), workspace_path)
        repo = Repo(workspace_path)
        branch = GitService._sanitize_branch_name(branch)

        try:
            if branch in [h.name for h in repo.heads]:
                raw = repo.git.diff(branch, "HEAD")
                stat = repo.git.diff(branch, "HEAD", stat=True)
            else:
                # Fallback: diff of last commit
                raw = repo.git.diff("HEAD~1", "HEAD")
                stat = repo.git.diff("HEAD~1", "HEAD", stat=True)
        except GitCommandError:
            raw = ""
            stat = ""

        # Parse stat line (e.g. "3 files changed, 45 insertions(+), 2 deletions(-)")
        files_changed = insertions = deletions = 0
        for line in stat.splitlines():
            line_lower = line.strip().lower()
            if "file" in line_lower and "changed" in line_lower:
                parts = line_lower.split(",")
                for part in parts:
                    part = part.strip()
                    if "file" in part:
                        files_changed = int("".join(c for c in part if c.isdigit()) or 0)
                    elif "insertion" in part:
                        insertions = int("".join(c for c in part if c.isdigit()) or 0)
                    elif "deletion" in part:
                        deletions = int("".join(c for c in part if c.isdigit()) or 0)

        return DiffResult(
            summary=stat,
            files_changed=files_changed,
            insertions=insertions,
            deletions=deletions,
            raw_diff=raw,
        )

    # ------------------------------------------------------------------
    # Merge
    # ------------------------------------------------------------------
    @staticmethod
    def merge_branch(workspace_path: Path, branch: str) -> str:
        """Merge *branch* into the current HEAD (fast-forward preferred).

        Returns the resulting HEAD short SHA.
        """
        GitService._validate_path(GitService._workspace_root(), workspace_path)
        repo = Repo(workspace_path)
        branch = GitService._sanitize_branch_name(branch)

        try:
            repo.git.merge(branch)
        except GitCommandError as exc:
            logger.error("Merge failed for branch '%s': %s", branch, exc)
            raise

        short_sha = repo.head.commit.hexsha[:8]
        logger.info("Merged '%s' → HEAD (%s) in %s", branch, short_sha, workspace_path)
        return short_sha

    # ------------------------------------------------------------------
    # List files
    # ------------------------------------------------------------------
    @staticmethod
    def list_files(workspace_path: Path) -> list[FileNode]:
        """Return a flat listing of all files in the workspace (excluding ``.git``)."""
        GitService._validate_path(GitService._workspace_root(), workspace_path)
        nodes: list[FileNode] = []

        for root, dirs, filenames in os.walk(workspace_path):
            # Skip .git internals
            dirs[:] = [d for d in dirs if d != ".git"]
            for name in filenames:
                full = Path(root) / name
                rel = full.relative_to(workspace_path)
                nodes.append(
                    FileNode(
                        path=str(rel),
                        name=name,
                        is_dir=False,
                        size=full.stat().st_size,
                    )
                )
            for name in dirs:
                full = Path(root) / name
                rel = full.relative_to(workspace_path)
                nodes.append(
                    FileNode(
                        path=str(rel),
                        name=name,
                        is_dir=True,
                    )
                )

        return sorted(nodes, key=lambda n: n.path)
