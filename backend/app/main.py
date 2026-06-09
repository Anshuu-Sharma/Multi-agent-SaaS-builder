"""MET System — Multi-Agent Executive Team API."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.redis import redis_client
from app.llm.gemini import GeminiProvider
from app.orchestrator.engine import OrchestratorEngine
from app.orchestrator.agent_manager import agent_manager

# Import agent classes for registration
from app.agents.cpo import CPOAgent
from app.agents.designer import DesignerAgent
from app.agents.cto import CTOAgent
from app.agents.cfo import CFOAgent
from app.agents.backend_dev import BackendDevAgent
from app.agents.frontend_dev import FrontendDevAgent
from app.agents.qa_reviewer import QAReviewerAgent

# Import API routers
from app.api.projects import router as projects_router
from app.api.gates import router as gates_router
from app.api.tasks import router as tasks_router
from app.api.agents import router as agents_router
from app.api.meetings import router as meetings_router
from app.api.budget import router as budget_router
from app.api.audit import router as audit_router
from app.api.websocket import router as ws_router
from app.api.files import router as files_router
from app.api.documents import router as documents_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# Global orchestrator reference
orchestrator: OrchestratorEngine | None = None
orchestrator_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global orchestrator, orchestrator_task

    # Connect Redis
    await redis_client.connect()
    logger.info("Redis connected")

    # Register agents
    agent_manager.register_agent("cpo", CPOAgent)
    agent_manager.register_agent("designer", DesignerAgent)
    agent_manager.register_agent("cto", CTOAgent)
    agent_manager.register_agent("cfo", CFOAgent)
    agent_manager.register_agent("backend_dev", BackendDevAgent)
    agent_manager.register_agent("frontend_dev", FrontendDevAgent)
    agent_manager.register_agent("qa", QAReviewerAgent)
    logger.info("Agents registered: cpo, designer, cto, cfo, backend_dev, frontend_dev, qa")

    # Start orchestrator
    llm = GeminiProvider()
    orchestrator = OrchestratorEngine(llm_provider=llm)
    orchestrator_task = asyncio.create_task(orchestrator.start_listening())
    logger.info("Orchestrator started")

    yield

    # Shutdown
    if orchestrator:
        await orchestrator.stop()
    if orchestrator_task:
        orchestrator_task.cancel()
    await redis_client.disconnect()
    logger.info("Shutdown complete")


app = FastAPI(
    title="MET System",
    description="Multi-Agent Executive Team — AI agents that plan and build software",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(projects_router)
app.include_router(gates_router)
app.include_router(tasks_router)
app.include_router(agents_router)
app.include_router(meetings_router)
app.include_router(budget_router)
app.include_router(audit_router)
app.include_router(ws_router)
app.include_router(files_router)
app.include_router(documents_router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "met-system"}


@app.get("/api/status")
async def system_status():
    return {
        "orchestrator": "running" if orchestrator_task and not orchestrator_task.done() else "stopped",
        "redis": "connected",
        "agents_registered": list(agent_manager._agents.keys()),
    }
