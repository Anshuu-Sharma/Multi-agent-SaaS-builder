# CLAUDE.md - Development Guide

## Conventions

### Python
- **Naming**: `snake_case` for functions, variables, modules. `PascalCase` for classes.
- **Async**: `async/await` everywhere. No blocking I/O. SQLAlchemy async sessions, async Redis, async LLM calls.
- **Validation**: All data boundaries use Pydantic v2 models. Every agent output is validated against a schema before touching the DB.
- **Type hints**: Required on all function signatures.
- **Imports**: Absolute imports from `app.*`. No relative imports.
- **Strings**: Double quotes for strings.
- **Models**: SQLAlchemy 2.0 declarative style. Pydantic for API schemas and agent output schemas -- separate concerns.

### TypeScript (Frontend)
- React Server Components where possible, client components only when needed (interactivity, WebSocket).
- Use `shadcn/ui` components. Tailwind for styling.
- API calls go through `lib/api.ts` typed client.

### General
- No Celery. Background work runs as `asyncio.create_task()`.
- No API gateway / proxy layer. Frontend calls FastAPI directly.
- Redis is ONLY for pub/sub + ephemeral cache. All durable state is in PostgreSQL.
- Orchestrator is pure deterministic code. It does NOT use an LLM.

## Running the Project

### Full stack (Docker)
```bash
cp .env.example .env
# Set MET_GEMINI_API_KEY in .env
docker compose up -d
```

### Backend only (local dev)
```bash
cd backend
pip install -e ".[dev]"

# Start dependencies
docker compose up -d postgres redis

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload --port 8000
```

### Frontend only (local dev)
```bash
cd frontend
npm install
npm run dev    # http://localhost:3000
```

## Testing

```bash
# Unit tests
cd backend && pytest tests/unit/ -v

# Integration tests (needs Postgres + Redis running)
cd backend && pytest tests/integration/ -v

# E2E smoke test (needs GEMINI_API_KEY)
cd backend && pytest tests/e2e/ -v

# All tests with coverage
cd backend && pytest --cov=app --cov-report=term-missing

# Frontend
cd frontend && npm test
```

### Test structure
- `tests/unit/` -- Agent output validation, state machine transitions, cost calculations. Mock LLM.
- `tests/integration/` -- Full agent-orchestrator flows with mocked LLM fixture responses.
- `tests/e2e/` -- Real Gemini API calls. Opt-in (requires API key).
- `tests/fixtures/` -- Golden prompts, mock LLM response files.

## Key Directories

| Directory | Contains |
|-----------|---------|
| `backend/app/agents/` | Agent classes (BaseAgent subclasses) + `prompts/` folder with system prompt markdown files |
| `backend/app/orchestrator/` | State machine, event router, gate manager, agent lifecycle manager. All deterministic, no LLM. |
| `backend/app/meetings/` | Meeting engine: turn management, structured output extraction, token budgets |
| `backend/app/models/` | SQLAlchemy ORM models mapping to PostgreSQL tables |
| `backend/app/schemas/` | Pydantic models for API request/response AND agent output validation |
| `backend/app/llm/` | LLM provider abstraction. `base.py` defines interface, `gemini.py` implements it. |
| `backend/app/services/` | Business logic: cost tracking, git operations, sandboxed file I/O, context building |
| `backend/app/api/` | FastAPI route handlers (REST + WebSocket) |
| `backend/app/core/` | Shared utilities: event types, Redis client, custom exceptions |
| `frontend/src/app/` | Next.js App Router pages |
| `workspaces/` | Generated project code. Each project gets `workspaces/{project-id}/` with its own git repo. |

## Database

- **Engine**: PostgreSQL 16
- **ORM**: SQLAlchemy 2.0 with async engine (`asyncpg` driver)
- **Migrations**: Alembic (async-compatible `env.py`)
- **Connection string**: `postgresql+asyncpg://met:metdev@localhost:5432/met`

### Core tables
| Table | Purpose |
|-------|---------|
| `projects` | Project briefs, current state, config |
| `state_transitions` | Audit log of state changes |
| `project_agents` | Active agents per project, status, token/cost totals |
| `agent_messages` | Full conversation history per agent per phase |
| `approval_gates` | Gate status (pending/approved/rejected), artifact refs |
| `tasks` | Hierarchical task ledger (epic > feature > story > subtask) |
| `task_dependencies` | DAG of task dependencies |
| `documents` | Versioned PRDs, architecture docs, budgets |
| `meetings` | Meeting transcripts, extracted decisions, action items |
| `budget` | Per-project budget totals and alert levels |
| `cost_entries` | Individual cost line items (every LLM call) |
| `bugs` | Bug reports from QA |
| `audit_log` | Every significant action in the system |

### Migration commands
```bash
cd backend
alembic revision --autogenerate -m "description"
alembic upgrade head
alembic downgrade -1
```

## Agent System

### Architecture
```
BaseAgent (base.py)
├── CPOAgent        -- discovery, PRD creation
├── CTOAgent        -- architecture, task breakdown, code review
├── CFOAgent        -- budget (calculations + LLM narrative)
├── BackendDevAgent -- code generation (owns src/backend/)
├── FrontendDevAgent-- code generation (owns src/frontend/)
└── QAReviewerAgent -- test plans, feature review, bug filing
```

### Agent execution flow
```
1. ContextService builds relevant context (brief, phase, recent messages, docs)
2. BaseAgent.run() calls LLM with system prompt + context
3. Raw response → JSON parse → Pydantic schema validation
4. Valid   → store in DB, publish event, trigger downstream
5. Invalid → retry with error feedback (max 3) → escalate on failure
```

### Output validation
Every agent output is validated against a Pydantic model in `schemas/agent_output.py`:
- `CPODiscoveryOutput`, `CPOPRDOutput`
- `CTOArchitectureOutput`, `CTOTaskBreakdownOutput`
- `CFOBudgetOutput`
- `DevCodeOutput`
- `QATestOutput`
- `MeetingSpeakerTurn`

### Adding a new agent
1. Create `backend/app/agents/{role}.py` subclassing `BaseAgent`
2. Create `backend/app/agents/prompts/{role}_system.md`
3. Add output schema to `backend/app/schemas/agent_output.py`
4. Register in `AgentManager._create_agent()`
5. Add transitions in orchestrator if needed

## Orchestrator

The orchestrator is a **deterministic state machine** -- pure Python, no LLM calls.

### Responsibilities
- Enforce valid state transitions (15 states, defined in `state_machine.py`)
- Route events from agents to appropriate handlers
- Block transitions until approval gates pass
- Manage agent lifecycle (start/stop/restart as asyncio tasks)
- Detect deadlocks in task dependencies
- Enforce cost budgets (pause all agents at 95%)
- Handle errors (retry 3x → escalate → mark blocked)

### Approval gates
| Gate | Transition | Approver |
|------|-----------|----------|
| Gate 1 | PRD Review → Architecture | CEO |
| Gate 2 | Budget Review → Sprint Planning | CEO |
| Gate 3 | UAT → Deployment | CPO |
| Gate 4 | Deployment → Complete | CEO |

### Event types
```python
AGENT_OUTPUT    # Agent completed work
AGENT_ERROR     # Agent failed
AGENT_STARTED   # Agent began execution
GATE_SUBMITTED  # Artifact submitted for review
GATE_REVIEWED   # Gate approved or rejected
STATE_CHANGED   # Project state transition
TASK_UPDATED    # Task status change
BUDGET_ALERT    # Cost threshold hit
MEETING_STARTED # Meeting began
MEETING_ENDED   # Meeting concluded
MESSAGE         # General message
```

## Cost Guardrails

| Threshold | Action |
|-----------|--------|
| 60% budget | Warning alert |
| 80% budget | Critical alert to CEO |
| 95% budget | Hard stop -- all agents paused |
| Per-call | Max $0.50 per single LLM call |
| Per-phase | Max $10 per project phase |
| Per-project | Max $50 default total |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MET_DATABASE_URL` | `postgresql+asyncpg://met:metdev@localhost:5432/met` | PostgreSQL connection |
| `MET_REDIS_URL` | `redis://localhost:6379/0` | Redis connection |
| `MET_GEMINI_API_KEY` | (required) | Google Gemini API key |
| `MET_DEFAULT_LLM_MODEL` | `gemini-2.0-flash` | Default model for agents |
| `MET_WORKSPACE_ROOT` | `/workspaces` | Root dir for generated code |
| `MET_CORS_ORIGINS` | `["http://localhost:3000"]` | Allowed CORS origins |
| `MET_MAX_PROJECT_BUDGET_CENTS` | `5000` | Max budget per project ($50) |
| `MET_MAX_PER_CALL_CENTS` | `50` | Max cost per LLM call ($0.50) |
