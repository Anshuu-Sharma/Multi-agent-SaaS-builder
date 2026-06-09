const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProjectState =
  | "briefing"
  | "discovery"
  | "prd_creation"
  | "prd_review"
  | "architecture"
  | "arch_review"
  | "budget"
  | "budget_review"
  | "sprint_planning"
  | "development"
  | "code_review"
  | "qa_testing"
  | "uat"
  | "deployment"
  | "complete"
  | "failed"
  | "paused";

export interface Project {
  id: string;
  name: string;
  brief: string;
  state: ProjectState;
  budget_limit: number;
  created_at: string;
  updated_at: string;
}

export interface Gate {
  id: string;
  project_id: string;
  gate_number: number;
  gate_name: string;
  status: "pending" | "approved" | "rejected";
  artifact_type: string | null;
  artifact_id: string | null;
  submitted_by: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface GateArtifact {
  gate: Gate;
  artifact: {
    id: string;
    type: string;
    title: string;
    content: string;
    created_by: string;
    created_at: string;
  };
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string;
  type: string;
  status: "not_started" | "in_progress" | "blocked" | "review" | "completed";
  priority: "low" | "medium" | "high" | "critical";
  assigned_to: string | null;
  depends_on: string[];
  created_at: string;
  updated_at: string;
}

export interface TaskTree {
  task: Task;
  children: TaskTree[];
}

export interface Agent {
  role: string;
  status: "idle" | "working" | "waiting" | "error";
  token_usage_total: number;
  cost_total_cents: number;
  current_task_id: string | null;
}

export interface AgentMessage {
  id: string;
  role: string;
  content: string;
  /** Backend returns created_at; normalized to timestamp in fetch helpers. */
  timestamp: string;
  message_type: "thinking" | "action" | "result" | "error";
  phase?: string;
  direction?: string;
}

/** Raw shape returned by GET /{role}/messages */
interface RawAgentMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
  message_type: string;
  phase?: string;
  direction?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

export interface Meeting {
  id: string;
  project_id: string;
  type: "standup" | "planning" | "review" | "retrospective";
  participants: string[];
  transcript: string;
  decisions: string[];
  action_items: string[];
  created_at: string;
}

export interface Budget {
  total_budget_cents: number;
  spent_cents: number;
  remaining_cents: number;
  utilization_pct: number;
  alert_level: "normal" | "warning" | "critical";
  breakdown: { llm: number; infrastructure: number; third_party: number };
}

export interface CostByAgent {
  agent_role: string;
  total_cents: number;
  total_tokens: number;
  call_count: number;
}

export interface AuditEntry {
  id: string;
  created_at: string;
  actor: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
}

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function createProject(data: { name: string; brief: string; budget_limit?: number }) {
  return apiFetch<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listProjects() {
  return apiFetch<Project[]>("/api/projects");
}

export function getProject(id: string) {
  return apiFetch<Project>(`/api/projects/${id}`);
}

export function startProject(id: string) {
  return apiFetch<Project>(`/api/projects/${id}/start`, { method: "POST" });
}

export function retryProject(id: string) {
  return apiFetch<{ status: string; project_id: string }>(`/api/projects/${id}/retry`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Gates / Approvals
// ---------------------------------------------------------------------------

export function listGates(projectId: string) {
  return apiFetch<Gate[]>(`/api/projects/${projectId}/gates`);
}

export function getPendingGates(projectId: string) {
  return apiFetch<Gate[]>(`/api/projects/${projectId}/gates/pending`);
}

export function getGateArtifact(projectId: string, gateId: string) {
  return apiFetch<GateArtifact>(`/api/projects/${projectId}/gates/${gateId}/artifact`);
}

export function reviewGate(
  projectId: string,
  gateId: string,
  data: { approved: boolean; notes?: string }
) {
  return apiFetch<Gate>(`/api/projects/${projectId}/gates/${gateId}/review`, {
    method: "POST",
    body: JSON.stringify({
      action: data.approved ? "approve" : "reject",
      notes: data.notes ?? "",
    }),
  });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function listTasks(projectId: string) {
  return apiFetch<Task[]>(`/api/projects/${projectId}/tasks`);
}

export function getTaskTree(projectId: string) {
  return apiFetch<TaskTree[]>(`/api/projects/${projectId}/tasks/tree`);
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export function listAgents(projectId: string) {
  return apiFetch<Agent[]>(`/api/projects/${projectId}/agents`);
}

function normalizeMessages(raw: RawAgentMessage[]): AgentMessage[] {
  return raw.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: m.created_at,
    message_type: (m.message_type as AgentMessage["message_type"]) || "action",
    phase: m.phase,
    direction: m.direction,
  }));
}

export async function getAgentMessages(projectId: string, role?: string): Promise<AgentMessage[]> {
  if (role) {
    const raw = await apiFetch<RawAgentMessage[]>(
      `/api/projects/${projectId}/agents/${encodeURIComponent(role)}/messages`
    );
    return normalizeMessages(raw);
  }
  // No role specified — fetch messages for all agents and merge
  const agents = await listAgents(projectId);
  const allMessages = await Promise.all(
    agents.map((a) =>
      apiFetch<RawAgentMessage[]>(
        `/api/projects/${projectId}/agents/${encodeURIComponent(a.role)}/messages`
      ).catch(() => [] as RawAgentMessage[])
    )
  );
  return normalizeMessages(allMessages.flat()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export function listMeetings(projectId: string) {
  return apiFetch<Meeting[]>(`/api/projects/${projectId}/meetings`);
}

// ---------------------------------------------------------------------------
// Budget
// ---------------------------------------------------------------------------

export function getBudget(projectId: string) {
  return apiFetch<Budget>(`/api/projects/${projectId}/budget`);
}

export function getCostsByAgent(projectId: string) {
  return apiFetch<CostByAgent[]>(`/api/projects/${projectId}/budget/by-agent`);
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function getAuditLog(projectId: string) {
  return apiFetch<AuditEntry[]>(`/api/projects/${projectId}/audit`);
}

// ---------------------------------------------------------------------------
// Workspace Files
// ---------------------------------------------------------------------------

export function listWorkspaceFiles(projectId: string) {
  return apiFetch<WorkspaceFile[]>(`/api/projects/${projectId}/files`);
}

export function readWorkspaceFile(projectId: string, filePath: string) {
  return apiFetch<FileContent>(`/api/projects/${projectId}/files/${encodeURIComponent(filePath)}`);
}

// ---------------------------------------------------------------------------
// Documents / Artifacts
// ---------------------------------------------------------------------------

export interface DocumentArtifact {
  id: string;
  doc_type: string;
  title: string;
  content: string;
  version: number;
  status: string;
  created_by: string;
  created_at: string;
}

export function listDocuments(projectId: string) {
  return apiFetch<DocumentArtifact[]>(`/api/projects/${projectId}/documents`);
}
