# MET System Design - Multi-Agent Executive Team

**Date**: 2026-02-22
**Status**: Draft v2 (post-review)

---

## 1. Architecture

```
┌──────────────────────────────────────────────┐
│              NEXT.JS FRONTEND                 │
│  (Static/SSR, calls FastAPI directly)         │
│  Dashboard │ Approvals │ Agent Activity       │
└──────────────┬───────────────────────────────┘
               │ HTTP + WebSocket (direct, no proxy)
┌──────────────┴───────────────────────────────┐
│              FASTAPI SERVER                    │
│                                                │
│  ┌─────────────────────────────────────────┐  │
│  │           ORCHESTRATOR                   │  │
│  │  State Machine │ Event Router │ Gates    │  │
│  │  Error Recovery │ Deadlock Detection     │  │
│  └─────────────────────────────────────────┘  │
│                                                │
│  ┌─────────────────────────────────────────┐  │
│  │         AGENT MANAGER                    │  │
│  │  Agent Registry │ Lifecycle │ Scheduler  │  │
│  │  Context Loader │ Output Validator       │  │
│  └─────────────────────────────────────────┘  │
│                                                │
│  ┌─────────────────────────────────────────┐  │
│  │         MEETING ENGINE                   │  │
│  │  Turn Manager │ Consensus │ Extraction   │  │
│  └─────────────────────────────────────────┘  │
│                                                │
│  REST API │ WebSocket Manager │ Background    │
│  Tasks (asyncio, NOT Celery)                  │
└──────┬──────────────┬───────────────────────┘
       │              │
  ┌────┴────┐   ┌────┴────────┐
  │  Redis  │   │ PostgreSQL  │
  │ Pub/Sub │   │  (all state)│
  │ + Cache │   │             │
  └─────────┘   └─────────────┘
```

**Key decisions:**
- **No proxy layer.** Next.js frontend calls FastAPI directly via CORS-enabled HTTP/WS endpoints.
- **No Celery.** Agents run as asyncio tasks managed by AgentManager. State persists in PostgreSQL, not in-memory. Agents are resumed by loading conversation history from DB.
- **Orchestrator is first-class.** Gets its own full specification (Section 5).
- **Redis is ONLY for pub/sub + ephemeral cache.** All durable state lives in PostgreSQL.

---

## 2. Database Schema (Designed First)

### Core Tables

```sql
-- Projects
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    brief TEXT NOT NULL,           -- CEO's initial project brief
    state VARCHAR(50) NOT NULL DEFAULT 'briefing',
    -- States: briefing, discovery, prd_creation, prd_review,
    --         architecture, arch_review, budget, budget_review,
    --         sprint_planning, development, code_review,
    --         qa_testing, uat, deployment, complete, failed
    config JSONB DEFAULT '{}',     -- LLM settings, cost limits, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- State transition audit log
CREATE TABLE state_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    from_state VARCHAR(50) NOT NULL,
    to_state VARCHAR(50) NOT NULL,
    triggered_by VARCHAR(50) NOT NULL,  -- agent role or 'system' or 'ceo'
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents active on a project
CREATE TABLE project_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,     -- ceo, cpo, cto, cfo, backend_dev, frontend_dev, qa
    status VARCHAR(20) DEFAULT 'idle',  -- idle, working, blocked, error
    current_task_id UUID,
    token_usage_total INT DEFAULT 0,
    cost_total_cents INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent conversation history (the core of stateful agents)
CREATE TABLE agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    agent_role VARCHAR(50) NOT NULL,
    phase VARCHAR(50) NOT NULL,       -- which project phase this belongs to
    direction VARCHAR(10) NOT NULL,   -- 'inbound' or 'outbound'
    content TEXT NOT NULL,
    message_type VARCHAR(30) DEFAULT 'chat',  -- chat, tool_call, tool_result, system
    metadata JSONB DEFAULT '{}',      -- token count, model used, latency, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_agent_messages_lookup ON agent_messages(project_id, agent_role, phase);

-- Approval gates
CREATE TABLE approval_gates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    gate_number INT NOT NULL,          -- 1=PRD, 2=Arch+Budget, 3=UAT, 4=Release
    gate_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected
    artifact_type VARCHAR(50),         -- prd, architecture, budget, feature, release
    artifact_id UUID,                  -- reference to the artifact being approved
    submitted_by VARCHAR(50),          -- agent role
    reviewed_by VARCHAR(50),           -- 'ceo' or agent role
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

-- Task Ledger (hierarchical)
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES tasks(id),  -- NULL = epic
    task_type VARCHAR(20) NOT NULL,    -- epic, feature, story, subtask
    title VARCHAR(500) NOT NULL,
    description TEXT,
    acceptance_criteria TEXT,
    status VARCHAR(20) DEFAULT 'not_started',
    -- not_started, in_progress, blocked, review, completed, cancelled
    priority VARCHAR(10) DEFAULT 'medium',  -- critical, high, medium, low
    assigned_to VARCHAR(50),           -- agent role
    estimated_hours FLOAT,
    actual_hours FLOAT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tasks_project ON tasks(project_id, status);
CREATE INDEX idx_tasks_parent ON tasks(parent_id);

-- Task dependencies
CREATE TABLE task_dependencies (
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on UUID REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on)
);

-- PRD documents (versioned)
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    doc_type VARCHAR(50) NOT NULL,     -- prd, architecture, budget, meeting_notes, standup
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    version INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'draft',  -- draft, review, approved, superseded
    created_by VARCHAR(50) NOT NULL,   -- agent role
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meeting records
CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    meeting_type VARCHAR(50) NOT NULL,  -- c_level, standup, sprint_planning, bug_triage
    participants VARCHAR(50)[] NOT NULL,
    agenda JSONB NOT NULL,
    transcript JSONB NOT NULL,          -- array of {speaker, message, timestamp}
    decisions JSONB DEFAULT '[]',       -- extracted decisions
    action_items JSONB DEFAULT '[]',    -- extracted action items
    token_usage INT,
    cost_cents INT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);

-- Budget tracking
CREATE TABLE budget (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    total_budget_cents INT NOT NULL,
    spent_cents INT DEFAULT 0,
    -- Breakdown by category
    infra_budget_cents INT DEFAULT 0,
    llm_budget_cents INT DEFAULT 0,
    third_party_budget_cents INT DEFAULT 0,
    alert_level VARCHAR(20) DEFAULT 'normal',  -- normal, warning(60%), critical(80%), escalation(95%)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cost line items (every LLM call, every API charge)
CREATE TABLE cost_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,     -- llm, infrastructure, third_party
    agent_role VARCHAR(50),
    description VARCHAR(255),
    amount_cents INT NOT NULL,
    token_count INT,
    model_used VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bug tracking
CREATE TABLE bugs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    related_task_id UUID REFERENCES tasks(id),
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL,     -- critical, high, medium, low
    status VARCHAR(20) DEFAULT 'open', -- open, in_progress, fixed, verified, wont_fix
    steps_to_reproduce TEXT,
    expected_behavior TEXT,
    actual_behavior TEXT,
    reported_by VARCHAR(50) NOT NULL,  -- agent role
    assigned_to VARCHAR(50),
    fix_task_id UUID REFERENCES tasks(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Audit trail (every significant action)
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    actor VARCHAR(50) NOT NULL,        -- agent role or 'system' or 'ceo'
    action VARCHAR(100) NOT NULL,      -- e.g., 'task.created', 'gate.approved', 'meeting.completed'
    entity_type VARCHAR(50),           -- project, task, document, meeting, etc.
    entity_id UUID,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_log_project ON audit_log(project_id, created_at DESC);
```

---

## 3. Agent System

### Base Agent Architecture

```python
class BaseAgent:
    role: str                    # e.g., "cpo"
    display_name: str            # e.g., "Chief Product Officer"
    system_prompt: str           # Role-specific system prompt
    model_config: ModelConfig    # Which LLM, temperature, max_tokens
    output_schema: dict | None   # JSON schema for structured output validation
    tools: list[Tool]            # Available tools (create_task, write_file, etc.)
    autonomy_level: str          # "executive" | "developer" | "reviewer"
    max_retries: int = 3         # Before escalation
    max_tokens_per_turn: int     # Cost guardrail per single LLM call
    max_tokens_per_phase: int    # Cost guardrail per project phase
```

### LLM Configuration (per agent, configurable)

| Agent | Default Model | Temperature | Why |
|-------|---------------|-------------|-----|
| CEO | N/A (human) | N/A | Human-in-the-loop |
| CPO | gemini-2.0-flash | 0.7 | Creative PRD writing needs some temperature |
| CTO | gemini-2.0-flash | 0.3 | Architecture decisions should be precise |
| CFO | gemini-2.0-flash (reports only) | 0.2 | Mostly calculations via code, LLM for narratives |
| Backend Dev | gemini-2.0-flash | 0.2 | Code generation needs low temperature |
| Frontend Dev | gemini-2.0-flash | 0.2 | Code generation needs low temperature |
| QA Reviewer | gemini-2.0-flash | 0.1 | Test validation should be deterministic |

All models default to Gemini. Provider is configurable per-agent in project config. When budget allows, swap reasoning-heavy agents (CPO, CTO) to Claude/GPT-4.

### Prompt Engineering Strategy

Each agent's system prompt includes:
1. **Role definition**: Who you are, your responsibilities, your boundaries
2. **Output format**: ALWAYS respond in JSON matching the output schema
3. **Context injection**: Relevant project state injected per-call (not entire history)
4. **Guardrails**: What you CANNOT do (e.g., dev agents cannot approve gates)
5. **Escalation rules**: When to flag issues vs. handle autonomously

**Output validation pipeline:**
```
Agent LLM Call → Raw Response → JSON Parse → Schema Validation →
  ├─ Valid → Store in DB, trigger downstream
  └─ Invalid → Retry with error feedback (max 3 retries) → Escalate
```

Every agent output is validated against a Pydantic model before it touches the database or triggers any downstream action.

### Agent Tools (capabilities)

| Tool | Available To | Description |
|------|-------------|-------------|
| `create_document` | CPO, CTO, CFO | Create/update PRDs, architecture docs, budgets |
| `create_task` | CTO, CPO | Create tasks in the ledger |
| `update_task` | All agents | Update task status, add notes |
| `write_file` | Backend Dev, Frontend Dev | Write code to project workspace |
| `read_file` | All agents | Read existing code/docs |
| `run_tests` | QA, Backend Dev, Frontend Dev | Execute test suite |
| `submit_for_review` | All dev agents | Submit work for CTO review |
| `request_approval` | CPO, CTO, CFO | Request CEO approval at gates |
| `send_message` | All agents | Post to agent communication channel |
| `search_codebase` | All agents | Search project files |
| `create_bug` | QA | File a bug report |
| `calculate_cost` | CFO | Run cost calculations |

---

## 4. Orchestrator Specification

The Orchestrator is a **deterministic, event-driven state machine**. It does NOT use an LLM. It's pure code.

### Core Responsibilities

1. **State machine management**: Enforce valid transitions, block invalid ones
2. **Event routing**: Receive events from agents, route to appropriate handlers
3. **Gate enforcement**: Block state transitions until approval gates pass
4. **Agent lifecycle**: Start/stop/restart agents as needed per phase
5. **Dependency resolution**: Check task dependencies before allowing agents to start work
6. **Deadlock detection**: Identify circular dependencies, auto-escalate
7. **Error recovery**: Handle agent failures (retry → escalate → fail gracefully)
8. **Cost enforcement**: Track spending, trigger alerts, block over-budget operations

### State Machine (with rollback transitions)

```
                    ┌──────────────────┐
                    │    BRIEFING      │
                    └────────┬─────────┘
                             │ CEO submits brief
                    ┌────────▼─────────┐
                ┌───│    DISCOVERY     │
                │   └────────┬─────────┘
                │            │ CPO completes research
                │   ┌────────▼─────────┐
                │   │  PRD_CREATION    │◄──────────────┐
                │   └────────┬─────────┘               │
                │            │ CPO submits PRD         │ Rejected
                │   ┌────────▼─────────┐               │
                └──►│   PRD_REVIEW     │───────────────┘
                    │  [GATE 1: CEO]   │
                    └────────┬─────────┘
                             │ Approved
                    ┌────────▼─────────┐
                    │  ARCHITECTURE    │◄──────────────┐
                    └────────┬─────────┘               │
                             │ CTO submits arch        │ Rejected
                    ┌────────▼─────────┐               │
                    │  ARCH_REVIEW     │───────────────┘
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │     BUDGET       │
                    └────────┬─────────┘
                             │ CFO submits budget
                    ┌────────▼─────────┐
                    │  BUDGET_REVIEW   │───► Rejected → ARCHITECTURE
                    │[GATE 2: CEO]     │
                    └────────┬─────────┘
                             │ Approved
                    ┌────────▼─────────┐
                    │ SPRINT_PLANNING  │◄──────────────┐
                    └────────┬─────────┘               │
                             │                         │
                    ┌────────▼─────────┐               │
                    │   DEVELOPMENT    │◄───┐          │
                    └────────┬─────────┘    │          │
                             │              │          │
                    ┌────────▼─────────┐    │          │
                    │   CODE_REVIEW    │────┘          │
                    └────────┬─────────┘  Rejected     │
                             │ Approved                │
                    ┌────────▼─────────┐               │
                    │   QA_TESTING     │───────────────┘
                    └────────┬─────────┘  Critical fail
                             │ Passed
                    ┌────────▼─────────┐
                    │      UAT         │───► Rejected → SPRINT_PLANNING
                    │  [GATE 3: CPO]   │
                    └────────┬─────────┘
                             │ Accepted
                    ┌────────▼─────────┐
                    │   DEPLOYMENT     │
                    │  [GATE 4: CEO]   │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │    COMPLETE      │
                    └──────────────────┘

         Any State ──► FAILED (unrecoverable error after retries)
```

### Event Handling

```python
class OrchestratorEvent:
    type: str          # "agent.output", "gate.submitted", "gate.reviewed", "error", "budget.alert"
    project_id: UUID
    source: str        # agent role or "system"
    payload: dict      # event-specific data
    timestamp: datetime

# Event flow:
# 1. Agent completes work → publishes event to Redis
# 2. Orchestrator receives event
# 3. Validates: is this event valid for current state?
# 4. Processes: update DB, check gates, trigger next agent
# 5. Publishes: new events for downstream agents + WebSocket updates to frontend
```

### Concurrent Agent Handling

- During DEVELOPMENT, Backend Dev and Frontend Dev run as separate asyncio tasks
- Each agent works on different tasks (no file conflicts — see Section 7)
- Orchestrator tracks both agents' progress independently
- If one blocks the other (API contract mismatch), Orchestrator escalates to CTO

### Error Recovery

```
Agent fails → Retry with clearer prompt (max 3)
  └─ Still fails → Escalate to CTO (if dev) or CEO (if executive)
    └─ CTO/CEO provides guidance → Retry
      └─ Still fails → Mark task as blocked, move to next task, log to audit

Agent produces invalid output → Schema validation catches it
  └─ Retry with validation error in prompt (max 3)
    └─ Still invalid → Escalate

Agent timeout (>5 min for a single LLM call) → Cancel and retry
  └─ 3 timeouts → Mark agent as error, notify CTO

Deadlock detected (A waits for B, B waits for A) →
  └─ Orchestrator breaks deadlock by escalating to CTO
  └─ CTO resolves by re-prioritizing one dependency
```

---

## 5. Meeting Engine Specification

Meetings are **structured multi-turn LLM conversations** with concrete mechanics.

### Turn Order

Meetings use a **moderated round-robin** system:
1. Orchestrator sets the agenda (list of topics)
2. For each topic, agents speak in a **fixed order** based on role relevance
3. After all agents speak on a topic, one rebuttal round is allowed
4. Orchestrator extracts decisions/action items after each topic
5. Meeting ends when all agenda topics are addressed OR token budget is hit

### Anti-Sycophancy

Each agent's meeting prompt includes:
- "You MUST identify at least one risk or concern with any proposal before agreeing"
- "If you agree, state the specific technical/business reason, not just 'I agree'"
- Agents are given **different context**: CPO sees user stories, CTO sees technical constraints, CFO sees cost data. Disagreement emerges naturally from different perspectives.

### Structured Output Extraction

Each speaking turn produces structured JSON:

```json
{
  "speaker": "cto",
  "topic": "authentication_approach",
  "position": "recommend JWT with refresh tokens",
  "concerns": ["token storage security on frontend"],
  "questions_for": {"backend_dev": "can you implement token rotation?"},
  "decision_proposed": null
}
```

After all turns on a topic, a **separate cheap LLM call** extracts:
```json
{
  "decision": "Use JWT with refresh token rotation",
  "decision_status": "approved",  // approved, needs_more_discussion, escalate_to_ceo
  "action_items": [
    {"owner": "backend_dev", "task": "implement JWT auth with rotation", "deadline": "sprint_1"}
  ],
  "dissents": ["cfo noted this adds $50/mo for token storage service"]
}
```

### Token Budget

| Meeting Type | Max Tokens | Max Rounds per Topic | Max Topics |
|---|---|---|---|
| C-Level Strategic | 30,000 | 3 | 5 |
| Daily Standup | 8,000 | 1 | Per-agent update only |
| Sprint Planning | 20,000 | 2 | 8 |
| Bug Triage | 15,000 | 2 | 10 |

If token budget is exhausted mid-meeting, remaining topics are deferred to next meeting.

### Meeting Termination

A meeting ends when:
1. All agenda items have been addressed, OR
2. Token budget is exhausted, OR
3. Max rounds reached for all topics, OR
4. CEO manually ends it (for C-Level meetings)

---

## 6. Code Generation & Git Strategy

### Workspace Structure

Each project gets an isolated workspace directory:

```
workspaces/
└── {project_id}/
    ├── .git/                    # Initialized git repo
    ├── src/
    │   ├── backend/             # Backend Dev writes here
    │   └── frontend/            # Frontend Dev writes here
    ├── tests/
    │   ├── backend/
    │   └── frontend/
    ├── docs/                    # Generated docs (PRD, architecture)
    └── .met/                    # MET system metadata
        ├── project.json
        └── task-map.json        # Maps tasks to files
```

### Git Strategy

1. **Main branch** = `main` — always the latest approved code
2. **Agent branches**: Each dev agent works on a feature branch:
   - `backend-dev/{task-id}-{short-description}`
   - `frontend-dev/{task-id}-{short-description}`
3. **CTO review** = automated diff review on the branch
4. **Merge to main** only after CTO approval + QA pass
5. **Conflict prevention**: CTO assigns tasks with clear file ownership — Backend Dev owns `src/backend/`, Frontend Dev owns `src/frontend/`. Shared contracts (API types) are owned by CTO.

### Sandboxing

Code generation runs in a sandboxed environment:
- Agents can ONLY write to their project workspace directory
- File path validation: reject any path outside `workspaces/{project_id}/`
- No shell execution by agents (tests run in a controlled subprocess with timeout)
- Docker container for test execution (optional, for full isolation)

---

## 7. Cost Guardrails

### Per-Project Limits

```python
class CostConfig:
    max_total_budget_cents: int = 5000      # $50 default per project
    max_per_agent_call_cents: int = 50      # $0.50 per single LLM call
    max_per_phase_cents: int = 1000         # $10 per phase
    warning_threshold: float = 0.6          # 60% budget → warning
    critical_threshold: float = 0.8         # 80% budget → critical alert
    hard_stop_threshold: float = 0.95       # 95% budget → stop all agents
```

### Cost Tracking

Every LLM call logs:
- Model used
- Input/output token counts
- Calculated cost (based on model pricing table)
- Which agent, which phase, which task

CFO agent receives cost data and generates reports. But the Orchestrator enforces hard stops — if budget hits 95%, all agents pause and CEO is prompted.

---

## 8. Testing Strategy

### Unit Tests
- Each agent's output validation (mock LLM, verify schema compliance)
- Orchestrator state machine transitions (deterministic, no LLM needed)
- Task dependency resolution
- Cost calculation accuracy

### Integration Tests
- Agent → Orchestrator → Agent flow (with mocked LLM returning fixture responses)
- Approval gate flow (submit → review → approve/reject → state transition)
- Meeting engine (multi-agent turn-taking with mocked responses)

### LLM Quality Tests (Regression)
- **Golden prompts**: A set of known project briefs with expected outputs
- Run agents against golden prompts, compare outputs to baselines
- Flag regressions (PRD quality dropped, architecture missing key components)
- Uses recording/replay: save LLM responses, replay for deterministic tests

### E2E Test
- Full project lifecycle: brief → PRD → architecture → tasks → code → review → QA → complete
- Uses cheap/fast model for speed
- Validates: all states visited, all gates passed, code compiles, tests pass

---

## 9. Build Order (Incremental)

**Phase 1: Foundation**
1. Database schema + migrations (Alembic)
2. Base agent class + LLM provider abstraction (Gemini default)
3. Output validation pipeline (Pydantic models)
4. Orchestrator core (state machine + event router)
5. Redis pub/sub messaging layer

**Phase 2: Core Loop**
6. CEO agent (human interface — receives brief, provides approvals)
7. CPO agent (discovery, PRD creation)
8. CEO ↔ CPO clarification loop (max 3 rounds)
9. Gate 1: PRD approval flow

**Phase 3: Technical Planning**
10. CTO agent (architecture, task breakdown)
11. CFO agent (budget calculation — service code + light LLM)
12. Gate 2: Architecture + budget approval

**Phase 4: Development**
13. Backend Dev agent (code generation + git)
14. Git integration (branches, commits, diffs)
15. CTO code review (automated diff review)
16. Parallel agent execution (asyncio)

**Phase 5: Quality**
17. QA Reviewer agent
18. Bug tracking system
19. Frontend Dev agent
20. Gate 3: UAT (CPO acceptance)

**Phase 6: Dashboard (MVP)**
21. Approval Center (the critical human-in-the-loop UI)
22. Project state visualization
23. Agent activity feed (real-time via WebSocket)

**Phase 7: Full Dashboard**
24. Task board (kanban)
25. Meeting viewer
26. Budget dashboard
27. Audit log viewer

**Phase 8: Polish**
28. Meeting engine (C-Level, standup, sprint planning, bug triage)
29. Sprint planning automation
30. Full deployment setup (Gate 4)
31. Error monitoring + logging

---

## 10. Project Structure

```
met-system/
├── docker-compose.yml
├── .env.example
│
├── backend/                      # FastAPI + Agent Engine
│   ├── pyproject.toml
│   ├── alembic/                  # DB migrations
│   │   └── versions/
│   ├── app/
│   │   ├── main.py               # FastAPI app entry
│   │   ├── config.py             # Settings, env vars
│   │   ├── database.py           # SQLAlchemy engine + session
│   │   │
│   │   ├── models/               # SQLAlchemy ORM models
│   │   │   ├── project.py
│   │   │   ├── task.py
│   │   │   ├── document.py
│   │   │   ├── meeting.py
│   │   │   ├── budget.py
│   │   │   ├── bug.py
│   │   │   └── audit.py
│   │   │
│   │   ├── schemas/              # Pydantic models (API + validation)
│   │   │   ├── project.py
│   │   │   ├── task.py
│   │   │   ├── agent_output.py   # Output schemas per agent
│   │   │   └── ...
│   │   │
│   │   ├── api/                  # FastAPI routes
│   │   │   ├── projects.py
│   │   │   ├── tasks.py
│   │   │   ├── gates.py
│   │   │   ├── agents.py
│   │   │   ├── meetings.py
│   │   │   └── websocket.py
│   │   │
│   │   ├── agents/               # Agent implementations
│   │   │   ├── base.py           # BaseAgent class
│   │   │   ├── ceo.py
│   │   │   ├── cpo.py
│   │   │   ├── cto.py
│   │   │   ├── cfo.py
│   │   │   ├── backend_dev.py
│   │   │   ├── frontend_dev.py
│   │   │   ├── qa_reviewer.py
│   │   │   └── prompts/          # System prompts per agent
│   │   │       ├── cpo_system.md
│   │   │       ├── cto_system.md
│   │   │       └── ...
│   │   │
│   │   ├── orchestrator/         # The brain
│   │   │   ├── engine.py         # Main orchestrator loop
│   │   │   ├── state_machine.py  # State transitions + validation
│   │   │   ├── event_router.py   # Event handling
│   │   │   ├── gate_manager.py   # Approval gate logic
│   │   │   ├── agent_manager.py  # Agent lifecycle
│   │   │   └── deadlock.py       # Deadlock detection
│   │   │
│   │   ├── meetings/             # Meeting engine
│   │   │   ├── engine.py         # Turn management
│   │   │   ├── templates.py      # Meeting type templates
│   │   │   └── extraction.py     # Decision/action extraction
│   │   │
│   │   ├── llm/                  # LLM provider abstraction
│   │   │   ├── base.py           # BaseLLMProvider
│   │   │   ├── gemini.py         # Google Gemini
│   │   │   ├── openai.py         # OpenAI (future)
│   │   │   └── anthropic.py      # Anthropic (future)
│   │   │
│   │   ├── services/             # Business logic
│   │   │   ├── cost_tracker.py   # Cost tracking + alerts
│   │   │   ├── git_service.py    # Git operations for workspaces
│   │   │   ├── file_service.py   # Sandboxed file I/O
│   │   │   └── context.py        # Context management for agents
│   │   │
│   │   └── core/                 # Shared utilities
│   │       ├── events.py         # Event types
│   │       ├── redis.py          # Redis client
│   │       └── exceptions.py
│   │
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── fixtures/             # Golden prompts, mock LLM responses
│
├── frontend/                     # Next.js Dashboard
│   ├── package.json
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          # Project list / create
│   │   │   ├── projects/
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx          # Project overview
│   │   │   │       ├── approvals/page.tsx # Approval center
│   │   │   │       ├── agents/page.tsx    # Agent activity
│   │   │   │       ├── tasks/page.tsx     # Task board
│   │   │   │       ├── meetings/page.tsx  # Meeting viewer
│   │   │   │       ├── budget/page.tsx    # Budget dashboard
│   │   │   │       └── audit/page.tsx     # Audit log
│   │   │   └── api/              # Minimal API routes (auth only)
│   │   ├── components/
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts   # Real-time connection to FastAPI
│   │   └── lib/
│   │       └── api.ts            # FastAPI client
│   └── ...
│
└── workspaces/                   # Generated project code lives here
    └── {project-id}/
```
