# Tech Stack Templates + Unified Preview — Design

**Goal:** Let users choose a tech stack at project creation (6 preset templates), constrain agents to that stack, and preview both Node.js and Python projects live in the browser.

**Architecture:** Template-driven approach. Each template is a data object containing tech_stack constraints, scaffold files (bootable hello-world), run commands, and preview configuration. Node.js templates use the existing WebContainer in-browser preview. Python templates use Docker containers on the backend with a reverse proxy to an iframe. Same 6-agent pipeline runs regardless — CTO receives the selected stack as a hard constraint.

**Tech Stack:** FastAPI (preview service), Docker SDK for Python (`docker` pip package), existing WebContainer for Node.js, Redis for ephemeral preview state.

---

## 1. Template Definitions

Each template is a Python dataclass. All templates are defined in one file (`backend/app/templates/registry.py`) — the single source of truth shared across backend modules.

### Fields

| Field | Type | Purpose |
|-------|------|---------|
| `id` | `str` | Unique key (e.g., `"fastapi-html"`) |
| `label` | `str` | Display name (e.g., `"FastAPI + HTML"`) |
| `description` | `str` | One-liner for the UI card |
| `tech_stack` | `dict[str, str]` | Constraint dict passed to CTO |
| `container_port` | `int` | Port the app listens on inside the container |
| `run_command` | `str` | Startup command |
| `preview_type` | `"webcontainer" \| "docker"` | Which preview path to use |
| `scaffold_files` | `dict[str, str]` | Path-to-content map; every file forms a working hello-world |
| `file_conventions` | `str` | Injected into agent context — exact file paths and structure |

### Templates

| ID | Label | Frontend | Backend | Port | Preview |
|----|-------|----------|---------|------|---------|
| `react-express` | React + Express | React 18 | Express.js | 3000 | webcontainer |
| `nextjs` | Next.js Full-Stack | Next.js 14 (App Router) | Next.js API Routes | 3000 | webcontainer |
| `fastapi-html` | FastAPI + HTML | Vanilla HTML/CSS/JS | FastAPI | 8080 | docker |
| `flask` | Flask Web App | Jinja2 templates | Flask | 5000 | docker |
| `vanilla` | Vanilla HTML/CSS/JS | HTML/CSS/JS | None (http-server) | 3000 | webcontainer |
| `express` | Express.js API | None | Express.js | 3000 | webcontainer |

### Scaffold Requirement

Every scaffold is a **self-contained, bootable hello-world**. No `# TODO` placeholders, no imports of unwritten modules. The FastAPI scaffold serves an HTML page with "Hello World" on first run. Agents then modify these files — they do not create from scratch.

---

## 2. Project Creation Flow

### Frontend

3-step form inside the existing "Create Project" dialog (made wider to fit the template grid):

1. **Project name** — text input
2. **Tech stack** — 6 clickable cards in a 3x2 grid, selected card gets a highlighted border
3. **Brief** — textarea describing what to build

Submit sends: `{ name, brief, config: { template_id: "fastapi-html" } }`

### Backend

- `ProjectCreate` already accepts `config: dict = {}` via the JSONB column — no migration needed.
- Backend looks up `config.get("template_id")` against the template registry.
- **If `template_id` is missing or not in the registry** → `400 Bad Request` with error message listing valid template IDs.
- On success: full template config is merged into `project.config`.
- Workspace init: scaffold files from the template are written to `workspaces/{project_id}/`, git init + initial commit (`"scaffold: {template_label} starter"`).

### Frontend TypeScript

Add `config` to the `Project` interface:

```typescript
export interface Project {
  id: string;
  name: string;
  brief: string;
  state: ProjectState;
  config: { template_id?: string; [key: string]: unknown };
  created_at: string;
  updated_at: string;
}
```

---

## 3. Preview Architecture

Two preview paths, same frontend interface. The frontend checks `project.config.template_id` to determine which path.

### Path 1: WebContainer (Node.js templates) — existing

No changes needed except replacing the `hasPackageJson` gate with a template-type check. Existing flow: load workspace files → boot WebContainer → `npm install` → `npm run dev` → iframe shows dev server.

### Path 2: Docker (Python templates) — new

#### Two-Phase Build (fixes the network issue)

**Phase 1 — Build (network ON):**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE {container_port}
CMD {run_command}
```

Bakes dependencies into the image. No pip install on every run.

**Phase 2 — Run (network OFF, sandboxed):**

```bash
docker run --rm --network=none --memory=256m --cpus=0.5 \
  --read-only --tmpfs /tmp:size=64m \
  -p 0:{container_port} \
  preview-{project_id}
```

#### Port Management

Docker's `-p 0:{port}` assigns a random host port. Stored in **Redis** (ephemeral state):

```
Key:   preview:{project_id}
Value: {"container_id": "abc123", "host_port": 49152, "started_at": "..."}
TTL:   600  (10 minutes — auto-cleanup)
```

Not stored in PostgreSQL — this is ephemeral runtime state.

#### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects/{id}/preview/start` | POST | Build image + start container |
| `/api/projects/{id}/preview/status` | GET | Returns `{status, host_port}` or `{status: "stopped"}` |
| `/api/projects/{id}/preview/stop` | POST | Kill container, clean up Redis key |
| `/api/projects/{id}/preview/logs` | GET (SSE) | Stream container stdout/stderr |
| `/api/projects/{id}/preview/proxy/{path:path}` | ALL | Reverse proxy to container |

#### Proxy with WebSocket Passthrough

The proxy endpoint uses `httpx.AsyncClient` for HTTP requests and handles `Upgrade: websocket` headers for WebSocket passthrough. Generated apps using WebSockets work in preview.

#### Container Stdout Streaming

Uses Docker SDK's `container.logs(stream=True, follow=True)` and pipes lines through the **existing Redis pub/sub -> WebSocket pipeline** as a new event type `preview.log`. No second real-time channel.

#### Container Lifecycle

- Max 1 container per project. Starting a new one kills the old one.
- Redis TTL of 600s (10 minutes). Background task checks for orphaned containers.
- No navigation detection — the 10-minute TTL handles cleanup.
- User can click "Stop" explicitly via `POST /preview/stop`.

#### Preview is a Snapshot

When the user clicks "Run," we copy the current workspace files, build the image, and run it. If agents write more code while the preview is running, the user sees a **"Restart"** button to rebuild with the latest files. No hot-reload, no file-watching.

#### Error States

| Scenario | User sees |
|----------|-----------|
| `pip install` fails | Terminal shows pip error. Preview pane: "Build failed — check terminal" |
| App crashes on startup | Terminal shows traceback. Preview pane: "App exited with code {N}" |
| Container OOM killed | Preview pane: "Process killed — app exceeded 256MB memory limit" |
| Container timeout (10 min) | Preview pane: "Preview timed out. Click Run to restart." |
| Docker not available | Preview pane: "Docker required for Python previews. Check server config." |

Diagnostic data: container exit code + last 50 lines of stderr, streamed as `preview.log` events.

---

## 4. Agent Prompt Adaptation

Same 6-agent pipeline. CTO is constrained, devs get file conventions.

### CTO Constraint (injected into architecture phase context)

```
[TECH STACK CONSTRAINT — PRE-SELECTED BY CLIENT]
The client has chosen the following tech stack. You MUST use these exact technologies.
Do NOT change the core selections. You may add supporting libraries (e.g., testing, linting).

Tech Stack: {tech_stack dict from template}
```

### Dev Agent File Conventions (injected into development phase context)

```
[FILE CONVENTIONS — MANDATORY]
This project uses the {template_label} template.

Project Structure:
{file_conventions string from template}

Entry Point: {run_command}
Port: {container_port}

IMPORTANT: The workspace already contains scaffold files. Build ON TOP of them.
Do NOT delete or rename the entry point. Do NOT change the port.
Modify existing files and add new ones as needed.
```

### Scaffold Awareness in Context

ContextService is updated: when a template is configured, it reads the workspace file listing and appends it to the project context:

```
[EXISTING WORKSPACE FILES]
main.py (45 lines)
requirements.txt (3 lines)
static/index.html (20 lines)
```

This prevents agents from overwriting the entry point with an incompatible structure.

---

## 5. Data Flow

```
User fills form: name + selects "FastAPI + HTML" + writes brief
          |
          v
POST /api/projects { name, brief, config: { template_id: "fastapi-html" } }
          |
          v
Backend: validate template_id (400 if invalid)
         save project with config
         write scaffold files to workspaces/{project_id}/
         git init + commit "scaffold: FastAPI + HTML starter"
          |
          v
POST /api/projects/{id}/start -> Pipeline begins
          |
          v
CPO discovery: brief includes "Tech Stack: FastAPI + HTML"
CTO architecture: receives CONSTRAINT, locks tech_stack
CFO budget: estimates based on chosen stack
Backend Dev + Frontend Dev: receive file conventions + scaffold listing
QA: tests against the known stack
          |
          v
Agents write code -> committed to workspace git repo
          |
          v
User clicks "Run Preview"
          |
          v
Frontend checks project.config.template_id
  |-- Node template -> WebContainer (existing path)
  '-- Python template -> POST /api/projects/{id}/preview/start
          |
          v
Backend: copy workspace files to temp build context
         docker build (network ON) -> image with deps installed
         docker run (network OFF) -> container on random host port
         store {container_id, host_port} in Redis with 10min TTL
          |
          v
Frontend iframe -> /api/projects/{id}/preview/proxy/
Terminal logs   -> WebSocket preview.log events via existing pipeline
          |
          v
Agents write more code while preview runs?
  -> User sees "Restart" button -> kills container, rebuilds with latest files
```

---

## 6. Files to Create/Modify

### Backend — New

| File | Purpose |
|------|---------|
| `backend/app/templates/__init__.py` | Package init |
| `backend/app/templates/registry.py` | Template definitions (all 6 templates, dataclass, lookup function) |
| `backend/app/templates/scaffolds/` | Scaffold file content (imported by registry) |
| `backend/app/services/preview_service.py` | Docker container lifecycle: build, start, stop, logs, status |
| `backend/app/api/preview.py` | FastAPI router: `/preview/start`, `/stop`, `/status`, `/logs`, `/proxy` |

### Backend — Modify

| File | Change |
|------|--------|
| `backend/app/api/projects.py` | Validate `template_id`, write scaffold files on create |
| `backend/app/api/__init__.py` | Register preview router |
| `backend/app/services/context.py` | Inject tech stack constraint, file conventions, scaffold listing |
| `backend/app/core/events.py` | Add `PREVIEW_LOG` event type |
| `backend/requirements.txt` / `pyproject.toml` | Add `docker` (Docker SDK) and `httpx` dependencies |

### Frontend — Modify

| File | Change |
|------|--------|
| `frontend/src/app/(dashboard)/page.tsx` | Add template selector grid to create dialog |
| `frontend/src/lib/api.ts` | Add `config` to `Project` type, add preview API functions, add template list type |
| `frontend/src/components/workspace/PreviewPanel.tsx` | Route to WebContainer or Docker preview based on template type |

### Frontend — New

| File | Purpose |
|------|---------|
| `frontend/src/components/workspace/DockerPreview.tsx` | Docker preview component (calls preview API, shows iframe + terminal) |
| `frontend/src/lib/templates.ts` | Template definitions for frontend (id, label, description, icon, preview_type) |
