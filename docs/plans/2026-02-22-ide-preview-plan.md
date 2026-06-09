# IDE Preview & Smart Chat Cards — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Bolt.new-style WebContainer IDE to the Overview page and replace raw JSON agent messages with type-specific smart cards.

**Architecture:** Two new backend endpoints expose workspace files. Frontend adds WebContainer API + Monaco editor on the Overview page split-pane, and a smart card renderer that parses agent JSON output into structured UI components.

**Tech Stack:** @webcontainer/api, @monaco-editor/react, @xterm/xterm, @xterm/addon-fit, Next.js 16, React 19, Tailwind CSS 4, shadcn/ui

---

### Task 1: Backend — File API endpoints

**Files:**
- Create: `backend/app/api/files.py`
- Modify: `backend/app/main.py:24-32` (add import), `backend/app/main.py:91-99` (add router)

**Step 1: Create the file API routes**

Create `backend/app/api/files.py`:

```python
"""Workspace file browsing API — exposes project workspace files to the frontend."""

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.file_service import FileService

router = APIRouter(prefix="/api/projects/{project_id}/files", tags=["files"])


class FileInfoResponse(BaseModel):
    path: str
    name: str
    size: int
    is_dir: bool


@router.get("", response_model=list[FileInfoResponse])
async def list_files(project_id: uuid.UUID):
    """List all files in the project workspace."""
    files = FileService.list_files(project_id)
    return [FileInfoResponse(path=f.path, name=f.name, size=f.size, is_dir=f.is_dir) for f in files]


@router.get("/{file_path:path}")
async def read_file(project_id: uuid.UUID, file_path: str):
    """Read a single file's content from the project workspace."""
    try:
        content = FileService.read_file(project_id, file_path)
        return {"path": file_path, "content": content}
    except FileNotFoundError:
        raise HTTPException(404, f"File not found: {file_path}")
```

**Step 2: Register the router in main.py**

In `backend/app/main.py`, add after line 32:
```python
from app.api.files import router as files_router
```

And after line 99 (the last `app.include_router`):
```python
app.include_router(files_router)
```

**Step 3: Verify it works**

Run: `curl -s http://localhost:8000/api/projects/dfb26407-def0-4bbf-9261-e7c71ea59f76/files | python3 -m json.tool`
Expected: `[]` (empty array — no workspace files yet, which is correct)

Run: `curl -s http://localhost:8000/docs | head -5`
Expected: Swagger UI with the new `/files` endpoints visible

**Step 4: Commit**

```bash
git add backend/app/api/files.py backend/app/main.py
git commit -m "feat(api): add workspace file browsing endpoints"
```

---

### Task 2: Frontend — Install new dependencies

**Files:**
- Modify: `frontend/package.json`

**Step 1: Install WebContainer, Monaco, and xterm**

```bash
cd frontend
npm install @webcontainer/api @monaco-editor/react @xterm/xterm @xterm/addon-fit
```

**Step 2: Verify install succeeds**

Run: `cd frontend && npx next build 2>&1 | tail -5`
Expected: Build succeeds (or at minimum no import errors)

**Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "deps: add webcontainer, monaco-editor, xterm"
```

---

### Task 3: Frontend — Cross-Origin-Isolation headers

**Files:**
- Modify: `frontend/next.config.ts`

WebContainers require `SharedArrayBuffer`, which needs Cross-Origin-Isolation headers.

**Step 1: Update next.config.ts**

Replace the entire file:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

**Step 2: Verify headers are served**

Restart frontend dev server, then:
```bash
curl -s -I http://localhost:3000 | grep -i "cross-origin"
```
Expected:
```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

**Step 3: Commit**

```bash
git add frontend/next.config.ts
git commit -m "config: add Cross-Origin-Isolation headers for WebContainers"
```

---

### Task 4: Frontend — API client additions

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: Add file types and fetch functions**

Add at the end of the types section (after line 132 in `api.ts`):

```typescript
export interface WorkspaceFile {
  path: string;
  name: string;
  size: number;
  is_dir: boolean;
}

export interface FileContent {
  path: string;
  content: string;
}
```

Add at the end of the file (after the audit section):

```typescript
// ---------------------------------------------------------------------------
// Workspace Files
// ---------------------------------------------------------------------------

export function listWorkspaceFiles(projectId: string) {
  return apiFetch<WorkspaceFile[]>(`/api/projects/${projectId}/files`);
}

export function readWorkspaceFile(projectId: string, filePath: string) {
  return apiFetch<FileContent>(`/api/projects/${projectId}/files/${encodeURIComponent(filePath)}`);
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(api): add workspace file listing and reading functions"
```

---

### Task 5: Frontend — Smart card message renderer

**Files:**
- Create: `frontend/src/components/agent-cards/MessageCard.tsx`
- Create: `frontend/src/components/agent-cards/DiscoveryCard.tsx`
- Create: `frontend/src/components/agent-cards/PRDCard.tsx`
- Create: `frontend/src/components/agent-cards/ArchitectureCard.tsx`
- Create: `frontend/src/components/agent-cards/CodeOutputCard.tsx`
- Create: `frontend/src/components/agent-cards/CodeReviewCard.tsx`
- Create: `frontend/src/components/agent-cards/QAReportCard.tsx`
- Create: `frontend/src/components/agent-cards/BudgetCard.tsx`
- Create: `frontend/src/components/agent-cards/RawJsonToggle.tsx`

This is the biggest task. Each card component renders a specific agent output type.

**Step 1: Create the detection/routing component**

Create `frontend/src/components/agent-cards/MessageCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { AgentMessage } from "@/lib/api";
import { DiscoveryCard } from "./DiscoveryCard";
import { PRDCard } from "./PRDCard";
import { ArchitectureCard } from "./ArchitectureCard";
import { CodeOutputCard } from "./CodeOutputCard";
import { CodeReviewCard } from "./CodeReviewCard";
import { QAReportCard } from "./QAReportCard";
import { BudgetCard } from "./BudgetCard";

type ParsedOutput = { type: string; data: Record<string, unknown> };

function detectOutputType(content: string): ParsedOutput | null {
  try {
    const data = JSON.parse(content);
    if (typeof data !== "object" || data === null) return null;

    // Detection by field signatures — order matters (most specific first)
    if ("files" in data && "tests" in data && "summary" in data)
      return { type: "code_output", data };
    if ("approved" in data && "comments" in data)
      return { type: "code_review", data };
    if ("tests_run" in data && "bugs_found" in data)
      return { type: "qa_report", data };
    if ("feature_prioritization" in data || ("product_vision" in data && "features" in data))
      return { type: "prd", data };
    if ("tech_stack" in data && ("system_design" in data || "api_design" in data))
      return { type: "architecture", data };
    if ("clarifying_questions" in data && ("user_personas" in data || "initial_user_personas" in data))
      return { type: "discovery", data };
    if ("total_estimate_cents" in data || ("breakdown" in data && "assumptions" in data))
      return { type: "budget", data };

    // Generic JSON — show summary
    return { type: "generic_json", data };
  } catch {
    return null;
  }
}

export function MessageCard({ message }: { message: AgentMessage }) {
  const parsed = detectOutputType(message.content);

  if (!parsed) {
    // Plain text message — render as-is
    return (
      <p className="text-xs text-[#1A1A18]/70 whitespace-pre-wrap break-words">
        {message.content}
      </p>
    );
  }

  switch (parsed.type) {
    case "discovery":
      return <DiscoveryCard data={parsed.data} />;
    case "prd":
      return <PRDCard data={parsed.data} />;
    case "architecture":
      return <ArchitectureCard data={parsed.data} />;
    case "code_output":
      return <CodeOutputCard data={parsed.data} />;
    case "code_review":
      return <CodeReviewCard data={parsed.data} />;
    case "qa_report":
      return <QAReportCard data={parsed.data} />;
    case "budget":
      return <BudgetCard data={parsed.data} />;
    default:
      return <GenericJsonCard data={parsed.data} />;
  }
}

function GenericJsonCard({ data }: { data: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const keys = Object.keys(data);
  return (
    <div className="rounded-md border border-[#1A1A18]/10 bg-[#FAF9F7] p-3 text-xs">
      <p className="text-[#1A1A18]/60 mb-2">
        Structured output with {keys.length} fields: {keys.slice(0, 5).join(", ")}
        {keys.length > 5 && "..."}
      </p>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-[#3A5FCD] hover:underline"
      >
        {expanded ? "Hide JSON" : "View JSON"}
      </button>
      {expanded && (
        <pre className="mt-2 p-2 rounded bg-[#1A1A18]/5 overflow-auto max-h-60 text-[10px] text-[#1A1A18]/70">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

**Step 2: Create individual card components**

Create `frontend/src/components/agent-cards/RawJsonToggle.tsx`:

```tsx
"use client";

import { useState } from "react";

export function RawJsonToggle({ data }: { data: unknown }) {
  const [show, setShow] = useState(false);
  return (
    <div className="mt-2 pt-2 border-t border-[#1A1A18]/5">
      <button
        onClick={() => setShow(!show)}
        className="text-[10px] text-[#1A1A18]/30 hover:text-[#1A1A18]/50"
      >
        {show ? "Hide raw JSON" : "View raw JSON"}
      </button>
      {show && (
        <pre className="mt-1 p-2 rounded bg-[#1A1A18]/5 overflow-auto max-h-40 text-[10px] text-[#1A1A18]/50">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

Create `frontend/src/components/agent-cards/DiscoveryCard.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { RawJsonToggle } from "./RawJsonToggle";

export function DiscoveryCard({ data }: { data: Record<string, unknown> }) {
  const questions = (data.clarifying_questions as string[]) ?? [];
  const personas = (data.user_personas ?? data.initial_user_personas) as Record<string, unknown>[] ?? [];
  const metrics = (data.recommended_success_metrics ?? data.success_metrics) as unknown;
  const competitive = data.competitive_analysis;

  return (
    <div className="rounded-md border border-[#D4583A]/20 bg-[#FAF9F7] p-3 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-[#D4583A]/10 text-[#D4583A] text-[10px]">Discovery</Badge>
        <span className="text-[10px] text-[#1A1A18]/40">
          {personas.length} personas, {questions.length} questions
        </span>
      </div>

      {personas.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">User Personas</p>
          <div className="flex flex-wrap gap-1">
            {personas.map((p, i) => (
              <Badge key={i} className="bg-[#7B4F9D]/10 text-[#7B4F9D] text-[10px]">
                {(p.persona_name as string) ?? (p.name as string) ?? `Persona ${i + 1}`}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {questions.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Key Questions</p>
          <ul className="list-disc list-inside text-[#1A1A18]/60 space-y-0.5">
            {questions.slice(0, 5).map((q, i) => (
              <li key={i}>{q}</li>
            ))}
            {questions.length > 5 && (
              <li className="text-[#1A1A18]/40">+{questions.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      {competitive && typeof competitive === "object" && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Competitive Analysis</p>
          <p className="text-[#1A1A18]/60">
            {((competitive as Record<string, unknown>).competitors as string[])?.join(", ") ??
              JSON.stringify(competitive).slice(0, 200)}
          </p>
        </div>
      )}

      {Array.isArray(metrics) && metrics.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Success Metrics</p>
          <div className="flex flex-wrap gap-1">
            {(metrics as string[]).slice(0, 5).map((m, i) => (
              <Badge key={i} className="bg-[#2D6A4F]/10 text-[#2D6A4F] text-[10px]">
                {typeof m === "string" ? m : JSON.stringify(m)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <RawJsonToggle data={data} />
    </div>
  );
}
```

Create `frontend/src/components/agent-cards/PRDCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RawJsonToggle } from "./RawJsonToggle";

const PRIORITY_COLORS: Record<string, string> = {
  "must-have": "bg-[#D4583A]/10 text-[#D4583A]",
  "should-have": "bg-[#B8860B]/10 text-[#B8860B]",
  "nice-to-have": "bg-[#78766F]/10 text-[#78766F]",
  "must_have": "bg-[#D4583A]/10 text-[#D4583A]",
  "should_have": "bg-[#B8860B]/10 text-[#B8860B]",
  "could_have": "bg-[#78766F]/10 text-[#78766F]",
};

export function PRDCard({ data }: { data: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const vision = (data.product_vision as string) ?? "";
  const goals = (data.goals as string[]) ?? [];
  const features = (data.features as Record<string, unknown>[]) ?? [];
  const stories = (data.user_stories as Record<string, unknown>[]) ?? [];
  const nfrs = (data.non_functional_requirements as string[]) ?? [];

  // Group features or feature_prioritization
  const prioritization = data.feature_prioritization as Record<string, unknown> | undefined;
  const mustHave = prioritization?.must_have as Record<string, unknown>[] ??
    features.filter((f) => f.priority === "must-have" || f.priority === "must_have");
  const shouldHave = prioritization?.should_have as Record<string, unknown>[] ??
    features.filter((f) => f.priority === "should-have" || f.priority === "should_have");
  const couldHave = prioritization?.could_have as Record<string, unknown>[] ??
    features.filter((f) => f.priority === "nice-to-have" || f.priority === "could_have");

  const sections = [
    { key: "must", label: "Must Have", items: mustHave, color: PRIORITY_COLORS["must-have"] },
    { key: "should", label: "Should Have", items: shouldHave, color: PRIORITY_COLORS["should-have"] },
    { key: "could", label: "Could Have", items: couldHave, color: PRIORITY_COLORS["nice-to-have"] },
  ];

  return (
    <div className="rounded-md border border-[#D4583A]/20 bg-[#FAF9F7] p-3 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-[#D4583A]/10 text-[#D4583A] text-[10px]">PRD</Badge>
        <span className="text-[10px] text-[#1A1A18]/40">
          {features.length || (mustHave.length + shouldHave.length + couldHave.length)} features, {stories.length} stories
        </span>
      </div>

      {vision && (
        <p className="text-[#1A1A18]/70 italic">{vision}</p>
      )}

      {goals.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Goals</p>
          <ul className="list-disc list-inside text-[#1A1A18]/60 space-y-0.5">
            {goals.slice(0, 4).map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}

      {sections.map(({ key, label, items, color }) =>
        items.length > 0 ? (
          <div key={key}>
            <button
              onClick={() => setExpanded(expanded === key ? null : key)}
              className="flex items-center gap-2 w-full text-left"
            >
              <span className="text-[10px]">{expanded === key ? "\u25BC" : "\u25B6"}</span>
              <Badge className={`${color} text-[10px]`}>{label}</Badge>
              <span className="text-[10px] text-[#1A1A18]/40">({items.length})</span>
            </button>
            {expanded === key && (
              <ul className="mt-1 ml-4 space-y-1 text-[#1A1A18]/60">
                {items.map((f, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="text-[#1A1A18]/30 mt-0.5">-</span>
                    <span>
                      <strong>{(f.name ?? f.feature_name ?? `Feature ${i + 1}`) as string}</strong>
                      {f.description && <span className="text-[#1A1A18]/40"> — {f.description as string}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null
      )}

      {nfrs.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Non-Functional Requirements</p>
          <div className="flex flex-wrap gap-1">
            {nfrs.map((n, i) => (
              <Badge key={i} className="bg-[#3A5FCD]/10 text-[#3A5FCD] text-[10px]">{n}</Badge>
            ))}
          </div>
        </div>
      )}

      <RawJsonToggle data={data} />
    </div>
  );
}
```

Create `frontend/src/components/agent-cards/ArchitectureCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RawJsonToggle } from "./RawJsonToggle";

export function ArchitectureCard({ data }: { data: Record<string, unknown> }) {
  const [showDesign, setShowDesign] = useState(false);

  const techStack = (data.tech_stack as Record<string, string>) ?? {};
  const apiDesign = (data.api_design as Record<string, unknown>[]) ?? [];
  const risks = (data.technical_risks as Record<string, unknown>[]) ?? [];
  const systemDesign = (data.system_design as string) ?? "";
  const dbSchema = (data.database_schema as string) ?? "";

  return (
    <div className="rounded-md border border-[#2D6A4F]/20 bg-[#FAF9F7] p-3 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-[#2D6A4F]/10 text-[#2D6A4F] text-[10px]">Architecture</Badge>
        <span className="text-[10px] text-[#1A1A18]/40">
          {Object.keys(techStack).length} stack items, {apiDesign.length} endpoints
        </span>
      </div>

      {Object.keys(techStack).length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Tech Stack</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {Object.entries(techStack).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-[#1A1A18]/50">{k}:</span>
                <span className="text-[#1A1A18]/70 font-medium">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {apiDesign.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">API Endpoints ({apiDesign.length})</p>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {apiDesign.map((ep, i) => (
              <div key={i} className="flex items-center gap-2">
                <Badge className="bg-[#3A5FCD]/10 text-[#3A5FCD] text-[9px] font-mono px-1">
                  {ep.method as string}
                </Badge>
                <span className="font-mono text-[#1A1A18]/60">{ep.path as string}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {systemDesign && (
        <div>
          <button
            onClick={() => setShowDesign(!showDesign)}
            className="text-[10px] text-[#3A5FCD] hover:underline"
          >
            {showDesign ? "Hide" : "View"} System Design
          </button>
          {showDesign && (
            <pre className="mt-1 p-2 rounded bg-[#1A1A18]/5 overflow-auto max-h-40 text-[10px] text-[#1A1A18]/60 whitespace-pre-wrap">
              {systemDesign}
            </pre>
          )}
        </div>
      )}

      {risks.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Technical Risks</p>
          {risks.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5 mb-0.5">
              <Badge className={`text-[9px] px-1 ${
                r.severity === "high" ? "bg-[#D4583A]/10 text-[#D4583A]" :
                r.severity === "medium" ? "bg-[#B8860B]/10 text-[#B8860B]" :
                "bg-[#78766F]/10 text-[#78766F]"
              }`}>
                {r.severity as string}
              </Badge>
              <span className="text-[#1A1A18]/60">{r.risk as string}</span>
            </div>
          ))}
        </div>
      )}

      <RawJsonToggle data={data} />
    </div>
  );
}
```

Create `frontend/src/components/agent-cards/CodeOutputCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RawJsonToggle } from "./RawJsonToggle";

export function CodeOutputCard({ data }: { data: Record<string, unknown> }) {
  const [selectedFile, setSelectedFile] = useState<number | null>(null);

  const files = (data.files as Record<string, unknown>[]) ?? [];
  const tests = (data.tests as Record<string, unknown>[]) ?? [];
  const summary = (data.summary as string) ?? "";
  const blockers = (data.blockers as string[]) ?? [];
  const nextSteps = (data.next_steps as string[]) ?? [];

  const allFiles = [
    ...files.map((f) => ({ ...f, isTest: false })),
    ...tests.map((f) => ({ ...f, isTest: true })),
  ];

  return (
    <div className="rounded-md border border-[#3A5FCD]/20 bg-[#FAF9F7] p-3 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-[#3A5FCD]/10 text-[#3A5FCD] text-[10px]">Code Output</Badge>
        <span className="text-[10px] text-[#1A1A18]/40">
          {files.length} files, {tests.length} tests
        </span>
      </div>

      {summary && (
        <p className="text-[#1A1A18]/70">{summary}</p>
      )}

      {allFiles.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Files</p>
          <div className="space-y-0.5">
            {allFiles.map((f, i) => (
              <div key={i}>
                <button
                  onClick={() => setSelectedFile(selectedFile === i ? null : i)}
                  className="flex items-center gap-2 w-full text-left hover:bg-[#1A1A18]/5 rounded px-1 py-0.5"
                >
                  <span className="text-[10px]">{selectedFile === i ? "\u25BC" : "\u25B6"}</span>
                  <span className="font-mono text-[#1A1A18]/60">{f.path as string}</span>
                  <Badge className={`text-[9px] px-1 ${
                    f.isTest ? "bg-[#B8860B]/10 text-[#B8860B]" :
                    (f.operation as string) === "modify" ? "bg-[#D97706]/10 text-[#D97706]" :
                    "bg-[#2D6A4F]/10 text-[#2D6A4F]"
                  }`}>
                    {f.isTest ? "test" : (f.operation as string) ?? "create"}
                  </Badge>
                </button>
                {selectedFile === i && (
                  <pre className="mt-1 ml-4 p-2 rounded bg-[#1A1A18] text-[#E0E0E0] overflow-auto max-h-60 text-[10px] font-mono leading-relaxed">
                    {(f.content as string)?.slice(0, 3000)}
                    {((f.content as string)?.length ?? 0) > 3000 && "\n\n... truncated"}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {blockers.length > 0 && (
        <div>
          <p className="font-medium text-[#D4583A]/70 mb-1">Blockers</p>
          <ul className="list-disc list-inside text-[#D4583A]/60 space-y-0.5">
            {blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}

      {nextSteps.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Next Steps</p>
          <ul className="list-disc list-inside text-[#1A1A18]/60 space-y-0.5">
            {nextSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      <RawJsonToggle data={data} />
    </div>
  );
}
```

Create `frontend/src/components/agent-cards/CodeReviewCard.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { RawJsonToggle } from "./RawJsonToggle";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-[#D4583A]/10 text-[#D4583A] border-[#D4583A]/20",
  high: "bg-[#D97706]/10 text-[#D97706] border-[#D97706]/20",
  medium: "bg-[#B8860B]/10 text-[#B8860B] border-[#B8860B]/20",
  low: "bg-[#78766F]/10 text-[#78766F] border-[#78766F]/20",
};

export function CodeReviewCard({ data }: { data: Record<string, unknown> }) {
  const approved = data.approved as boolean;
  const comments = (data.comments as Record<string, unknown>[]) ?? [];
  const summary = (data.summary as string) ?? "";
  const requiredChanges = (data.required_changes as string[]) ?? [];

  return (
    <div className={`rounded-md border p-3 text-xs space-y-3 ${
      approved ? "border-[#2D6A4F]/20 bg-[#2D6A4F]/5" : "border-[#D4583A]/20 bg-[#D4583A]/5"
    }`}>
      <div className="flex items-center gap-2">
        <Badge className={`text-[10px] ${
          approved ? "bg-[#2D6A4F]/10 text-[#2D6A4F]" : "bg-[#D4583A]/10 text-[#D4583A]"
        }`}>
          {approved ? "Approved" : "Changes Requested"}
        </Badge>
        <span className="text-[10px] text-[#1A1A18]/40">
          {comments.length} comments
        </span>
      </div>

      {summary && <p className="text-[#1A1A18]/70">{summary}</p>}

      {comments.length > 0 && (
        <div className="space-y-1.5">
          {comments.map((c, i) => (
            <div key={i} className={`rounded border p-2 ${SEVERITY_COLORS[c.severity as string] ?? SEVERITY_COLORS.low}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-mono text-[10px]">{c.file as string}:{c.line as number}</span>
                <Badge className="text-[9px] px-1">{c.severity as string}</Badge>
              </div>
              <p className="text-[11px]">{c.comment as string}</p>
            </div>
          ))}
        </div>
      )}

      {requiredChanges.length > 0 && (
        <div>
          <p className="font-medium text-[#D4583A]/70 mb-1">Required Changes</p>
          <ul className="list-disc list-inside text-[#1A1A18]/60 space-y-0.5">
            {requiredChanges.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      <RawJsonToggle data={data} />
    </div>
  );
}
```

Create `frontend/src/components/agent-cards/QAReportCard.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { RawJsonToggle } from "./RawJsonToggle";

export function QAReportCard({ data }: { data: Record<string, unknown> }) {
  const testsRun = (data.tests_run as number) ?? 0;
  const testsPassed = (data.tests_passed as number) ?? 0;
  const testsFailed = (data.tests_failed as number) ?? 0;
  const bugs = (data.bugs_found as Record<string, unknown>[]) ?? [];
  const recommendation = (data.recommendation as string) ?? "";
  const notes = (data.notes as string) ?? "";

  const passRate = testsRun > 0 ? Math.round((testsPassed / testsRun) * 100) : 0;

  return (
    <div className="rounded-md border border-[#D97706]/20 bg-[#FAF9F7] p-3 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-[#D97706]/10 text-[#D97706] text-[10px]">QA Report</Badge>
        <Badge className={`text-[10px] ${
          recommendation === "pass" ? "bg-[#2D6A4F]/10 text-[#2D6A4F]" :
          recommendation === "fail" ? "bg-[#D4583A]/10 text-[#D4583A]" :
          "bg-[#B8860B]/10 text-[#B8860B]"
        }`}>
          {recommendation || "pending"}
        </Badge>
      </div>

      <div className="flex gap-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-[#2D6A4F]">{testsPassed}</p>
          <p className="text-[10px] text-[#1A1A18]/40">passed</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-[#D4583A]">{testsFailed}</p>
          <p className="text-[10px] text-[#1A1A18]/40">failed</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-[#1A1A18]/70">{passRate}%</p>
          <p className="text-[10px] text-[#1A1A18]/40">pass rate</p>
        </div>
      </div>

      {bugs.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Bugs Found ({bugs.length})</p>
          {bugs.map((b, i) => (
            <div key={i} className="flex items-start gap-1.5 mb-1">
              <Badge className={`text-[9px] px-1 shrink-0 ${
                b.severity === "critical" ? "bg-[#D4583A]/10 text-[#D4583A]" :
                b.severity === "high" ? "bg-[#D97706]/10 text-[#D97706]" :
                "bg-[#B8860B]/10 text-[#B8860B]"
              }`}>
                {b.severity as string}
              </Badge>
              <span className="text-[#1A1A18]/60">{b.title as string}</span>
            </div>
          ))}
        </div>
      )}

      {notes && <p className="text-[#1A1A18]/50 italic">{notes}</p>}

      <RawJsonToggle data={data} />
    </div>
  );
}
```

Create `frontend/src/components/agent-cards/BudgetCard.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { RawJsonToggle } from "./RawJsonToggle";

export function BudgetCard({ data }: { data: Record<string, unknown> }) {
  const total = (data.total_estimate_cents as number) ?? 0;
  const breakdown = (data.breakdown as Record<string, number>) ?? {};
  const assumptions = (data.assumptions as string[]) ?? [];
  const recommendations = (data.recommendations as string[]) ?? [];

  return (
    <div className="rounded-md border border-[#B8860B]/20 bg-[#FAF9F7] p-3 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-[#B8860B]/10 text-[#B8860B] text-[10px]">Budget Estimate</Badge>
        <span className="text-sm font-semibold text-[#1A1A18]">
          ${(total / 100).toFixed(2)}
        </span>
      </div>

      {Object.keys(breakdown).length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Breakdown</p>
          <div className="space-y-0.5">
            {Object.entries(breakdown).map(([category, cents]) => (
              <div key={category} className="flex justify-between">
                <span className="text-[#1A1A18]/50 capitalize">{category.replace("_", " ")}</span>
                <span className="text-[#1A1A18]/70 font-medium">${(cents / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Recommendations</p>
          <ul className="list-disc list-inside text-[#1A1A18]/60 space-y-0.5">
            {recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <RawJsonToggle data={data} />
    </div>
  );
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/components/agent-cards/
git commit -m "feat(ui): smart card renderer for agent messages — 7 card types"
```

---

### Task 6: Frontend — Wire smart cards into Agents page

**Files:**
- Modify: `frontend/src/app/(dashboard)/projects/[id]/agents/page.tsx:253-255`

**Step 1: Import and use MessageCard**

In `agents/page.tsx`, add the import at line 17 (after the api import):

```typescript
import { MessageCard } from "@/components/agent-cards/MessageCard";
```

Replace lines 253-255 (the raw content rendering):

```tsx
<p className="text-xs text-[#1A1A18]/70 whitespace-pre-wrap break-words">
  {msg.content}
</p>
```

With:

```tsx
<MessageCard message={msg} />
```

**Step 2: Verify it renders correctly**

Open http://localhost:3000 in the browser, navigate to a project's Agents tab. The CPO discovery and PRD outputs should now render as structured cards instead of raw JSON.

**Step 3: Commit**

```bash
git add frontend/src/app/\(dashboard\)/projects/\[id\]/agents/page.tsx
git commit -m "feat(ui): wire smart cards into agent activity feed"
```

---

### Task 7: Frontend — WebContainer context provider

**Files:**
- Create: `frontend/src/contexts/WebContainerContext.tsx`

**Step 1: Create the context**

```tsx
"use client";

import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from "react";
import { WebContainer } from "@webcontainer/api";

interface WebContainerState {
  instance: WebContainer | null;
  status: "idle" | "booting" | "ready" | "error";
  serverUrl: string | null;
  error: string | null;
  boot: () => Promise<WebContainer>;
}

const WebContainerCtx = createContext<WebContainerState | null>(null);

export function WebContainerProvider({ children }: { children: ReactNode }) {
  const instanceRef = useRef<WebContainer | null>(null);
  const bootingRef = useRef<Promise<WebContainer> | null>(null);
  const [status, setStatus] = useState<WebContainerState["status"]>("idle");
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const boot = useCallback(async (): Promise<WebContainer> => {
    // Return existing instance
    if (instanceRef.current) return instanceRef.current;

    // Dedupe concurrent boot calls
    if (bootingRef.current) return bootingRef.current;

    const promise = (async () => {
      setStatus("booting");
      setError(null);
      try {
        const wc = await WebContainer.boot();
        instanceRef.current = wc;

        // Listen for server-ready events
        wc.on("server-ready", (_port: number, url: string) => {
          setServerUrl(url);
        });

        setStatus("ready");
        return wc;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "WebContainer boot failed";
        setError(msg);
        setStatus("error");
        throw err;
      } finally {
        bootingRef.current = null;
      }
    })();

    bootingRef.current = promise;
    return promise;
  }, []);

  return (
    <WebContainerCtx.Provider
      value={{ instance: instanceRef.current, status, serverUrl, error, boot }}
    >
      {children}
    </WebContainerCtx.Provider>
  );
}

export function useWebContainer() {
  const ctx = useContext(WebContainerCtx);
  if (!ctx) throw new Error("useWebContainer must be used within WebContainerProvider");
  return ctx;
}
```

**Step 2: Wrap the project layout with the provider**

In `frontend/src/app/(dashboard)/projects/[id]/layout.tsx`, import and wrap:

Add import:
```typescript
import { WebContainerProvider } from "@/contexts/WebContainerContext";
```

Wrap the returned JSX children in `<WebContainerProvider>...</WebContainerProvider>`.

**Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -10`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/contexts/WebContainerContext.tsx frontend/src/app/\(dashboard\)/projects/\[id\]/layout.tsx
git commit -m "feat(ui): WebContainer context provider for in-browser runtime"
```

---

### Task 8: Frontend — Split-pane Overview with IDE panel

**Files:**
- Create: `frontend/src/components/workspace/FileTree.tsx`
- Create: `frontend/src/components/workspace/CodeEditor.tsx`
- Create: `frontend/src/components/workspace/PreviewPanel.tsx`
- Create: `frontend/src/components/workspace/WorkspacePanel.tsx`
- Modify: `frontend/src/app/(dashboard)/projects/[id]/page.tsx`

**Step 1: Create the FileTree component**

Create `frontend/src/components/workspace/FileTree.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, File, Folder } from "lucide-react";
import type { WorkspaceFile } from "@/lib/api";

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

function buildTree(files: WorkspaceFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirs = new Map<string, TreeNode>();

  // Ensure parent dirs exist
  for (const f of files) {
    const parts = f.path.split("/");
    let currentPath = "";
    for (let i = 0; i < parts.length - (f.is_dir ? 0 : 1); i++) {
      const parent = currentPath;
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      if (!dirs.has(currentPath)) {
        const node: TreeNode = { name: parts[i], path: currentPath, isDir: true, children: [] };
        dirs.set(currentPath, node);
        if (parent) {
          dirs.get(parent)?.children.push(node);
        } else {
          root.push(node);
        }
      }
    }
    if (!f.is_dir) {
      const node: TreeNode = { name: f.name, path: f.path, isDir: false, children: [] };
      const parentPath = parts.slice(0, -1).join("/");
      if (parentPath && dirs.has(parentPath)) {
        dirs.get(parentPath)!.children.push(node);
      } else {
        root.push(node);
      }
    }
  }

  // Sort: dirs first, then alphabetical
  function sortTree(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => sortTree(n.children));
  }
  sortTree(root);
  return root;
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const isSelected = node.path === selectedPath;

  if (node.isDir) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 w-full text-left hover:bg-[#1A1A18]/5 rounded px-1 py-0.5"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {open ? <ChevronDown className="size-3 text-[#1A1A18]/40" /> : <ChevronRight className="size-3 text-[#1A1A18]/40" />}
          <Folder className="size-3 text-[#B8860B]" />
          <span className="text-[11px] text-[#1A1A18]/70">{node.name}</span>
        </button>
        {open && node.children.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`flex items-center gap-1 w-full text-left rounded px-1 py-0.5 ${
        isSelected ? "bg-[#3A5FCD]/10 text-[#3A5FCD]" : "hover:bg-[#1A1A18]/5 text-[#1A1A18]/60"
      }`}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      <span className="size-3" />
      <File className="size-3" />
      <span className="text-[11px] truncate">{node.name}</span>
    </button>
  );
}

export function FileTree({
  files,
  selectedPath,
  onSelectFile,
}: {
  files: WorkspaceFile[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}) {
  const tree = buildTree(files);

  if (tree.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-[11px] text-[#1A1A18]/30">No files yet.</p>
        <p className="text-[10px] text-[#1A1A18]/20 mt-1">Files will appear as agents generate code.</p>
      </div>
    );
  }

  return (
    <div className="py-1 overflow-y-auto">
      {tree.map((node) => (
        <TreeItem key={node.path} node={node} depth={0} selectedPath={selectedPath} onSelect={onSelectFile} />
      ))}
    </div>
  );
}
```

**Step 2: Create the CodeEditor component**

Create `frontend/src/components/workspace/CodeEditor.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { readWorkspaceFile } from "@/lib/api";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-xs text-[#1A1A18]/30">Loading editor...</div>,
});

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", json: "json", md: "markdown", css: "css", scss: "scss",
    html: "html", yml: "yaml", yaml: "yaml", sql: "sql", sh: "shell",
    toml: "toml", ini: "ini", env: "shell", txt: "plaintext",
  };
  return map[ext] ?? "plaintext";
}

export function CodeEditor({
  projectId,
  filePath,
  onContentChange,
}: {
  projectId: string;
  filePath: string | null;
  onContentChange?: (path: string, content: string) => void;
}) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filePath) {
      setContent("");
      return;
    }
    setLoading(true);
    readWorkspaceFile(projectId, filePath)
      .then((f) => setContent(f.content))
      .catch(() => setContent(`// Failed to load ${filePath}`))
      .finally(() => setLoading(false));
  }, [projectId, filePath]);

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[#1A1A18]/30">
        Select a file to view
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[#1A1A18]/30">
        Loading {filePath}...
      </div>
    );
  }

  return (
    <MonacoEditor
      height="100%"
      language={getLanguage(filePath)}
      value={content}
      theme="vs-dark"
      onChange={(value) => {
        if (value !== undefined && onContentChange && filePath) {
          onContentChange(filePath, value);
        }
      }}
      options={{
        readOnly: !onContentChange,
        minimap: { enabled: false },
        fontSize: 12,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        wordWrap: "on",
        padding: { top: 8 },
      }}
    />
  );
}
```

**Step 3: Create the PreviewPanel component**

Create `frontend/src/components/workspace/PreviewPanel.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Square, Terminal as TerminalIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWebContainer } from "@/contexts/WebContainerContext";
import type { WorkspaceFile, FileContent } from "@/lib/api";
import { readWorkspaceFile } from "@/lib/api";

export function PreviewPanel({
  projectId,
  files,
}: {
  projectId: string;
  files: WorkspaceFile[];
}) {
  const { instance, status, serverUrl, boot, error: wcError } = useWebContainer();
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [showTerminal, setShowTerminal] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const hasPackageJson = files.some((f) => f.path === "package.json" && !f.is_dir);

  const handleRun = useCallback(async () => {
    if (!hasPackageJson) {
      setLogs(["No package.json found — cannot run preview."]);
      return;
    }

    setRunning(true);
    setLogs(["Booting WebContainer..."]);

    try {
      const wc = await boot();
      setLogs((prev) => [...prev, "WebContainer ready. Loading files..."]);

      // Build file system tree for WebContainer
      const fileContents = await Promise.all(
        files
          .filter((f) => !f.is_dir)
          .map((f) => readWorkspaceFile(projectId, f.path).catch(() => ({ path: f.path, content: "" })))
      );

      const fsTree: Record<string, unknown> = {};
      for (const fc of fileContents as FileContent[]) {
        const parts = fc.path.split("/");
        let current = fsTree;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) {
            current[parts[i]] = { directory: {} };
          }
          current = (current[parts[i]] as Record<string, unknown>).directory as Record<string, unknown>;
        }
        current[parts[parts.length - 1]] = {
          file: { contents: fc.content },
        };
      }

      await wc.mount(fsTree);
      setLogs((prev) => [...prev, `Mounted ${fileContents.length} files.`, "Running npm install..."]);

      // npm install
      const installProcess = await wc.spawn("npm", ["install"]);
      const installReader = installProcess.output.getReader();
      while (true) {
        const { done, value } = await installReader.read();
        if (done) break;
        setLogs((prev) => [...prev, value]);
      }
      const installExit = await installProcess.exit;
      if (installExit !== 0) {
        setLogs((prev) => [...prev, `npm install failed with exit code ${installExit}`]);
        setRunning(false);
        return;
      }

      setLogs((prev) => [...prev, "Install complete. Starting dev server..."]);

      // npm run dev
      const devProcess = await wc.spawn("npm", ["run", "dev"]);
      const devReader = devProcess.output.getReader();
      // Read output in background
      (async () => {
        while (true) {
          const { done, value } = await devReader.read();
          if (done) break;
          setLogs((prev) => [...prev.slice(-200), value]);
        }
      })();
    } catch (err) {
      setLogs((prev) => [...prev, `Error: ${err instanceof Error ? err.message : String(err)}`]);
      setRunning(false);
    }
  }, [boot, files, hasPackageJson, projectId]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1A1A18]/10 bg-[#FAF9F7] shrink-0">
        <div className="flex items-center gap-2">
          {!running ? (
            <Button
              size="sm"
              onClick={handleRun}
              disabled={status === "booting" || !hasPackageJson}
              className="h-6 px-2 text-[10px] gap-1 bg-[#2D6A4F] text-white hover:bg-[#2D6A4F]/90"
            >
              {status === "booting" ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
              Run
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRunning(false)}
              className="h-6 px-2 text-[10px] gap-1 text-[#D4583A]"
            >
              <Square className="size-3" />
              Stop
            </Button>
          )}
          {!hasPackageJson && (
            <span className="text-[10px] text-[#1A1A18]/40">No package.json — preview unavailable</span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowTerminal(!showTerminal)}
          className="h-6 px-2 text-[10px] gap-1"
        >
          <TerminalIcon className="size-3" />
          Terminal
        </Button>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 bg-white relative">
        {serverUrl ? (
          <iframe src={serverUrl} className="w-full h-full border-0" title="Preview" sandbox="allow-scripts allow-same-origin" />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-[#1A1A18]/30">
            {status === "booting" ? "Booting WebContainer..." :
             running ? "Waiting for dev server to start..." :
             wcError ? `Error: ${wcError}` :
             "Click Run to start the preview"}
          </div>
        )}
      </div>

      {/* Terminal logs */}
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

**Step 4: Create the WorkspacePanel wrapper**

Create `frontend/src/components/workspace/WorkspacePanel.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Code, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listWorkspaceFiles, type WorkspaceFile } from "@/lib/api";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import { FileTree } from "./FileTree";
import { CodeEditor } from "./CodeEditor";
import { PreviewPanel } from "./PreviewPanel";

type ViewMode = "editor" | "preview";

export function WorkspacePanel({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [loading, setLoading] = useState(true);

  const fetchFiles = useCallback(() => {
    listWorkspaceFiles(projectId)
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // Auto-refresh when agents produce output
  useWebSocket({
    projectId,
    onEvent: (evt: WSEvent) => {
      if (evt.type === "agent.output") {
        setTimeout(fetchFiles, 1000); // slight delay for files to be written
      }
    },
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[#1A1A18]/30">
        Loading workspace...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border border-[#1A1A18]/10 rounded-lg overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-[#1A1A18]/10 bg-[#FAF9F7] shrink-0">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewMode("editor")}
            className={`h-6 px-2 text-[10px] gap-1 ${viewMode === "editor" ? "bg-[#1A1A18]/10" : ""}`}
          >
            <Code className="size-3" />
            Code
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setViewMode("preview")}
            className={`h-6 px-2 text-[10px] gap-1 ${viewMode === "preview" ? "bg-[#1A1A18]/10" : ""}`}
          >
            <Eye className="size-3" />
            Preview
          </Button>
        </div>
        <Button size="sm" variant="ghost" onClick={fetchFiles} className="h-6 px-2 text-[10px]">
          <RefreshCw className="size-3" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0">
        {/* File tree sidebar */}
        <div className="w-48 border-r border-[#1A1A18]/10 overflow-y-auto shrink-0 bg-[#FAF9F7]">
          <FileTree files={files} selectedPath={selectedFile} onSelectFile={(p) => { setSelectedFile(p); setViewMode("editor"); }} />
        </div>

        {/* Main area */}
        <div className="flex-1 min-w-0">
          {viewMode === "editor" ? (
            <CodeEditor projectId={projectId} filePath={selectedFile} />
          ) : (
            <PreviewPanel projectId={projectId} files={files} />
          )}
        </div>
      </div>
    </div>
  );
}
```

**Step 5: Update the Overview page to split-pane layout**

Rewrite `frontend/src/app/(dashboard)/projects/[id]/page.tsx` — replace the entire return block (lines 122-383) with a split layout. The left side keeps the existing project info (condensed), the right side is the WorkspacePanel.

Add imports at top:
```typescript
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
```

Change the outer wrapper from:
```tsx
<div className="p-6 md:p-8 space-y-6 bg-[#FAF9F7] min-h-screen">
```
To:
```tsx
<div className="flex h-[calc(100vh-120px)] gap-4 p-4 bg-[#FAF9F7]">
  {/* Left pane — project info */}
  <div className="w-[40%] overflow-y-auto space-y-4 shrink-0">
    {/* ... existing content condensed ... */}
  </div>

  {/* Right pane — workspace IDE */}
  <div className="flex-1 min-w-0">
    <WorkspacePanel projectId={projectId} />
  </div>
</div>
```

The existing cards (progress, stats, agent status, task distribution) go inside the left pane. Reduce padding and spacing from `p-6 md:p-8 space-y-6` to `space-y-4` for a more compact layout.

**Step 6: Verify build**

Run: `cd frontend && npx next build 2>&1 | tail -10`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add frontend/src/components/workspace/ frontend/src/app/\(dashboard\)/projects/\[id\]/page.tsx
git commit -m "feat(ui): split-pane overview with file tree, code editor, and WebContainer preview"
```

---

### Task 9: Fix — Approve Gate 2 and verify pipeline continues

Before we're done, the orchestrator pipeline is stuck at `arch_review`. The gate wasn't created because the engine's `_route_after_agent` for the `architecture` phase may not be submitting a gate. This is a functional issue to investigate and fix.

**Step 1: Check if Gate 2 exists**

```bash
curl -s http://localhost:8000/api/projects/dfb26407-def0-4bbf-9261-e7c71ea59f76/gates | python3 -m json.tool
```

If only Gate 1 is there, check `backend/app/orchestrator/engine.py` to see the `_route_after_agent` logic for the architecture phase and the gate_manager's `submit_gate` calls. The `arch_review` state should have a gate submitted.

**Step 2: Fix the gate submission if missing**

Check `engine.py` — specifically the handler for when state transitions to `arch_review`. Ensure `gate_manager.submit_gate()` is called with gate_number=2.

**Step 3: Verify the fix**

Restart backend, create a new test project, and confirm the pipeline flows through all gates.

**Step 4: Commit**

```bash
git add backend/app/orchestrator/engine.py
git commit -m "fix(orchestrator): ensure Gate 2 is submitted on arch_review transition"
```

---

### Task 10: Final verification — full stack test

**Step 1: Restart both services**

```bash
# Kill and restart backend
cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Kill and restart frontend
cd frontend && npx next dev --port 3000
```

**Step 2: Open browser and verify**

1. Open http://localhost:3000
2. Create a new project
3. Start it — watch CPO work through discovery and PRD
4. Navigate to Agents tab — verify smart cards render (not raw JSON)
5. Approve Gate 1 on the Approvals tab
6. CTO should produce architecture — verify Architecture Card renders
7. Navigate to Overview — verify split-pane layout with file tree on right
8. Once dev agents produce code, verify files appear in file tree
9. Click a file — verify Monaco editor shows syntax-highlighted code
10. Click Preview → Run if there's a package.json

**Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final polish and fixes for IDE preview + smart cards"
```
