"""Context service — builds the conversation context payload sent to agents.

Centralises the logic for selecting which documents, history, and project
metadata an agent needs for a given phase so that callers don't have to
replicate the selection logic.
"""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_message import AgentMessage
from app.models.document import Document
from app.models.project import Project

logger = logging.getLogger(__name__)

# Maps (agent_role, phase) to the document types that should be injected.
# A ``None`` key means "any phase not explicitly listed".
_ROLE_DOC_MAP: dict[str, dict[str | None, list[str]]] = {
    "cpo": {
        "discovery": [],
        "prd_creation": ["discovery"],
        None: ["prd_creation"],
    },
    "cto": {
        "architecture": ["prd_creation"],
        "sprint_planning": ["prd_creation", "architecture"],
        "code_review": ["architecture", "sprint_planning"],
        None: ["prd_creation", "architecture"],
    },
    "cfo": {
        "budget": ["prd_creation", "architecture"],
        None: ["prd_creation", "architecture"],
    },
    "backend_dev": {
        "development": ["architecture", "sprint_planning"],
        None: ["architecture", "sprint_planning"],
    },
    "frontend_dev": {
        "development": ["architecture", "sprint_planning"],
        None: ["architecture", "sprint_planning"],
    },
    "qa": {
        "qa_testing": ["prd_creation", "architecture", "sprint_planning"],
        None: ["prd_creation", "architecture"],
    },
}

# Default history window per agent call
_DEFAULT_HISTORY_LIMIT = 10


class ContextService:
    """Builds the list of context messages injected before the agent's
    actual user prompt.
    """

    @staticmethod
    async def build_agent_context(
        db: AsyncSession,
        project_id: uuid.UUID,
        agent_role: str,
        phase: str,
        *,
        history_limit: int = _DEFAULT_HISTORY_LIMIT,
    ) -> list[dict]:
        """Return a list of ``{"role": "user"|"model", "content": "..."}``
        messages that form the context window for an agent call.

        The returned list contains, in order:

        1. **Project brief** — always included.
        2. **Relevant documents** — selected by role and phase.
        3. **Recent conversation history** — the last N messages for this
           agent in the current phase.
        """
        messages: list[dict] = []

        # ---- 1. Project brief ----------------------------------------
        project = await _get_project(db, project_id)
        messages.append({
            "role": "user",
            "content": (
                f"[PROJECT CONTEXT]\n"
                f"Project: {project.name}\n"
                f"Brief: {project.brief}\n"
                f"Current State: {project.state}"
            ),
        })
        messages.append({
            "role": "model",
            "content": "Understood. I have the project context.",
        })

        # ---- 2. Relevant documents -----------------------------------
        doc_types = _resolve_doc_types(agent_role, phase)
        if doc_types:
            docs = await _get_latest_documents(db, project_id, doc_types)
            if docs:
                doc_text = "\n\n---\n\n".join(
                    f"[{doc.doc_type.upper()}] {doc.title}:\n{doc.content}"
                    for doc in docs
                )
                messages.append({
                    "role": "user",
                    "content": f"[RELEVANT DOCUMENTS]\n{doc_text}",
                })
                messages.append({
                    "role": "model",
                    "content": "I've reviewed the relevant documents.",
                })

        # ---- 3. Recent conversation history --------------------------
        history = await _get_recent_messages(
            db, project_id, agent_role, phase, limit=history_limit
        )
        for msg in history:
            role = "user" if msg.direction == "inbound" else "model"
            messages.append({"role": role, "content": msg.content})

        return messages


# ======================================================================
# Internal helpers
# ======================================================================

def _resolve_doc_types(agent_role: str, phase: str) -> list[str]:
    """Determine which document types are relevant for this role + phase."""
    role_map = _ROLE_DOC_MAP.get(agent_role, {})
    # Try exact phase match first, then fall back to the default (None key)
    doc_types = role_map.get(phase)
    if doc_types is None:
        doc_types = role_map.get(None, [])
    return doc_types


async def _get_project(db: AsyncSession, project_id: uuid.UUID) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    return result.scalar_one()


async def _get_latest_documents(
    db: AsyncSession,
    project_id: uuid.UUID,
    doc_types: list[str],
) -> list[Document]:
    """Return the most recent document of each requested type."""
    result = await db.execute(
        select(Document)
        .where(Document.project_id == project_id)
        .where(Document.doc_type.in_(doc_types))
        .order_by(Document.created_at.desc())
    )
    seen: dict[str, Document] = {}
    for doc in result.scalars().all():
        if doc.doc_type not in seen:
            seen[doc.doc_type] = doc
    # Return in a stable order matching the requested types
    return [seen[dt] for dt in doc_types if dt in seen]


async def _get_recent_messages(
    db: AsyncSession,
    project_id: uuid.UUID,
    agent_role: str,
    phase: str,
    limit: int,
) -> list[AgentMessage]:
    """Return the last *limit* messages for this agent+phase, oldest first."""
    result = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.project_id == project_id)
        .where(AgentMessage.agent_role == agent_role)
        .where(AgentMessage.phase == phase)
        .order_by(AgentMessage.created_at.desc())
        .limit(limit)
    )
    messages = list(result.scalars().all())
    messages.reverse()
    return messages
