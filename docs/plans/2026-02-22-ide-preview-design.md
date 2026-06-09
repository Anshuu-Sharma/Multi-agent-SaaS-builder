# IDE Preview & Smart Chat Cards — Design

## Goal

Add a Bolt.new-style code editor + live preview to the project Overview page, and replace raw JSON agent chat with type-specific smart cards.

## Two Features

### Feature 1: WebContainer IDE on Overview Page

**Layout:** Split-pane on the existing Overview page.

- **Left pane (40%):** Condensed project info — state badge, agent status grid (2-col), quick stats (tasks, budget, gates).
- **Right pane (60%):** Code workspace with file tree, Monaco editor, and WebContainer-powered live preview.

**Runtime:** `@webcontainer/api` (StackBlitz) — same tech as Bolt.new. Full Node.js runtime in-browser. No server-side execution.

**Lifecycle:**
1. Boot WebContainer on first "Run" click (~2s cold start, reused across tab switches via React context).
2. Fetch project files from `GET /api/projects/{id}/files` and individual contents from `GET /api/projects/{id}/files/{path}`.
3. Mount file tree into WebContainer.
4. Run `npm install` (streamed to xterm.js terminal).
5. Run `npm run dev` — detect port via `server-ready` event, set iframe src.
6. Hot reload: Monaco edits write to WebContainer FS, HMR picks up changes.

**Components:**
- `WebContainerContext` — React context holding boot state, instance, server URL.
- `FileTree` — Recursive tree view from workspace file listing. Highlights new/modified files (pulsing dot on WS events).
- `CodeEditor` — Monaco editor, read-only by default, editable toggle. Syntax highlighting for all languages.
- `PreviewPanel` — iframe pointing to WebContainer URL + collapsible xterm.js terminal for build output.
- Top bar with Editor/Preview toggle and Run button.

**Responsive:** < 1200px: right pane collapses to expandable tab. Mobile: separate sub-page.

**Real-time:** WebSocket `AGENT_OUTPUT` events from dev agents trigger file tree refresh + highlight.

**Limitations:**
- Only Node.js projects get live preview. Python/Go projects show "Preview not available" with code-view fallback.
- WebContainer is sandboxed — no real network/DB access.

**Headers required** (Next.js config):
```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

### Feature 2: Smart Cards for Agent Chat

**Problem:** Agent messages contain structured JSON (PRDs, architecture docs, code outputs) but the Agents page renders them as raw text.

**Solution:** A message renderer that detects output type by field signatures and renders type-specific cards.

**Detection logic** (try JSON.parse, then check fields):

| Signature Fields | Card Type |
|---|---|
| `feature_prioritization` + `user_personas` | PRD Card |
| `tech_stack` + `system_design` | Architecture Card |
| `files` + `tests` + `summary` | Code Output Card |
| `approved` + `comments` | Code Review Card |
| `test_results` + `bug_reports` | QA Report Card |
| `clarifying_questions` + `competitive_analysis` | Discovery Card |
| `total_budget` + `line_items` | Budget Card |
| Parse fails | Plain text (whitespace-pre-wrap) |

**Card designs:**

- **PRD Card:** Expandable MoSCoW sections, user story counts, persona chips.
- **Architecture Card:** Tech stack table, collapsible system design, API endpoint list.
- **Code Output Card:** File count badge, syntax-highlighted snippets (first 20 lines), "Open in IDE" button.
- **Code Review Card:** Approved/rejected badge, severity-colored comments with file:line refs.
- **QA Report Card:** Pass/fail counts, bug severity breakdown, recommendation banner.
- **Discovery Card:** Persona cards, competitor comparison, question list.
- **Budget Card:** Allocation breakdown, line items table.

All cards have a "View raw JSON" toggle in footer.

## Backend Changes

Two new API routes in `app/api/files.py`:

- `GET /api/projects/{project_id}/files` — List workspace files (delegates to `FileService.list_files`).
- `GET /api/projects/{project_id}/files/{path:path}` — Read file content (delegates to `FileService.read_file`).

No schema changes. No model changes. Frontend handles JSON parsing client-side.

## Tech Stack Additions

- `@webcontainer/api` — In-browser Node.js runtime
- `@monaco-editor/react` — Code editor component
- `@xterm/xterm` + `@xterm/addon-fit` — Terminal emulator for build output
- `react-icons` or lucide icons (already in project)

## Dependencies

- Smart cards are independent of the IDE — can ship separately.
- IDE depends on the two new backend file endpoints.
- WebContainer requires Cross-Origin-Isolation headers.
