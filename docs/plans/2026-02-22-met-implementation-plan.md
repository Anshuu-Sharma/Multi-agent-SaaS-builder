# MET System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a multi-agent executive team system where AI agents (CEO, CPO, CTO, CFO, Backend Dev, Frontend Dev, QA) collaborate to plan and build software projects from a brief.

**Architecture:** FastAPI backend with asyncio-based agent orchestration, PostgreSQL for all state, Redis for pub/sub messaging, Next.js frontend dashboard. Agents are stateful LLM conversations with Gemini API (configurable). Deterministic orchestrator manages state machine and approval gates.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Redis, PostgreSQL, Google Gemini API, Next.js 15, React, Tailwind CSS, shadcn/ui, Docker Compose

**Design Doc:** `docs/plans/2026-02-22-met-system-design.md`

---

## Phase 1: Project Scaffolding & Database

### Task 1: Project structure and Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`

**Step 1: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: met
      POSTGRES_USER: met
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-metdev}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      - postgres
      - redis
    volumes:
      - ./backend:/app
      - ./workspaces:/workspaces

volumes:
  pgdata:
```

**Step 2: Create backend/pyproject.toml**

```toml
[project]
name = "met-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "sqlalchemy[asyncio]>=2.0.36",
    "asyncpg>=0.30.0",
    "alembic>=1.14.0",
    "redis>=5.2.0",
    "pydantic>=2.10.0",
    "pydantic-settings>=2.7.0",
    "google-genai>=1.0.0",
    "httpx>=0.28.0",
    "python-dotenv>=1.0.0",
    "gitpython>=3.1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.24.0",
    "pytest-cov>=6.0.0",
    "httpx>=0.28.0",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

**Step 3: Create backend/app/config.py**

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://met:metdev@localhost:5432/met"
    redis_url: str = "redis://localhost:6379/0"
    gemini_api_key: str = ""
    default_llm_model: str = "gemini-2.0-flash"
    workspace_root: str = "/workspaces"
    cors_origins: list[str] = ["http://localhost:3000"]
    max_project_budget_cents: int = 5000
    max_per_call_cents: int = 50

    model_config = {"env_file": ".env", "env_prefix": "MET_"}


settings = Settings()
```

**Step 4: Create backend/app/main.py (minimal)**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

app = FastAPI(title="MET System", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}
```

**Step 5: Create .env.example, .gitignore, Dockerfile**

`.env.example`:
```
MET_DATABASE_URL=postgresql+asyncpg://met:metdev@localhost:5432/met
MET_REDIS_URL=redis://localhost:6379/0
MET_GEMINI_API_KEY=your-key-here
```

**Step 6: Verify services start**

Run: `docker compose up -d postgres redis`
Run: `cd backend && pip install -e ".[dev]" && uvicorn app.main:app --reload`
Run: `curl http://localhost:8000/health`
Expected: `{"status":"ok"}`

**Step 7: Commit**
```bash
git add -A && git commit -m "chore: project scaffolding — Docker Compose, FastAPI, config"
```

---

### Task 2: Database engine and Alembic setup

**Files:**
- Create: `backend/app/database.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`

**Step 1: Create backend/app/database.py**

```python
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

**Step 2: Initialize Alembic**

Run: `cd backend && alembic init alembic`

**Step 3: Configure alembic env.py for async**

Update `backend/alembic/env.py` to use async engine and import all models from `app.models`.

**Step 4: Commit**
```bash
git add -A && git commit -m "feat: database engine and Alembic setup"
```

---

### Task 3: SQLAlchemy ORM models

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/project.py`
- Create: `backend/app/models/task.py`
- Create: `backend/app/models/document.py`
- Create: `backend/app/models/meeting.py`
- Create: `backend/app/models/budget.py`
- Create: `backend/app/models/bug.py`
- Create: `backend/app/models/audit.py`

**Step 1: Create base model**

`backend/app/models/__init__.py`:
```python
from sqlalchemy.orm import DeclarativeBase
import uuid
from sqlalchemy import Column, DateTime, func
from sqlalchemy.dialects.postgresql import UUID


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

**Step 2: Create each model file** matching the schema from the design doc (Section 2). Each model maps directly to the SQL tables defined there. Key models:

- `Project`: id, name, brief, state, config (JSONB)
- `StateTransition`: from_state, to_state, triggered_by, reason
- `ProjectAgent`: project_id, role, status, token_usage_total, cost_total_cents
- `AgentMessage`: project_id, agent_role, phase, direction, content, message_type, metadata
- `ApprovalGate`: gate_number, gate_name, status, artifact_type, artifact_id
- `Task`: parent_id (self-referential), task_type, title, status, priority, assigned_to
- `TaskDependency`: task_id, depends_on
- `Document`: doc_type, title, content, version, status, created_by
- `Meeting`: meeting_type, participants, agenda, transcript, decisions, action_items
- `Budget`: total_budget_cents, spent_cents, breakdown by category, alert_level
- `CostEntry`: category, agent_role, amount_cents, token_count, model_used
- `Bug`: severity, status, steps_to_reproduce, expected/actual behavior
- `AuditLog`: actor, action, entity_type, entity_id, details

**Step 3: Generate migration**

Run: `cd backend && alembic revision --autogenerate -m "initial schema"`
Run: `alembic upgrade head`

**Step 4: Commit**
```bash
git add -A && git commit -m "feat: SQLAlchemy ORM models + initial migration"
```

---

### Task 4: Pydantic schemas for API and agent output validation

**Files:**
- Create: `backend/app/schemas/__init__.py`
- Create: `backend/app/schemas/project.py`
- Create: `backend/app/schemas/task.py`
- Create: `backend/app/schemas/agent_output.py`
- Create: `backend/app/schemas/gate.py`
- Create: `backend/app/schemas/meeting.py`

**Step 1: Create project schemas**

```python
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str
    brief: str
    config: dict = {}


class ProjectRead(BaseModel):
    id: UUID
    name: str
    brief: str
    state: str
    config: dict
    created_at: datetime

    model_config = {"from_attributes": True}
```

**Step 2: Create agent output schemas** — These are critical. Every agent output is validated.

```python
# backend/app/schemas/agent_output.py

class CPODiscoveryOutput(BaseModel):
    """CPO's output after analyzing CEO brief."""
    clarifying_questions: list[str]    # Max 5 questions
    initial_user_personas: list[dict]
    competitive_analysis: str
    recommended_success_metrics: list[str]

class CPOPRDOutput(BaseModel):
    """CPO's PRD document output."""
    product_vision: str
    goals: list[str]
    user_stories: list[UserStory]
    features: list[Feature]
    non_functional_requirements: list[str]
    success_metrics: list[str]

class CTOArchitectureOutput(BaseModel):
    """CTO's architecture document output."""
    tech_stack: dict[str, str]        # component -> technology
    system_design: str                 # Architecture description
    database_schema: str               # Schema design
    api_design: list[APIEndpoint]
    security_approach: str
    deployment_plan: str
    technical_risks: list[TechnicalRisk]

class CTOTaskBreakdownOutput(BaseModel):
    """CTO's task breakdown output."""
    epics: list[Epic]                  # Each contains features, stories, subtasks

class CFOBudgetOutput(BaseModel):
    """CFO's budget estimate output."""
    total_estimate_cents: int
    breakdown: dict[str, int]          # category -> cents
    assumptions: list[str]
    risks: list[str]
    recommendations: list[str]

class DevCodeOutput(BaseModel):
    """Developer agent's code generation output."""
    files: list[FileWrite]             # path + content
    tests: list[FileWrite]
    summary: str
    blockers: list[str]

class QATestOutput(BaseModel):
    """QA agent's test results output."""
    tests_run: int
    tests_passed: int
    tests_failed: int
    bugs_found: list[BugReport]
    recommendation: str                # "pass" | "fail" | "pass_with_notes"

class MeetingSpeakerTurn(BaseModel):
    """Single speaking turn in a meeting."""
    speaker: str
    topic: str
    position: str
    concerns: list[str]
    questions_for: dict[str, str]
    decision_proposed: str | None
```

**Step 3: Commit**
```bash
git add -A && git commit -m "feat: Pydantic schemas for API and agent output validation"
```

---

### Task 5: Redis client and pub/sub messaging

**Files:**
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/redis.py`
- Create: `backend/app/core/events.py`
- Create: `backend/tests/unit/test_events.py`

**Step 1: Create event types**

```python
# backend/app/core/events.py
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from enum import Enum


class EventType(str, Enum):
    AGENT_OUTPUT = "agent.output"
    AGENT_ERROR = "agent.error"
    AGENT_STARTED = "agent.started"
    GATE_SUBMITTED = "gate.submitted"
    GATE_REVIEWED = "gate.reviewed"
    STATE_CHANGED = "state.changed"
    TASK_UPDATED = "task.updated"
    BUDGET_ALERT = "budget.alert"
    MEETING_STARTED = "meeting.started"
    MEETING_ENDED = "meeting.ended"
    MESSAGE = "message"


class Event(BaseModel):
    type: EventType
    project_id: UUID
    source: str  # agent role or "system" or "ceo"
    payload: dict = {}
    timestamp: datetime = None

    def model_post_init(self, __context):
        if self.timestamp is None:
            self.timestamp = datetime.now()
```

**Step 2: Create Redis client with pub/sub**

```python
# backend/app/core/redis.py
import redis.asyncio as redis
from app.config import settings


class RedisClient:
    def __init__(self):
        self._redis = None
        self._pubsub = None

    async def connect(self):
        self._redis = redis.from_url(settings.redis_url)
        self._pubsub = self._redis.pubsub()

    async def publish(self, channel: str, message: str):
        await self._redis.publish(channel, message)

    async def subscribe(self, *channels):
        await self._pubsub.subscribe(*channels)

    async def listen(self):
        async for message in self._pubsub.listen():
            if message["type"] == "message":
                yield message

    async def close(self):
        if self._pubsub:
            await self._pubsub.close()
        if self._redis:
            await self._redis.close()


redis_client = RedisClient()
```

**Step 3: Write test, run, commit**
```bash
git add -A && git commit -m "feat: Redis pub/sub client and event types"
```

---

### Task 6: LLM provider abstraction (Gemini)

**Files:**
- Create: `backend/app/llm/__init__.py`
- Create: `backend/app/llm/base.py`
- Create: `backend/app/llm/gemini.py`
- Create: `backend/tests/unit/test_llm.py`

**Step 1: Create base LLM provider**

```python
# backend/app/llm/base.py
from abc import ABC, abstractmethod
from pydantic import BaseModel


class LLMResponse(BaseModel):
    content: str
    input_tokens: int
    output_tokens: int
    model: str
    cost_cents: int  # Calculated from token counts


class LLMConfig(BaseModel):
    model: str = "gemini-2.0-flash"
    temperature: float = 0.3
    max_output_tokens: int = 4096
    response_format: str = "json"  # "json" or "text"


class BaseLLMProvider(ABC):
    @abstractmethod
    async def generate(
        self,
        system_prompt: str,
        messages: list[dict],
        config: LLMConfig,
    ) -> LLMResponse:
        ...
```

**Step 2: Implement Gemini provider**

```python
# backend/app/llm/gemini.py
from google import genai
from app.llm.base import BaseLLMProvider, LLMResponse, LLMConfig
from app.config import settings

# Gemini pricing per 1M tokens (cents)
GEMINI_PRICING = {
    "gemini-2.0-flash": {"input": 10, "output": 40},
    "gemini-2.5-flash-preview-05-20": {"input": 15, "output": 60},
    "gemini-2.5-pro-preview-05-06": {"input": 125, "output": 500},
}


class GeminiProvider(BaseLLMProvider):
    def __init__(self):
        self.client = genai.Client(api_key=settings.gemini_api_key)

    async def generate(
        self,
        system_prompt: str,
        messages: list[dict],
        config: LLMConfig,
    ) -> LLMResponse:
        contents = []
        for msg in messages:
            contents.append(genai.types.Content(
                role=msg["role"],
                parts=[genai.types.Part(text=msg["content"])]
            ))

        response = self.client.models.generate_content(
            model=config.model,
            contents=contents,
            config=genai.types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=config.temperature,
                max_output_tokens=config.max_output_tokens,
                response_mime_type="application/json" if config.response_format == "json" else "text/plain",
            ),
        )

        input_tokens = response.usage_metadata.prompt_token_count
        output_tokens = response.usage_metadata.candidates_token_count
        pricing = GEMINI_PRICING.get(config.model, GEMINI_PRICING["gemini-2.0-flash"])
        cost_cents = int((input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000)

        return LLMResponse(
            content=response.text,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=config.model,
            cost_cents=cost_cents,
        )
```

**Step 3: Test with mock, commit**
```bash
git add -A && git commit -m "feat: LLM provider abstraction with Gemini implementation"
```

---

## Phase 2: Agent Foundation & Orchestrator

### Task 7: Base agent class

**Files:**
- Create: `backend/app/agents/__init__.py`
- Create: `backend/app/agents/base.py`
- Create: `backend/app/services/context.py`
- Create: `backend/tests/unit/test_base_agent.py`

**Step 1: Create context service** — loads relevant context for an agent per-call (NOT entire history)

```python
# backend/app/services/context.py
class ContextService:
    """Builds relevant context for an agent call.

    Loads only what the agent needs:
    - Project brief (always)
    - Current phase info
    - Agent's recent conversation history (last N messages)
    - Relevant documents (PRD for devs, architecture for devs, etc.)
    - Current task details (if working on a task)
    """

    async def build_context(
        self, db: AsyncSession, project_id: UUID, agent_role: str, phase: str
    ) -> list[dict]:
        ...
```

**Step 2: Create base agent**

```python
# backend/app/agents/base.py
class BaseAgent:
    role: str
    display_name: str
    system_prompt: str
    model_config: LLMConfig
    output_schema: type[BaseModel] | None
    max_retries: int = 3

    def __init__(self, llm: BaseLLMProvider, db: AsyncSession, project_id: UUID):
        self.llm = llm
        self.db = db
        self.project_id = project_id
        self.context_service = ContextService()
        self.validator = OutputValidator()

    async def run(self, input_message: str, phase: str) -> AgentResult:
        """Execute agent with context loading, LLM call, output validation."""
        context = await self.context_service.build_context(
            self.db, self.project_id, self.role, phase
        )
        context.append({"role": "user", "content": input_message})

        for attempt in range(self.max_retries):
            response = await self.llm.generate(
                system_prompt=self.system_prompt,
                messages=context,
                config=self.model_config,
            )
            # Log the message
            await self._log_message(response, phase)
            # Track cost
            await self._track_cost(response)

            if self.output_schema is None:
                return AgentResult(content=response.content, raw_response=response)

            # Validate output
            result = self.validator.validate(response.content, self.output_schema)
            if result.valid:
                return AgentResult(content=result.parsed, raw_response=response)

            # Retry with validation error
            context.append({"role": "model", "content": response.content})
            context.append({"role": "user", "content": f"Output validation failed: {result.error}. Fix and retry."})

        raise AgentRetryExhausted(self.role, self.max_retries)
```

**Step 3: Create output validator**

```python
class OutputValidator:
    def validate(self, raw_output: str, schema: type[BaseModel]) -> ValidationResult:
        try:
            parsed = json.loads(raw_output)
            validated = schema.model_validate(parsed)
            return ValidationResult(valid=True, parsed=validated, error=None)
        except (json.JSONDecodeError, ValidationError) as e:
            return ValidationResult(valid=False, parsed=None, error=str(e))
```

**Step 4: Test, commit**
```bash
git add -A && git commit -m "feat: base agent class with context loading and output validation"
```

---

### Task 8: Orchestrator — state machine

**Files:**
- Create: `backend/app/orchestrator/__init__.py`
- Create: `backend/app/orchestrator/state_machine.py`
- Create: `backend/tests/unit/test_state_machine.py`

**Step 1: Write failing tests**

```python
# Test valid transitions
def test_briefing_to_discovery():
    sm = StateMachine()
    assert sm.can_transition("briefing", "discovery") is True

def test_invalid_transition():
    sm = StateMachine()
    assert sm.can_transition("briefing", "development") is False

# Test rollback transitions
def test_qa_failure_rollback():
    sm = StateMachine()
    assert sm.can_transition("qa_testing", "development") is True

def test_prd_rejection_rollback():
    sm = StateMachine()
    assert sm.can_transition("prd_review", "prd_creation") is True

# Test gate requirements
def test_gate_required():
    sm = StateMachine()
    assert sm.requires_gate("prd_review", "architecture") == "gate_1_prd"
    assert sm.requires_gate("development", "code_review") is None
```

**Step 2: Implement state machine**

```python
# backend/app/orchestrator/state_machine.py
TRANSITIONS = {
    "briefing": ["discovery"],
    "discovery": ["prd_creation"],
    "prd_creation": ["prd_review"],
    "prd_review": ["architecture", "prd_creation"],  # approve or reject
    "architecture": ["arch_review"],
    "arch_review": ["budget", "architecture"],
    "budget": ["budget_review"],
    "budget_review": ["sprint_planning", "architecture"],
    "sprint_planning": ["development"],
    "development": ["code_review"],
    "code_review": ["qa_testing", "development"],
    "qa_testing": ["uat", "development", "sprint_planning"],
    "uat": ["deployment", "sprint_planning"],
    "deployment": ["complete"],
}

GATES = {
    ("prd_review", "architecture"): "gate_1_prd",
    ("budget_review", "sprint_planning"): "gate_2_arch_budget",
    ("uat", "deployment"): "gate_3_uat",
    ("deployment", "complete"): "gate_4_release",
}
```

**Step 3: Run tests, commit**
```bash
git add -A && git commit -m "feat: orchestrator state machine with transitions and gates"
```

---

### Task 9: Orchestrator — event router and engine

**Files:**
- Create: `backend/app/orchestrator/event_router.py`
- Create: `backend/app/orchestrator/gate_manager.py`
- Create: `backend/app/orchestrator/agent_manager.py`
- Create: `backend/app/orchestrator/engine.py`
- Create: `backend/tests/unit/test_orchestrator.py`

**Step 1: Event router** — maps events to handler functions

```python
# Handles: agent.output → check if phase complete → trigger next phase
# Handles: gate.submitted → create approval gate record → notify CEO
# Handles: gate.reviewed → if approved, transition state → trigger next agent
# Handles: agent.error → retry or escalate
# Handles: budget.alert → pause agents if over threshold
```

**Step 2: Gate manager** — CRUD for approval gates, enforces gate requirements

**Step 3: Agent manager** — starts/stops agents, tracks which agents are active

```python
class AgentManager:
    """Manages agent lifecycle for a project."""

    async def start_agent(self, project_id: UUID, role: str, input_message: str, phase: str):
        """Launch an agent as an asyncio task."""
        agent = self._create_agent(role, project_id)
        task = asyncio.create_task(self._run_agent(agent, input_message, phase))
        self._active_tasks[f"{project_id}:{role}"] = task

    async def start_parallel(self, project_id: UUID, agents: list[dict]):
        """Launch multiple agents in parallel (e.g., backend + frontend dev)."""
        tasks = []
        for agent_spec in agents:
            agent = self._create_agent(agent_spec["role"], project_id)
            task = asyncio.create_task(
                self._run_agent(agent, agent_spec["input"], agent_spec["phase"])
            )
            tasks.append(task)
            self._active_tasks[f"{project_id}:{agent_spec['role']}"] = task
        return tasks
```

**Step 4: Orchestrator engine** — the main loop

```python
class OrchestratorEngine:
    """Main orchestrator — listens for events, routes them, manages state."""

    async def start(self):
        """Subscribe to all event channels and process."""
        await self.redis.subscribe("met:events")
        async for message in self.redis.listen():
            event = Event.model_validate_json(message["data"])
            await self.handle_event(event)

    async def handle_event(self, event: Event):
        match event.type:
            case EventType.AGENT_OUTPUT:
                await self._handle_agent_output(event)
            case EventType.GATE_SUBMITTED:
                await self._handle_gate_submitted(event)
            case EventType.GATE_REVIEWED:
                await self._handle_gate_reviewed(event)
            case EventType.AGENT_ERROR:
                await self._handle_agent_error(event)
            case EventType.BUDGET_ALERT:
                await self._handle_budget_alert(event)
```

**Step 5: Test, commit**
```bash
git add -A && git commit -m "feat: orchestrator engine with event routing, gate management, agent lifecycle"
```

---

### Task 10: Cost tracker service

**Files:**
- Create: `backend/app/services/cost_tracker.py`
- Create: `backend/tests/unit/test_cost_tracker.py`

**Step 1: Implement cost tracking**

```python
class CostTracker:
    async def record_cost(self, db, project_id, agent_role, llm_response):
        """Record a cost entry from an LLM call."""
        entry = CostEntry(
            project_id=project_id,
            category="llm",
            agent_role=agent_role,
            description=f"{agent_role} LLM call",
            amount_cents=llm_response.cost_cents,
            token_count=llm_response.input_tokens + llm_response.output_tokens,
            model_used=llm_response.model,
        )
        db.add(entry)

        # Update budget totals
        budget = await self._get_budget(db, project_id)
        if budget:
            budget.spent_cents += llm_response.cost_cents
            budget.llm_budget_cents += llm_response.cost_cents
            await self._check_thresholds(budget, project_id)

    async def _check_thresholds(self, budget, project_id):
        ratio = budget.spent_cents / budget.total_budget_cents
        if ratio >= 0.95:
            budget.alert_level = "escalation"
            await self._publish_alert(project_id, "escalation")
        elif ratio >= 0.80:
            budget.alert_level = "critical"
            await self._publish_alert(project_id, "critical")
        elif ratio >= 0.60:
            budget.alert_level = "warning"
```

**Step 2: Test, commit**
```bash
git add -A && git commit -m "feat: cost tracker with budget thresholds and alerts"
```

---

## Phase 3: Agent Implementations (CEO ↔ CPO Loop)

### Task 11: Agent system prompts

**Files:**
- Create: `backend/app/agents/prompts/cpo_system.md`
- Create: `backend/app/agents/prompts/cto_system.md`
- Create: `backend/app/agents/prompts/cfo_system.md`
- Create: `backend/app/agents/prompts/backend_dev_system.md`
- Create: `backend/app/agents/prompts/frontend_dev_system.md`
- Create: `backend/app/agents/prompts/qa_system.md`

Each prompt includes: role definition, output format (JSON schema), guardrails, escalation rules, context injection points. These are the core of the system — detailed, role-specific prompts that enforce structured output.

**Step 1: Write CPO system prompt**

```markdown
You are the Chief Product Officer (CPO) of a software development team.

## Your Responsibilities
- Analyze project briefs and conduct competitive research
- Create comprehensive PRDs with user stories and acceptance criteria
- Prioritize features (Must-have, Should-have, Nice-to-have)
- Define success metrics and KPIs
- Conduct user acceptance testing

## Output Format
You MUST respond in valid JSON matching the schema provided.
Never include text outside the JSON object.

## Guardrails
- You CANNOT approve technical architecture (that's CEO + CTO)
- You CANNOT assign tasks to developers (that's CTO)
- You CANNOT make budget decisions (that's CFO + CEO)
- If requirements are unclear, list clarifying questions — max 5 per round
- Max 3 rounds of clarification before you must proceed with best judgment

## Working Style
- Be specific and concrete, not vague
- Every user story must have acceptance criteria
- Every feature must have a priority level with justification
- Identify risks and assumptions explicitly
```

**Step 2: Write remaining prompts (similar structure, role-specific)**

**Step 3: Commit**
```bash
git add -A && git commit -m "feat: agent system prompts for all roles"
```

---

### Task 12: CPO agent implementation

**Files:**
- Create: `backend/app/agents/cpo.py`
- Create: `backend/tests/unit/test_cpo_agent.py`

**Step 1: Implement CPO with two phases: discovery and PRD creation**

```python
class CPOAgent(BaseAgent):
    role = "cpo"
    display_name = "Chief Product Officer"
    model_config = LLMConfig(model="gemini-2.0-flash", temperature=0.7)

    async def discover(self, project_brief: str) -> CPODiscoveryOutput:
        """Phase 1: Analyze brief, generate clarifying questions."""
        self.output_schema = CPODiscoveryOutput
        result = await self.run(
            input_message=f"Analyze this project brief and generate clarifying questions:\n\n{project_brief}",
            phase="discovery"
        )
        return result.content

    async def create_prd(self, brief: str, answers: dict, feedback: str | None = None) -> CPOPRDOutput:
        """Phase 2: Create PRD from brief + CEO answers."""
        self.output_schema = CPOPRDOutput
        prompt = f"Create a comprehensive PRD.\n\nBrief: {brief}\n\nCEO Answers: {json.dumps(answers)}"
        if feedback:
            prompt += f"\n\nPrevious feedback to incorporate: {feedback}"
        result = await self.run(input_message=prompt, phase="prd_creation")
        return result.content
```

**Step 2: Test with mocked LLM, commit**
```bash
git add -A && git commit -m "feat: CPO agent — discovery and PRD creation"
```

---

### Task 13: CTO agent implementation

**Files:**
- Create: `backend/app/agents/cto.py`
- Create: `backend/tests/unit/test_cto_agent.py`

CTO handles: architecture design, task breakdown, code review, technical guidance.

```python
class CTOAgent(BaseAgent):
    role = "cto"
    display_name = "Chief Technology Officer"
    model_config = LLMConfig(model="gemini-2.0-flash", temperature=0.3)

    async def design_architecture(self, prd: dict) -> CTOArchitectureOutput:
        ...

    async def break_down_tasks(self, prd: dict, architecture: dict) -> CTOTaskBreakdownOutput:
        ...

    async def review_code(self, diff: str, task: dict) -> CodeReviewOutput:
        ...
```

**Commit:**
```bash
git add -A && git commit -m "feat: CTO agent — architecture, task breakdown, code review"
```

---

### Task 14: CFO agent implementation

**Files:**
- Create: `backend/app/agents/cfo.py`

CFO is a **hybrid**: service code for calculations, LLM for narratives/reports.

```python
class CFOAgent(BaseAgent):
    role = "cfo"
    display_name = "Chief Financial Officer"
    model_config = LLMConfig(model="gemini-2.0-flash", temperature=0.2)

    async def create_budget(self, prd: dict, architecture: dict) -> CFOBudgetOutput:
        ...

    async def generate_report(self, project_id: UUID) -> str:
        """Generate financial report from actual cost data."""
        costs = await self._get_cost_data(project_id)
        # Pure calculation — no LLM
        summary = self._calculate_summary(costs)
        # LLM for narrative
        result = await self.run(
            input_message=f"Write a financial report narrative:\n{json.dumps(summary)}",
            phase="reporting"
        )
        return result.content
```

**Commit:**
```bash
git add -A && git commit -m "feat: CFO agent — budget creation and financial reporting"
```

---

### Task 15: Developer agents (Backend + Frontend)

**Files:**
- Create: `backend/app/agents/backend_dev.py`
- Create: `backend/app/agents/frontend_dev.py`
- Create: `backend/app/services/git_service.py`
- Create: `backend/app/services/file_service.py`

**Step 1: Git service** — manages workspace repos, branches, commits

```python
class GitService:
    async def init_workspace(self, project_id: UUID) -> str:
        """Create workspace directory with git repo."""
        ...

    async def create_branch(self, workspace: str, branch_name: str):
        ...

    async def commit_files(self, workspace: str, files: list[FileWrite], message: str):
        ...

    async def get_diff(self, workspace: str, branch: str) -> str:
        ...

    async def merge_branch(self, workspace: str, branch: str):
        ...
```

**Step 2: File service** — sandboxed file I/O

```python
class FileService:
    def validate_path(self, project_id: UUID, file_path: str) -> bool:
        """Ensure path is within project workspace. Reject directory traversal."""
        ...

    async def write_file(self, project_id: UUID, file_path: str, content: str):
        ...

    async def read_file(self, project_id: UUID, file_path: str) -> str:
        ...
```

**Step 3: Developer agents**

```python
class BackendDevAgent(BaseAgent):
    role = "backend_dev"
    output_schema = DevCodeOutput

    async def implement_task(self, task: dict, architecture: dict) -> DevCodeOutput:
        ...

class FrontendDevAgent(BaseAgent):
    role = "frontend_dev"
    output_schema = DevCodeOutput

    async def implement_task(self, task: dict, architecture: dict, api_contracts: dict) -> DevCodeOutput:
        ...
```

**Commit:**
```bash
git add -A && git commit -m "feat: developer agents with git service and sandboxed file I/O"
```

---

### Task 16: QA Reviewer agent

**Files:**
- Create: `backend/app/agents/qa_reviewer.py`

```python
class QAReviewerAgent(BaseAgent):
    role = "qa"
    output_schema = QATestOutput

    async def review_feature(self, task: dict, code_diff: str, acceptance_criteria: str) -> QATestOutput:
        ...

    async def create_test_plan(self, prd: dict) -> TestPlanOutput:
        ...
```

**Commit:**
```bash
git add -A && git commit -m "feat: QA Reviewer agent — test plans and feature review"
```

---

## Phase 4: API Routes

### Task 17: Project CRUD API

**Files:**
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/projects.py`

```python
# POST /api/projects — create project with brief
# GET /api/projects — list all projects
# GET /api/projects/{id} — get project details
# POST /api/projects/{id}/start — kick off the orchestrator
# GET /api/projects/{id}/state — get current state + agent statuses
```

**Commit:**
```bash
git add -A && git commit -m "feat: project CRUD API endpoints"
```

---

### Task 18: Gates, tasks, agents API

**Files:**
- Create: `backend/app/api/gates.py`
- Create: `backend/app/api/tasks.py`
- Create: `backend/app/api/agents.py`

```python
# Gates:
# GET /api/projects/{id}/gates — list all gates
# GET /api/projects/{id}/gates/pending — get pending gates
# POST /api/projects/{id}/gates/{gate_id}/approve — CEO approves
# POST /api/projects/{id}/gates/{gate_id}/reject — CEO rejects with notes

# Tasks:
# GET /api/projects/{id}/tasks — list tasks (filterable by status, assignee, type)
# GET /api/projects/{id}/tasks/{task_id} — task details + dependencies

# Agents:
# GET /api/projects/{id}/agents — agent statuses
# GET /api/projects/{id}/agents/{role}/messages — agent conversation history
```

**Commit:**
```bash
git add -A && git commit -m "feat: API routes for gates, tasks, and agent activity"
```

---

### Task 19: WebSocket endpoint for real-time updates

**Files:**
- Create: `backend/app/api/websocket.py`

```python
# WS /api/projects/{id}/ws — streams real-time events to frontend
# Events: agent activity, state changes, new tasks, gate submissions, budget alerts

class WebSocketManager:
    def __init__(self):
        self.connections: dict[UUID, list[WebSocket]] = {}

    async def connect(self, project_id: UUID, ws: WebSocket):
        ...

    async def broadcast(self, project_id: UUID, event: Event):
        ...
```

**Commit:**
```bash
git add -A && git commit -m "feat: WebSocket endpoint for real-time project updates"
```

---

### Task 20: Meeting API

**Files:**
- Create: `backend/app/api/meetings.py`
- Create: `backend/app/meetings/engine.py`
- Create: `backend/app/meetings/templates.py`
- Create: `backend/app/meetings/extraction.py`

Meeting engine implements the mechanics from design doc Section 5: moderated round-robin, anti-sycophancy prompts, structured output extraction, token budgets, termination rules.

**Commit:**
```bash
git add -A && git commit -m "feat: meeting engine and API — structured multi-agent discussions"
```

---

## Phase 5: Next.js Frontend

### Task 21: Next.js project setup

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/hooks/useWebSocket.ts`

```bash
cd frontend && npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir
npx shadcn@latest init
npx shadcn@latest add button card input badge tabs dialog select textarea scroll-area separator avatar
```

**Step 1: API client** — typed fetch wrapper for FastAPI

**Step 2: WebSocket hook** — connects to FastAPI WS, provides real-time events

**Commit:**
```bash
git add -A && git commit -m "feat: Next.js frontend setup with Tailwind, shadcn/ui, API client"
```

---

### Task 22: Project list and creation page

**Files:**
- Create: `frontend/src/app/page.tsx`
- Create: `frontend/src/app/projects/new/page.tsx`

Home page lists projects with state badges. "New Project" form accepts project name and brief.

**Commit:**
```bash
git add -A && git commit -m "feat: project list and creation pages"
```

---

### Task 23: Approval Center (MVP critical)

**Files:**
- Create: `frontend/src/app/projects/[id]/approvals/page.tsx`
- Create: `frontend/src/components/approval-card.tsx`

This is the **most critical UI component** — the human-in-the-loop interface. Shows pending gates with the artifact to review (PRD, architecture, budget, feature). CEO can approve or reject with notes.

**Commit:**
```bash
git add -A && git commit -m "feat: approval center — CEO human-in-the-loop interface"
```

---

### Task 24: Project overview page

**Files:**
- Create: `frontend/src/app/projects/[id]/page.tsx`
- Create: `frontend/src/components/state-machine-viz.tsx`

Shows: current state in the state machine (visual), agent statuses, recent activity, quick stats (tasks done, budget used, etc).

**Commit:**
```bash
git add -A && git commit -m "feat: project overview with state machine visualization"
```

---

### Task 25: Agent activity feed

**Files:**
- Create: `frontend/src/app/projects/[id]/agents/page.tsx`
- Create: `frontend/src/components/agent-feed.tsx`

Real-time feed of agent messages via WebSocket. Shows which agent is talking, what they produced, their status. Chat-like interface grouped by agent.

**Commit:**
```bash
git add -A && git commit -m "feat: real-time agent activity feed"
```

---

### Task 26: Task board (Kanban)

**Files:**
- Create: `frontend/src/app/projects/[id]/tasks/page.tsx`
- Create: `frontend/src/components/task-board.tsx`
- Create: `frontend/src/components/task-card.tsx`

Kanban columns: Not Started, In Progress, Blocked, Review, Completed. Cards show task title, assignee, priority badge, dependency indicator.

**Commit:**
```bash
git add -A && git commit -m "feat: task board — kanban view with drag and drop"
```

---

### Task 27: Meeting viewer, budget dashboard, audit log

**Files:**
- Create: `frontend/src/app/projects/[id]/meetings/page.tsx`
- Create: `frontend/src/app/projects/[id]/budget/page.tsx`
- Create: `frontend/src/app/projects/[id]/audit/page.tsx`

Meeting viewer: transcript display with decisions/action items highlighted.
Budget: bar charts (spent vs total), cost breakdown by category/agent, alert indicators.
Audit: filterable table of all actions with timestamps.

**Commit:**
```bash
git add -A && git commit -m "feat: meeting viewer, budget dashboard, and audit log pages"
```

---

## Phase 6: Integration & Testing

### Task 28: Integration tests — full project lifecycle

**Files:**
- Create: `backend/tests/integration/test_full_lifecycle.py`
- Create: `backend/tests/fixtures/mock_llm.py`

Mock LLM provider that returns fixture responses. Test the complete flow: create project → CPO discovery → CPO PRD → CEO approval → CTO architecture → CTO task breakdown → CFO budget → CEO approval → dev coding → CTO review → QA → UAT → complete.

**Commit:**
```bash
git add -A && git commit -m "test: integration tests for full project lifecycle"
```

---

### Task 29: E2E smoke test with real Gemini API

**Files:**
- Create: `backend/tests/e2e/test_smoke.py`

Uses real Gemini API (cheap model, short brief) to validate the system works end-to-end. Runs as opt-in test (requires API key).

**Commit:**
```bash
git add -A && git commit -m "test: e2e smoke test with real Gemini API"
```

---

### Task 30: Dockerfile and Docker Compose finalization

**Files:**
- Create: `backend/Dockerfile`
- Update: `docker-compose.yml` (add backend + frontend services)
- Create: `frontend/Dockerfile`

**Commit:**
```bash
git add -A && git commit -m "chore: Docker Compose — full stack deployment"
```

---

## Summary

| Phase | Tasks | What's Built |
|-------|-------|-------------|
| 1: Scaffolding & DB | 1-6 | Project structure, Docker, DB schema, Redis, LLM abstraction |
| 2: Agent Foundation | 7-10 | Base agent, orchestrator, state machine, cost tracking |
| 3: Agents | 11-16 | All 7 agents (CPO, CTO, CFO, Backend Dev, Frontend Dev, QA) + prompts |
| 4: API | 17-20 | REST + WebSocket API for all entities |
| 5: Frontend | 21-27 | Next.js dashboard with all views |
| 6: Integration | 28-30 | Full lifecycle tests, E2E smoke test, Docker |

**Total: 30 tasks across 6 phases.**
