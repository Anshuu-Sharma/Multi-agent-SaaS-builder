# Tech Stack Templates + Unified Preview — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 6 preset tech stack templates to project creation, constrain agents to the selected stack, and enable live preview for both Node.js (WebContainer) and Python (Docker) projects.

**Architecture:** Template definitions are a shared Python registry. Project creation validates the template, writes scaffold files to the workspace. Context service injects stack constraints into agent prompts. Preview service manages Docker containers for Python, routes through existing WebContainer for Node.js. Preview state stored in Redis (ephemeral). Container logs streamed through existing Redis pub/sub pipeline.

**Tech Stack:** Python 3.12, FastAPI, Docker SDK (`docker` pip package), `httpx` (already installed), Redis (ephemeral state), existing WebContainer for Node.js.

**Design doc:** `docs/plans/2026-02-27-tech-stack-preview-design.md`

---

## Task 1: Template Registry (Backend)

**Files:**
- Create: `backend/app/templates/__init__.py`
- Create: `backend/app/templates/registry.py`

**Step 1: Create the template package**

Create `backend/app/templates/__init__.py`:
```python
```

(Empty `__init__.py` — the registry module does the work.)

**Step 2: Write the template registry**

Create `backend/app/templates/registry.py`:
```python
"""Tech stack template definitions — single source of truth.

Each template defines:
- What tech stack to use (constraint for CTO)
- What scaffold files to write (bootable hello-world)
- How to preview (webcontainer vs docker)
- File conventions for agents
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Template:
    id: str
    label: str
    description: str
    tech_stack: dict[str, str]
    container_port: int
    run_command: str
    preview_type: str  # "webcontainer" | "docker"
    scaffold_files: dict[str, str]  # path -> content
    file_conventions: str


TEMPLATES: dict[str, Template] = {}


def _register(t: Template) -> None:
    TEMPLATES[t.id] = t


def get_template(template_id: str) -> Template | None:
    return TEMPLATES.get(template_id)


def list_templates() -> list[dict]:
    """Return template metadata for the frontend (no scaffold content)."""
    return [
        {
            "id": t.id,
            "label": t.label,
            "description": t.description,
            "preview_type": t.preview_type,
        }
        for t in TEMPLATES.values()
    ]


# ---- React + Express -------------------------------------------------------

_register(Template(
    id="react-express",
    label="React + Express",
    description="React 18 frontend with Express.js backend",
    tech_stack={
        "frontend_language": "TypeScript",
        "frontend_framework": "React 18",
        "backend_language": "TypeScript",
        "backend_framework": "Express.js",
        "runtime": "Node.js 20",
        "package_manager": "npm",
    },
    container_port=3000,
    run_command="npm run dev",
    preview_type="webcontainer",
    scaffold_files={
        "package.json": """{
  "name": "project",
  "private": true,
  "scripts": {
    "dev": "node server.js",
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}""",
        "server.js": """const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
""",
        "public/index.html": """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { text-align: center; padding: 2rem; }
    h1 { color: #333; }
    p { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Hello World</h1>
    <p>React + Express app is running.</p>
  </div>
</body>
</html>
""",
    },
    file_conventions="""server.js        — Express entry point (DO NOT rename)
package.json     — Node dependencies
public/          — Static files served by Express
  index.html     — Main page
  style.css      — Styles
  script.js      — Client-side JavaScript
src/             — React components (if using build step)
tests/           — Test files""",
))


# ---- Next.js ---------------------------------------------------------------

_register(Template(
    id="nextjs",
    label="Next.js Full-Stack",
    description="Next.js 14 with App Router and API routes",
    tech_stack={
        "language": "TypeScript",
        "framework": "Next.js 14 (App Router)",
        "runtime": "Node.js 20",
        "styling": "Tailwind CSS",
        "package_manager": "npm",
    },
    container_port=3000,
    run_command="npm run dev",
    preview_type="webcontainer",
    scaffold_files={
        "package.json": """{
  "name": "project",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}""",
        "app/page.tsx": """export default function Home() {
  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1>Hello World</h1>
        <p style={{ color: '#666' }}>Next.js app is running.</p>
      </div>
    </main>
  );
}
""",
        "app/layout.tsx": """export const metadata = { title: 'App', description: 'Next.js application' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
""",
    },
    file_conventions="""app/             — Next.js App Router pages and layouts
  page.tsx       — Home page
  layout.tsx     — Root layout (DO NOT delete)
  api/           — API route handlers
public/          — Static assets
package.json     — Node dependencies (DO NOT rename)
next.config.js   — Next.js configuration""",
))


# ---- FastAPI + HTML ---------------------------------------------------------

_register(Template(
    id="fastapi-html",
    label="FastAPI + HTML",
    description="Python FastAPI backend with vanilla HTML frontend",
    tech_stack={
        "language": "Python 3.12",
        "backend_framework": "FastAPI",
        "frontend": "Vanilla HTML/CSS/JavaScript",
        "server": "Uvicorn",
        "database": "SQLite (if needed)",
    },
    container_port=8080,
    run_command="uvicorn main:app --host 0.0.0.0 --port 8080",
    preview_type="docker",
    scaffold_files={
        "main.py": """from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
""",
        "requirements.txt": """fastapi==0.115.0
uvicorn[standard]==0.32.0
""",
        "static/index.html": """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <div class="container">
    <h1>Hello World</h1>
    <p>FastAPI app is running.</p>
  </div>
  <script src="/static/script.js"></script>
</body>
</html>
""",
        "static/style.css": """body {
  font-family: system-ui, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  margin: 0;
  background: #f5f5f5;
}
.container {
  text-align: center;
  padding: 2rem;
}
h1 { color: #333; }
p { color: #666; }
""",
        "static/script.js": """// Client-side JavaScript
console.log('App loaded');
""",
    },
    file_conventions="""main.py          — FastAPI app entry point (DO NOT rename)
requirements.txt — Python dependencies
static/          — Static HTML/CSS/JS files served by FastAPI
  index.html     — Main page
  style.css      — Styles
  script.js      — Client-side JavaScript
templates/       — Jinja2 templates (if needed)
tests/           — pytest test files""",
))


# ---- Flask ------------------------------------------------------------------

_register(Template(
    id="flask",
    label="Flask Web App",
    description="Python Flask with Jinja2 templates",
    tech_stack={
        "language": "Python 3.12",
        "backend_framework": "Flask",
        "frontend": "Jinja2 templates + HTML/CSS/JavaScript",
        "server": "Flask built-in (Werkzeug)",
        "database": "SQLite (if needed)",
    },
    container_port=5000,
    run_command="python app.py",
    preview_type="docker",
    scaffold_files={
        "app.py": """from flask import Flask, render_template, jsonify

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/health")
def health():
    return jsonify(status="ok")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
""",
        "requirements.txt": """flask==3.1.0
""",
        "templates/index.html": """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App</title>
  <link rel="stylesheet" href="{{ url_for('static', filename='style.css') }}">
</head>
<body>
  <div class="container">
    <h1>Hello World</h1>
    <p>Flask app is running.</p>
  </div>
</body>
</html>
""",
        "static/style.css": """body {
  font-family: system-ui, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  margin: 0;
  background: #f5f5f5;
}
.container {
  text-align: center;
  padding: 2rem;
}
h1 { color: #333; }
p { color: #666; }
""",
    },
    file_conventions="""app.py           — Flask app entry point (DO NOT rename)
requirements.txt — Python dependencies
templates/       — Jinja2 HTML templates
  index.html     — Main page template
static/          — Static CSS/JS/image files
  style.css      — Styles
tests/           — pytest test files""",
))


# ---- Vanilla HTML -----------------------------------------------------------

_register(Template(
    id="vanilla",
    label="Vanilla HTML/CSS/JS",
    description="Pure HTML, CSS, and JavaScript — no framework",
    tech_stack={
        "language": "JavaScript",
        "frontend": "Vanilla HTML/CSS/JavaScript",
        "backend": "None (static file server)",
        "runtime": "Node.js 20 (for http-server)",
    },
    container_port=3000,
    run_command="npx http-server -p 3000",
    preview_type="webcontainer",
    scaffold_files={
        "package.json": """{
  "name": "project",
  "private": true,
  "scripts": {
    "dev": "npx http-server -p 3000 -c-1",
    "start": "npx http-server -p 3000"
  },
  "devDependencies": {
    "http-server": "^14.1.1"
  }
}""",
        "index.html": """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>App</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <h1>Hello World</h1>
    <p>App is running.</p>
  </div>
  <script src="script.js"></script>
</body>
</html>
""",
        "style.css": """body {
  font-family: system-ui, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  margin: 0;
  background: #f5f5f5;
}
.container {
  text-align: center;
  padding: 2rem;
}
h1 { color: #333; }
p { color: #666; }
""",
        "script.js": """// Client-side JavaScript
console.log('App loaded');
""",
    },
    file_conventions="""index.html       — Main page (DO NOT rename)
style.css        — Styles
script.js        — Client-side JavaScript
package.json     — Dev dependencies (http-server)
assets/          — Images, fonts, etc.""",
))


# ---- Express.js API ---------------------------------------------------------

_register(Template(
    id="express",
    label="Express.js API",
    description="Express.js REST API backend",
    tech_stack={
        "language": "JavaScript",
        "backend_framework": "Express.js",
        "runtime": "Node.js 20",
        "package_manager": "npm",
    },
    container_port=3000,
    run_command="node index.js",
    preview_type="webcontainer",
    scaffold_files={
        "package.json": """{
  "name": "project",
  "private": true,
  "scripts": {
    "dev": "node index.js",
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}""",
        "index.js": """const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Hello World', status: 'running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
""",
    },
    file_conventions="""index.js         — Express entry point (DO NOT rename)
package.json     — Node dependencies
routes/          — Route handler modules
middleware/      — Express middleware
tests/           — Test files""",
))
```

**Step 3: Verify the module loads**

Run: `cd backend && python -c "from app.templates.registry import TEMPLATES, list_templates; print(f'{len(TEMPLATES)} templates'); print([t['id'] for t in list_templates()])"`

Expected: `6 templates` followed by `['react-express', 'nextjs', 'fastapi-html', 'flask', 'vanilla', 'express']`

**Step 4: Commit**

```bash
git add backend/app/templates/
git commit -m "feat: add tech stack template registry with 6 preset templates"
```

---

## Task 2: Template API Endpoint + Scaffold on Create (Backend)

**Files:**
- Create: `backend/app/api/templates.py`
- Modify: `backend/app/api/projects.py`
- Modify: `backend/app/main.py`

**Step 1: Create the templates API router**

Create `backend/app/api/templates.py`:
```python
"""REST endpoint to list available tech stack templates."""

from fastapi import APIRouter

from app.templates.registry import list_templates

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("")
async def get_templates():
    """Return all available templates (metadata only, no scaffold content)."""
    return list_templates()
```

**Step 2: Modify project creation to validate template and write scaffold**

In `backend/app/api/projects.py`, add the template validation and scaffold writing logic. After the existing `project = Project(...)` line:

```python
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.templates.registry import get_template
from app.services.git_service import GitService

logger = logging.getLogger(__name__)
```

Then modify the `create_project` function to:

```python
@router.post("", response_model=ProjectRead, status_code=201)
async def create_project(body: ProjectCreate, db: AsyncSession = Depends(get_db)):
    # Validate template_id if provided
    template_id = body.config.get("template_id")
    template = None
    if template_id:
        template = get_template(template_id)
        if template is None:
            from app.templates.registry import TEMPLATES
            valid_ids = ", ".join(TEMPLATES.keys())
            raise HTTPException(
                status_code=400,
                detail=f"Invalid template_id '{template_id}'. Must be one of: {valid_ids}",
            )

    project = Project(name=body.name, brief=body.brief, config=body.config)
    db.add(project)
    await db.flush()

    # Create default budget
    budget = Budget(
        project_id=project.id,
        total_budget_cents=body.config.get("budget_cents", 5000),
    )
    db.add(budget)
    await db.flush()

    # Write scaffold files if template selected
    if template:
        try:
            import asyncio
            from app.schemas.agent_output import FileWrite

            workspace = await asyncio.to_thread(
                GitService.init_workspace, project.id
            )
            files = [
                FileWrite(path=path, content=content)
                for path, content in template.scaffold_files.items()
            ]
            await asyncio.to_thread(GitService.write_files, workspace, files)
            await asyncio.to_thread(
                GitService.commit,
                workspace,
                f"scaffold: {template.label} starter",
            )
        except Exception as e:
            logger.warning(f"Failed to write scaffold files: {e}")
            # Don't fail project creation if scaffold write fails

    return project
```

**Step 3: Register the templates router in main.py**

In `backend/app/main.py`, add alongside the other router imports:
```python
from app.api.templates import router as templates_router
```

And in the router registration section add:
```python
app.include_router(templates_router)
```

**Step 4: Verify**

Run: `cd backend && python -c "from app.api.templates import router; print('templates router OK')"`

Run: `cd backend && python -c "from app.api.projects import router; print('projects router OK')"`

Expected: Both print OK.

**Step 5: Commit**

```bash
git add backend/app/api/templates.py backend/app/api/projects.py backend/app/main.py
git commit -m "feat: validate template on project create, write scaffold files"
```

---

## Task 3: Context Service — Inject Stack Constraints + File Conventions (Backend)

**Files:**
- Modify: `backend/app/services/context.py`

**Step 1: Add template-aware context injection**

Modify `backend/app/services/context.py`. The `build_agent_context` method needs to inject three things when a template is configured:

1. Tech stack constraint (for CTO during architecture)
2. File conventions (for dev agents during development)
3. Existing workspace file listing (for all agents)

Add this import at the top:
```python
from app.templates.registry import get_template
from app.services.file_service import FileService
```

Then modify `build_agent_context` — insert after the project brief section (after line 96 "I have the project context.") and before the relevant documents section:

```python
        # ---- 1b. Template constraints (if configured) ------------------
        template_id = project.config.get("template_id") if project.config else None
        if template_id:
            template = get_template(template_id)
            if template:
                # For CTO during architecture: hard constraint
                if agent_role == "cto" and phase == "architecture":
                    stack_lines = "\n".join(
                        f"  - {k}: {v}" for k, v in template.tech_stack.items()
                    )
                    messages.append({
                        "role": "user",
                        "content": (
                            "[TECH STACK CONSTRAINT — PRE-SELECTED BY CLIENT]\n"
                            "The client has chosen the following tech stack. "
                            "You MUST use these exact technologies. "
                            "Do NOT change the core selections. "
                            "You may add supporting libraries (e.g., testing, linting).\n\n"
                            f"Tech Stack:\n{stack_lines}"
                        ),
                    })
                    messages.append({
                        "role": "model",
                        "content": "Understood. I will design the architecture using the pre-selected tech stack.",
                    })

                # For dev agents: file conventions + scaffold awareness
                if agent_role in ("backend_dev", "frontend_dev") and phase in ("development", "code_fix"):
                    messages.append({
                        "role": "user",
                        "content": (
                            f"[FILE CONVENTIONS — MANDATORY]\n"
                            f"This project uses the {template.label} template.\n\n"
                            f"Project Structure:\n{template.file_conventions}\n\n"
                            f"Entry Point: {template.run_command}\n"
                            f"Port: {template.container_port}\n\n"
                            "IMPORTANT: The workspace already contains scaffold files. "
                            "Build ON TOP of them. Do NOT delete or rename the entry point. "
                            "Do NOT change the port. Modify existing files and add new ones as needed."
                        ),
                    })
                    messages.append({
                        "role": "model",
                        "content": "Understood. I will build on the existing scaffold files and follow the file conventions.",
                    })

                # For all agents: include workspace file listing
                try:
                    workspace_files = FileService.list_files(project_id)
                    if workspace_files:
                        file_list = "\n".join(
                            f"  {f.path} ({f.size} bytes)"
                            for f in workspace_files
                            if not f.is_dir
                        )
                        messages.append({
                            "role": "user",
                            "content": f"[EXISTING WORKSPACE FILES]\n{file_list}",
                        })
                        messages.append({
                            "role": "model",
                            "content": "I see the existing workspace files.",
                        })
                except Exception:
                    pass  # Workspace may not exist yet during early phases

                # For CPO: mention the stack in the brief context
                if agent_role == "cpo":
                    messages.append({
                        "role": "user",
                        "content": f"[TECH STACK NOTE]\nThe client has pre-selected: {template.label}. Keep this in mind during discovery and PRD creation.",
                    })
                    messages.append({
                        "role": "model",
                        "content": f"Noted. The project will use {template.label}.",
                    })
```

**Step 2: Verify**

Run: `cd backend && python -c "from app.services.context import ContextService; print('context service OK')"`

Expected: `context service OK`

**Step 3: Commit**

```bash
git add backend/app/services/context.py
git commit -m "feat: inject tech stack constraints and file conventions into agent context"
```

---

## Task 4: Preview Service — Docker Container Lifecycle (Backend)

**Files:**
- Create: `backend/app/services/preview_service.py`
- Modify: `backend/app/core/events.py`

**Step 1: Add PREVIEW_LOG event type**

In `backend/app/core/events.py`, add to the `EventType` enum:
```python
    PREVIEW_LOG = "preview.log"
```

**Step 2: Create the preview service**

Create `backend/app/services/preview_service.py`:
```python
"""Preview service — manages Docker containers for Python project previews.

For Node.js templates, the frontend uses WebContainer (browser-side).
For Python templates, this service manages Docker containers on the backend.

Lifecycle: build image (network ON) -> run container (network OFF) -> proxy -> stop.
Ephemeral state stored in Redis with 10-minute TTL.
"""

import asyncio
import json
import logging
import uuid
from pathlib import Path

from app.core.redis import redis_client
from app.services.file_service import FileService
from app.templates.registry import get_template

logger = logging.getLogger(__name__)

PREVIEW_TTL = 600  # 10 minutes
PREVIEW_KEY_PREFIX = "preview:"
DOCKER_AVAILABLE: bool | None = None


def _check_docker() -> bool:
    """Check if Docker is available on this system."""
    global DOCKER_AVAILABLE
    if DOCKER_AVAILABLE is not None:
        return DOCKER_AVAILABLE
    try:
        import docker
        client = docker.from_env()
        client.ping()
        DOCKER_AVAILABLE = True
    except Exception:
        DOCKER_AVAILABLE = False
    return DOCKER_AVAILABLE


async def _get_preview_state(project_id: uuid.UUID) -> dict | None:
    """Get the current preview state from Redis."""
    key = f"{PREVIEW_KEY_PREFIX}{project_id}"
    data = await redis_client.get(key)
    if data:
        return json.loads(data)
    return None


async def _set_preview_state(project_id: uuid.UUID, state: dict) -> None:
    """Store preview state in Redis with TTL."""
    key = f"{PREVIEW_KEY_PREFIX}{project_id}"
    await redis_client.set(key, json.dumps(state), ex=PREVIEW_TTL)


async def _clear_preview_state(project_id: uuid.UUID) -> None:
    """Remove preview state from Redis."""
    key = f"{PREVIEW_KEY_PREFIX}{project_id}"
    await redis_client.delete(key)


async def get_preview_status(project_id: uuid.UUID) -> dict:
    """Return current preview status for a project."""
    state = await _get_preview_state(project_id)
    if not state:
        return {"status": "stopped"}

    # Verify container is still running
    try:
        import docker
        client = docker.from_env()
        container = client.containers.get(state["container_id"])
        if container.status != "running":
            await _clear_preview_state(project_id)
            return {"status": "stopped", "exit_code": container.attrs.get("State", {}).get("ExitCode")}
        return {
            "status": "running",
            "host_port": state["host_port"],
            "container_id": state["container_id"],
            "started_at": state.get("started_at"),
        }
    except Exception:
        await _clear_preview_state(project_id)
        return {"status": "stopped"}


async def start_preview(project_id: uuid.UUID, config: dict) -> dict:
    """Build and start a Docker container for preview.

    Returns: {"status": "running"|"error", "host_port": int, ...}
    """
    if not _check_docker():
        return {"status": "error", "error": "Docker is not available on this server."}

    template_id = config.get("template_id")
    if not template_id:
        return {"status": "error", "error": "No template configured for this project."}

    template = get_template(template_id)
    if not template or template.preview_type != "docker":
        return {"status": "error", "error": f"Template '{template_id}' does not use Docker preview."}

    # Stop any existing preview first
    await stop_preview(project_id)

    import docker
    client = docker.from_env()

    image_tag = f"preview-{project_id}"
    workspace_root = FileService._workspace_for(project_id)

    if not workspace_root.exists():
        return {"status": "error", "error": "Workspace not found. No files to preview."}

    try:
        # Phase 1: Build image (network ON — pip can download packages)
        dockerfile_content = (
            "FROM python:3.12-slim\n"
            "WORKDIR /app\n"
            "COPY requirements.txt* ./\n"
            "RUN pip install --no-cache-dir -r requirements.txt 2>/dev/null || true\n"
            "COPY . .\n"
            f"EXPOSE {template.container_port}\n"
            f'CMD {json.dumps(template.run_command.split())}\n'
        )

        # Write Dockerfile to workspace temporarily
        dockerfile_path = workspace_root / "Dockerfile.preview"
        await asyncio.to_thread(
            dockerfile_path.write_text, dockerfile_content, "utf-8"
        )

        try:
            logger.info(f"Building preview image for project {project_id}")
            image, build_logs = await asyncio.to_thread(
                lambda: client.images.build(
                    path=str(workspace_root),
                    dockerfile="Dockerfile.preview",
                    tag=image_tag,
                    rm=True,
                    forcerm=True,
                )
            )
        finally:
            # Clean up Dockerfile from workspace
            await asyncio.to_thread(dockerfile_path.unlink, True)

        # Phase 2: Run container (network OFF, sandboxed)
        logger.info(f"Starting preview container for project {project_id}")
        container = await asyncio.to_thread(
            lambda: client.containers.run(
                image_tag,
                detach=True,
                remove=True,
                network_mode="none",
                mem_limit="256m",
                cpu_period=100000,
                cpu_quota=50000,  # 0.5 CPUs
                read_only=True,
                tmpfs={"/tmp": "size=64m"},
                ports={f"{template.container_port}/tcp": None},  # Random host port
            )
        )

        # Wait briefly for container to start
        await asyncio.sleep(1)

        # Get assigned host port
        container.reload()
        port_info = container.ports.get(f"{template.container_port}/tcp")
        if not port_info:
            # Container may have crashed immediately
            logs = container.logs(tail=50).decode("utf-8", errors="replace")
            try:
                container.kill()
            except Exception:
                pass
            return {
                "status": "error",
                "error": "Container started but no port was assigned. App may have crashed.",
                "logs": logs,
            }

        host_port = int(port_info[0]["HostPort"])

        # Store state in Redis
        await _set_preview_state(project_id, {
            "container_id": container.id,
            "host_port": host_port,
            "started_at": str(asyncio.get_event_loop().time()),
            "template_id": template_id,
        })

        logger.info(f"Preview running for project {project_id} on port {host_port}")
        return {
            "status": "running",
            "host_port": host_port,
            "container_id": container.id,
        }

    except Exception as e:
        logger.error(f"Failed to start preview for project {project_id}: {e}")
        return {"status": "error", "error": str(e)}


async def stop_preview(project_id: uuid.UUID) -> dict:
    """Stop a running preview container."""
    state = await _get_preview_state(project_id)
    if not state:
        return {"status": "stopped"}

    try:
        import docker
        client = docker.from_env()
        container = client.containers.get(state["container_id"])
        await asyncio.to_thread(container.kill)
        logger.info(f"Stopped preview container for project {project_id}")
    except Exception as e:
        logger.debug(f"Container already stopped or not found: {e}")

    await _clear_preview_state(project_id)
    return {"status": "stopped"}


async def get_preview_logs(project_id: uuid.UUID, tail: int = 100) -> str:
    """Get recent logs from the preview container."""
    state = await _get_preview_state(project_id)
    if not state:
        return ""

    try:
        import docker
        client = docker.from_env()
        container = client.containers.get(state["container_id"])
        logs = await asyncio.to_thread(
            lambda: container.logs(tail=tail, timestamps=True).decode("utf-8", errors="replace")
        )
        return logs
    except Exception:
        return ""
```

**Step 3: Add `docker` dependency**

Add to `backend/pyproject.toml` dependencies:
```
docker>=7.0.0
```

**Step 4: Verify**

Run: `cd backend && python -c "from app.services.preview_service import get_preview_status; print('preview service OK')"`

Expected: `preview service OK`

**Step 5: Commit**

```bash
git add backend/app/services/preview_service.py backend/app/core/events.py backend/pyproject.toml
git commit -m "feat: Docker preview service for Python project containers"
```

---

## Task 5: Preview API Router (Backend)

**Files:**
- Create: `backend/app/api/preview.py`
- Modify: `backend/app/main.py`

**Step 1: Create the preview API router**

Create `backend/app/api/preview.py`:
```python
"""Preview endpoints — start/stop/status/proxy/logs for Docker preview containers."""

import uuid

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse

from app.services import preview_service

router = APIRouter(
    prefix="/api/projects/{project_id}/preview",
    tags=["preview"],
)


@router.post("/start")
async def start_preview(project_id: uuid.UUID):
    """Build and start a preview container for this project."""
    from app.database import async_session
    from app.models.project import Project
    from sqlalchemy import select

    async with async_session() as db:
        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(404, "Project not found")

        resp = await preview_service.start_preview(project_id, project.config or {})
        if resp["status"] == "error":
            raise HTTPException(400, resp.get("error", "Failed to start preview"))
        return resp


@router.get("/status")
async def preview_status(project_id: uuid.UUID):
    """Get current preview status."""
    return await preview_service.get_preview_status(project_id)


@router.post("/stop")
async def stop_preview(project_id: uuid.UUID):
    """Stop the running preview container."""
    return await preview_service.stop_preview(project_id)


@router.get("/logs")
async def preview_logs(project_id: uuid.UUID, tail: int = 100):
    """Get recent logs from the preview container."""
    logs = await preview_service.get_preview_logs(project_id, tail=tail)
    return {"logs": logs}


@router.api_route(
    "/proxy/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
async def preview_proxy(project_id: uuid.UUID, path: str, request: Request):
    """Reverse proxy requests to the preview container."""
    status = await preview_service.get_preview_status(project_id)
    if status["status"] != "running":
        raise HTTPException(503, "Preview is not running")

    host_port = status["host_port"]
    target_url = f"http://127.0.0.1:{host_port}/{path}"

    # Forward query string
    if request.url.query:
        target_url += f"?{request.url.query}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            body = await request.body()
            # Forward headers (except host)
            headers = {
                k: v for k, v in request.headers.items()
                if k.lower() not in ("host", "content-length")
            }

            resp = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body if body else None,
            )

            # Forward response
            response_headers = dict(resp.headers)
            # Remove hop-by-hop headers
            for h in ("transfer-encoding", "connection", "keep-alive"):
                response_headers.pop(h, None)

            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=response_headers,
            )
        except httpx.ConnectError:
            raise HTTPException(502, "Cannot connect to preview container")
        except httpx.TimeoutException:
            raise HTTPException(504, "Preview container timed out")
```

**Step 2: Register the preview router in main.py**

In `backend/app/main.py`, add alongside the other router imports:
```python
from app.api.preview import router as preview_router
```

And in the router registration section add:
```python
app.include_router(preview_router)
```

**Step 3: Verify**

Run: `cd backend && python -c "from app.api.preview import router; print('preview router OK')"`

Expected: `preview router OK`

**Step 4: Commit**

```bash
git add backend/app/api/preview.py backend/app/main.py
git commit -m "feat: preview API router — start/stop/status/proxy/logs endpoints"
```

---

## Task 6: Frontend Template Definitions + API Functions

**Files:**
- Create: `frontend/src/lib/templates.ts`
- Modify: `frontend/src/lib/api.ts`

**Step 1: Create the frontend template definitions**

Create `frontend/src/lib/templates.ts`:
```typescript
export interface TemplateInfo {
  id: string;
  label: string;
  description: string;
  preview_type: "webcontainer" | "docker";
  icon: string; // emoji for the card
}

/**
 * Template definitions for the frontend UI.
 * Source of truth is the backend — this is display-only metadata.
 */
export const TEMPLATES: TemplateInfo[] = [
  {
    id: "react-express",
    label: "React + Express",
    description: "React 18 frontend with Express.js backend",
    preview_type: "webcontainer",
    icon: "\u269b",
  },
  {
    id: "nextjs",
    label: "Next.js Full-Stack",
    description: "Next.js 14 with App Router and API routes",
    preview_type: "webcontainer",
    icon: "\u25b2",
  },
  {
    id: "fastapi-html",
    label: "FastAPI + HTML",
    description: "Python FastAPI backend with vanilla HTML frontend",
    preview_type: "docker",
    icon: "\u26a1",
  },
  {
    id: "flask",
    label: "Flask Web App",
    description: "Python Flask with Jinja2 templates",
    preview_type: "docker",
    icon: "\ud83c\udf36\ufe0f",
  },
  {
    id: "vanilla",
    label: "Vanilla HTML/CSS/JS",
    description: "Pure HTML, CSS, and JavaScript \u2014 no framework",
    preview_type: "webcontainer",
    icon: "\ud83c\udf10",
  },
  {
    id: "express",
    label: "Express.js API",
    description: "Express.js REST API backend",
    preview_type: "webcontainer",
    icon: "\ud83d\udce6",
  },
];

export function getTemplate(id: string): TemplateInfo | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
```

**Step 2: Add preview API functions and update Project type in api.ts**

In `frontend/src/lib/api.ts`:

Update the `Project` interface to include `config`:
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

Update `createProject` to accept `template_id` via config:
```typescript
export function createProject(data: {
  name: string;
  brief: string;
  config?: { template_id?: string; [key: string]: unknown };
}) {
  return apiFetch<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
```

Add preview API types and functions at the bottom:
```typescript
// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface PreviewStatus {
  status: "running" | "stopped" | "error";
  host_port?: number;
  container_id?: string;
  started_at?: string;
  error?: string;
  exit_code?: number;
  logs?: string;
}

export function startPreview(projectId: string) {
  return apiFetch<PreviewStatus>(`/api/projects/${projectId}/preview/start`, {
    method: "POST",
  });
}

export function getPreviewStatus(projectId: string) {
  return apiFetch<PreviewStatus>(`/api/projects/${projectId}/preview/status`);
}

export function stopPreview(projectId: string) {
  return apiFetch<PreviewStatus>(`/api/projects/${projectId}/preview/stop`, {
    method: "POST",
  });
}

export function getPreviewLogs(projectId: string, tail = 100) {
  return apiFetch<{ logs: string }>(
    `/api/projects/${projectId}/preview/logs?tail=${tail}`
  );
}

export function getPreviewProxyUrl(projectId: string): string {
  return `${BASE_URL}/api/projects/${projectId}/preview/proxy/`;
}
```

**Step 3: Verify frontend builds**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors.

**Step 4: Commit**

```bash
git add frontend/src/lib/templates.ts frontend/src/lib/api.ts
git commit -m "feat: frontend template definitions and preview API client functions"
```

---

## Task 7: Project Creation Form — Template Selector (Frontend)

**Files:**
- Modify: `frontend/src/app/(dashboard)/page.tsx`

**Step 1: Add template selector grid to the create dialog**

The dialog currently has: name input → brief textarea → submit button.

Change it to: name input → **template grid** → brief textarea → submit button.

Modify `frontend/src/app/(dashboard)/page.tsx`:

Add imports:
```typescript
import { TEMPLATES, type TemplateInfo } from "@/lib/templates";
```

Add state for selected template:
```typescript
const [selectedTemplate, setSelectedTemplate] = useState<string>("nextjs");
```

Update `handleCreate` to include template:
```typescript
async function handleCreate() {
    if (!name.trim() || !selectedTemplate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const project = await createProject({
        name: name.trim(),
        brief: brief.trim(),
        config: { template_id: selectedTemplate },
      });
      setDialogOpen(false);
      setName("");
      setBrief("");
      setSelectedTemplate("nextjs");
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }
```

Widen the dialog and add the template grid between name and brief:
```tsx
<DialogContent className="bg-white border border-[#1A1A18]/8 shadow-lg sm:max-w-[640px]">
```

Add this section after the name input div and before the brief textarea div:
```tsx
<div>
  <label className="text-xs font-medium text-[#1A1A18]/70 mb-2 block">
    Tech Stack
  </label>
  <div className="grid grid-cols-3 gap-2">
    {TEMPLATES.map((t) => (
      <button
        key={t.id}
        type="button"
        onClick={() => setSelectedTemplate(t.id)}
        className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
          selectedTemplate === t.id
            ? "border-[#D4583A] bg-[#D4583A]/5 ring-1 ring-[#D4583A]/20"
            : "border-[#1A1A18]/10 bg-[#FAF9F7] hover:border-[#1A1A18]/20"
        }`}
      >
        <span className="text-lg mb-1">{t.icon}</span>
        <span className="text-xs font-medium text-[#1A1A18]">
          {t.label}
        </span>
        <span className="text-[10px] text-[#1A1A18]/55 mt-0.5 line-clamp-1">
          {t.description}
        </span>
      </button>
    ))}
  </div>
</div>
```

Update the submit button disabled condition:
```tsx
disabled={!name.trim() || !selectedTemplate || creating}
```

**Step 2: Verify frontend builds**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/app/(dashboard)/page.tsx
git commit -m "feat: add tech stack template selector grid to project creation form"
```

---

## Task 8: Docker Preview Component (Frontend)

**Files:**
- Create: `frontend/src/components/workspace/DockerPreview.tsx`

**Step 1: Create the Docker preview component**

Create `frontend/src/components/workspace/DockerPreview.tsx`:
```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Square, RotateCcw, Loader2, Terminal as TerminalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  startPreview,
  stopPreview,
  getPreviewStatus,
  getPreviewLogs,
  getPreviewProxyUrl,
  type PreviewStatus,
} from "@/lib/api";

interface DockerPreviewProps {
  projectId: string;
}

type Phase = "idle" | "building" | "running" | "error" | "stopped";

export function DockerPreview({ projectId }: DockerPreviewProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Check if a preview is already running on mount
  useEffect(() => {
    getPreviewStatus(projectId)
      .then((status) => {
        if (status.status === "running") {
          setPhase("running");
          setProxyUrl(getPreviewProxyUrl(projectId));
          startLogPolling();
        }
      })
      .catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const startLogPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { logs: newLogs } = await getPreviewLogs(projectId, 50);
        if (newLogs) {
          setLogs(newLogs.split("\n").filter(Boolean));
        }
      } catch {
        // Container may have stopped
      }
    }, 3000);
  }, [projectId]);

  const handleRun = useCallback(async () => {
    setPhase("building");
    setError(null);
    setLogs(["Building Docker image..."]);

    try {
      const result = await startPreview(projectId);
      if (result.status === "running") {
        setPhase("running");
        setProxyUrl(getPreviewProxyUrl(projectId));
        setLogs((prev) => [...prev, "Container started. Loading preview..."]);
        startLogPolling();
      } else {
        setPhase("error");
        setError(result.error || "Failed to start preview");
        if (result.logs) {
          setLogs((prev) => [...prev, ...result.logs!.split("\n")]);
        }
      }
    } catch (err) {
      setPhase("error");
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setLogs((prev) => [...prev, `Error: ${msg}`]);
    }
  }, [projectId, startLogPolling]);

  const handleStop = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      await stopPreview(projectId);
    } catch {
      // Ignore stop errors
    }
    setPhase("stopped");
    setProxyUrl(null);
    setLogs((prev) => [...prev, "Preview stopped."]);
  }, [projectId]);

  const handleRestart = useCallback(async () => {
    await handleStop();
    // Small delay to let container clean up
    await new Promise((r) => setTimeout(r, 500));
    await handleRun();
  }, [handleStop, handleRun]);

  const statusMessage = (() => {
    switch (phase) {
      case "idle": return "Click Run to start Docker preview";
      case "building": return "Building Docker image...";
      case "running": return null; // Show iframe
      case "error": return error || "Preview failed";
      case "stopped": return "Preview stopped. Click Run to restart.";
    }
  })();

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1A1A18]/10 bg-[#FAF9F7] shrink-0">
        <div className="flex items-center gap-2">
          {phase === "idle" || phase === "stopped" || phase === "error" ? (
            <Button
              size="sm"
              onClick={handleRun}
              className="h-6 px-2 text-[10px] gap-1 bg-[#2D6A4F] text-white hover:bg-[#2D6A4F]/90"
            >
              <Play className="size-3" /> Run
            </Button>
          ) : phase === "building" ? (
            <Button size="sm" disabled className="h-6 px-2 text-[10px] gap-1 bg-[#2D6A4F]/50 text-white">
              <Loader2 className="size-3 animate-spin" /> Building...
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleStop}
                className="h-6 px-2 text-[10px] gap-1 text-[#D4583A]"
              >
                <Square className="size-3" /> Stop
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRestart}
                className="h-6 px-2 text-[10px] gap-1 text-[#1A1A18]/70"
              >
                <RotateCcw className="size-3" /> Restart
              </Button>
            </>
          )}
          {phase === "running" && (
            <span className="text-[10px] text-[#2D6A4F] flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-[#2D6A4F] animate-pulse" />
              Running (Docker)
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowTerminal(!showTerminal)}
          className="h-6 px-2 text-[10px] gap-1"
        >
          <TerminalIcon className="size-3" /> Terminal
        </Button>
      </div>

      {/* Preview area */}
      <div className="flex-1 bg-white relative">
        {phase === "running" && proxyUrl ? (
          <iframe
            src={proxyUrl}
            className="w-full h-full border-0"
            title="Docker Preview"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-[#1A1A18]/45">
            {phase === "building" ? (
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Building Docker image...
              </div>
            ) : phase === "error" ? (
              <div className="text-center text-[#D4583A]">
                <p className="mb-1">{error}</p>
                <p className="text-[10px] text-[#1A1A18]/45">Check terminal for details</p>
              </div>
            ) : (
              statusMessage
            )}
          </div>
        )}
      </div>

      {/* Terminal */}
      {showTerminal && (
        <div className="h-32 border-t border-[#1A1A18]/10 bg-[#1A1A18] overflow-y-auto shrink-0">
          <div className="p-2 font-mono text-[10px] text-[#E0E0E0]/80 space-y-0.5">
            {logs.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-words">{line}</div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify frontend builds**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors.

**Step 3: Commit**

```bash
git add frontend/src/components/workspace/DockerPreview.tsx
git commit -m "feat: Docker preview component with build/run/stop/restart lifecycle"
```

---

## Task 9: Update PreviewPanel to Route by Template Type (Frontend)

**Files:**
- Modify: `frontend/src/components/workspace/PreviewPanel.tsx`
- Modify: `frontend/src/components/workspace/WorkspacePanel.tsx`

**Step 1: Update PreviewPanel to accept project config and route**

Modify `frontend/src/components/workspace/PreviewPanel.tsx` to check the template type and render either the existing WebContainer preview or the new DockerPreview:

```typescript
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Square, Terminal as TerminalIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileSystemTree } from "@webcontainer/api";
import { useWebContainer } from "@/contexts/WebContainerContext";
import type { WorkspaceFile, FileContent } from "@/lib/api";
import { readWorkspaceFile } from "@/lib/api";
import { DockerPreview } from "./DockerPreview";
import { getTemplate } from "@/lib/templates";

interface PreviewPanelProps {
  projectId: string;
  files: WorkspaceFile[];
  templateId?: string;
}

export function PreviewPanel({ projectId, files, templateId }: PreviewPanelProps) {
  // Determine preview type from template
  const template = templateId ? getTemplate(templateId) : undefined;
  const previewType = template?.preview_type ?? "webcontainer";

  // Docker preview delegates to its own component
  if (previewType === "docker") {
    return <DockerPreview projectId={projectId} />;
  }

  // WebContainer preview (existing logic)
  return <WebContainerPreview projectId={projectId} files={files} />;
}

/** WebContainer-based preview for Node.js templates. */
function WebContainerPreview({ projectId, files }: { projectId: string; files: WorkspaceFile[] }) {
  const { status, serverUrl, boot, error: wcError } = useWebContainer();
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showTerminal, setShowTerminal] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);
  const hasPackageJson = files.some((f) => f.path === "package.json" && !f.is_dir);

  const handleRun = useCallback(async () => {
    if (!hasPackageJson) { setLogs(["No package.json found — cannot run preview."]); return; }
    setRunning(true);
    setLogs(["Booting WebContainer..."]);
    try {
      const wc = await boot();
      setLogs((p) => [...p, "WebContainer ready. Loading files..."]);
      const fileContents = await Promise.all(
        files.filter((f) => !f.is_dir).map((f) => readWorkspaceFile(projectId, f.path).catch(() => ({ path: f.path, content: "" })))
      );
      const fsTree: Record<string, unknown> = {};
      for (const fc of fileContents as FileContent[]) {
        const parts = fc.path.split("/");
        let current = fsTree;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) current[parts[i]] = { directory: {} };
          current = (current[parts[i]] as Record<string, unknown>).directory as Record<string, unknown>;
        }
        current[parts[parts.length - 1]] = { file: { contents: fc.content } };
      }
      await wc.mount(fsTree as FileSystemTree);
      setLogs((p) => [...p, `Mounted ${fileContents.length} files.`, "Running npm install..."]);
      const installProcess = await wc.spawn("npm", ["install"]);
      const installReader = installProcess.output.getReader();
      while (true) { const { done, value } = await installReader.read(); if (done) break; setLogs((p) => [...p, value]); }
      const installExit = await installProcess.exit;
      if (installExit !== 0) { setLogs((p) => [...p, `npm install failed with exit code ${installExit}`]); setRunning(false); return; }
      setLogs((p) => [...p, "Install complete. Starting dev server..."]);
      const devProcess = await wc.spawn("npm", ["run", "dev"]);
      const devReader = devProcess.output.getReader();
      (async () => { while (true) { const { done, value } = await devReader.read(); if (done) break; setLogs((p) => [...p.slice(-200), value]); } })();
    } catch (err) {
      setLogs((p) => [...p, `Error: ${err instanceof Error ? err.message : String(err)}`]);
      setRunning(false);
    }
  }, [boot, files, hasPackageJson, projectId]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1A1A18]/10 bg-[#FAF9F7] shrink-0">
        <div className="flex items-center gap-2">
          {!running ? (
            <Button size="sm" onClick={handleRun} disabled={status === "booting" || !hasPackageJson} className="h-6 px-2 text-[10px] gap-1 bg-[#2D6A4F] text-white hover:bg-[#2D6A4F]/90">
              {status === "booting" ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />} Run
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setRunning(false)} className="h-6 px-2 text-[10px] gap-1 text-[#D4583A]"><Square className="size-3" /> Stop</Button>
          )}
          {!hasPackageJson && <span className="text-[10px] text-[#1A1A18]/55">No package.json — preview unavailable</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowTerminal(!showTerminal)} className="h-6 px-2 text-[10px] gap-1"><TerminalIcon className="size-3" /> Terminal</Button>
      </div>
      <div className="flex-1 bg-white relative">
        {serverUrl ? (
          <iframe src={serverUrl} className="w-full h-full border-0" title="Preview" sandbox="allow-scripts allow-same-origin" />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-[#1A1A18]/45">
            {status === "booting" ? "Booting WebContainer..." : running ? "Waiting for dev server..." : wcError ? `Error: ${wcError}` : "Click Run to start preview"}
          </div>
        )}
      </div>
      {showTerminal && (
        <div className="h-32 border-t border-[#1A1A18]/10 bg-[#1A1A18] overflow-y-auto shrink-0">
          <div className="p-2 font-mono text-[10px] text-[#E0E0E0]/80 space-y-0.5">
            {logs.map((line, i) => <div key={i} className="whitespace-pre-wrap break-words">{line}</div>)}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update WorkspacePanel to pass templateId**

In `frontend/src/components/workspace/WorkspacePanel.tsx`, the `PreviewPanel` is rendered in the content area. Update it to pass `templateId`:

The component needs to accept `templateId` as a prop:
```typescript
export function WorkspacePanel({ projectId, templateId }: { projectId: string; templateId?: string }) {
```

And where PreviewPanel is rendered:
```tsx
<PreviewPanel projectId={projectId} files={files} templateId={templateId} />
```

**Step 3: Find and update where WorkspacePanel is used**

WorkspacePanel is used in the project overview page. It needs to receive the project config. Find where it's imported and pass `templateId={project?.config?.template_id}`.

**Step 4: Verify frontend builds**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors.

**Step 5: Commit**

```bash
git add frontend/src/components/workspace/PreviewPanel.tsx frontend/src/components/workspace/WorkspacePanel.tsx
git commit -m "feat: route preview to WebContainer or Docker based on template type"
```

---

## Task 10: Add Redis get/set/delete Methods (Backend)

The preview service needs `get`, `set`, `delete` on the Redis client, which may not exist yet.

**Files:**
- Modify: `backend/app/core/redis.py`

**Step 1: Check and add missing Redis methods**

The existing Redis client has `publish_event` and cache operations. Add `get`, `set`, `delete` if not present:

```python
    async def get(self, key: str) -> str | None:
        """Get a value from Redis."""
        await self._ensure_connected()
        return await self._redis.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        """Set a value in Redis with optional TTL."""
        await self._ensure_connected()
        await self._redis.set(key, value, ex=ex)

    async def delete(self, key: str) -> None:
        """Delete a key from Redis."""
        await self._ensure_connected()
        await self._redis.delete(key)
```

**Step 2: Verify**

Run: `cd backend && python -c "from app.core.redis import redis_client; print('redis OK')"`

Expected: `redis OK`

**Step 3: Commit**

```bash
git add backend/app/core/redis.py
git commit -m "feat: add get/set/delete methods to Redis client for preview state"
```

---

## Verification Checklist

After all tasks are complete:

1. **Backend syntax check:**
   ```bash
   cd backend && python -c "
   from app.templates.registry import TEMPLATES
   from app.api.templates import router
   from app.api.preview import router as pr
   from app.services.preview_service import get_preview_status
   from app.services.context import ContextService
   print(f'{len(TEMPLATES)} templates loaded')
   print('All backend modules import OK')
   "
   ```

2. **Frontend build:**
   ```bash
   cd frontend && npm run build
   ```
   Expected: Zero errors.

3. **Manual E2E test:**
   - Start backend + frontend
   - Create project → template grid should appear in dialog
   - Select "FastAPI + HTML" → enter brief → create
   - Navigate to project → workspace should show scaffold files (main.py, requirements.txt, etc.)
   - Click Preview → Run → Docker container should build and start
   - Preview iframe should show "Hello World"
   - Stop → confirm container stops
   - Agents start working → verify CTO receives tech stack constraint
