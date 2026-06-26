"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { Play, CheckCircle2, Clock, AlertTriangle, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getProject,
  listAgents,
  listTasks,
  getPendingGates,
  getBudget,
  startProject,
  retryProject,
  type Project,
  type ProjectState,
  type Agent,
  type Task,
  type Budget,
} from "@/lib/api";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";

// ---------------------------------------------------------------------------
// 15-state pipeline (matches backend/app/orchestrator/state_machine.py)
// ---------------------------------------------------------------------------

const PROJECT_STATES: ProjectState[] = [
  "briefing",
  "discovery",
  "prd_creation",
  "prd_review",
  "design",
  "design_review",
  "architecture",
  "arch_review",
  "budget",
  "budget_review",
  "sprint_planning",
  "development",
  "code_review",
  "qa_testing",
  "uat",
  "deployment",
  "complete",
];

const STATE_LABELS: Record<string, string> = {
  briefing: "Brief",
  discovery: "Discovery",
  prd_creation: "PRD",
  prd_review: "PRD Review",
  design: "Design",
  design_review: "Design Review",
  architecture: "Architecture",
  arch_review: "Arch Review",
  budget: "Budget",
  budget_review: "Budget Review",
  sprint_planning: "Sprint Plan",
  development: "Dev",
  code_review: "Code Review",
  qa_testing: "QA",
  uat: "UAT",
  deployment: "Deploy",
  complete: "Complete",
  failed: "Failed",
  paused: "Paused",
};

/** Dot color for each state when it is the current state. */
const STATE_DOT_COLORS: Record<string, string> = {
  // Planning — blue
  briefing: "bg-[#3A5FCD]",
  discovery: "bg-[#3A5FCD]",
  prd_creation: "bg-[#3A5FCD]",
  design: "bg-[#3A5FCD]",
  // Review — amber
  prd_review: "bg-[#B8860B]",
  design_review: "bg-[#B8860B]",
  arch_review: "bg-[#B8860B]",
  budget_review: "bg-[#B8860B]",
  // Build — blue
  architecture: "bg-[#3A5FCD]",
  budget: "bg-[#3A5FCD]",
  sprint_planning: "bg-[#3A5FCD]",
  development: "bg-[#3A5FCD]",
  // Testing/release — green
  code_review: "bg-[#2D6A4F]",
  qa_testing: "bg-[#2D6A4F]",
  uat: "bg-[#2D6A4F]",
  deployment: "bg-[#2D6A4F]",
  complete: "bg-[#2D6A4F]",
  // Terminal failures
  failed: "bg-[#D4583A]",
  paused: "bg-[#D97706]",
};

const AGENT_ROLE_COLORS: Record<string, string> = {
  ceo: "bg-[#7B4F9D]",
  cpo: "bg-[#D4583A]",
  cto: "bg-[#2D6A4F]",
  cfo: "bg-[#B8860B]",
  backend_dev: "bg-[#3A5FCD]",
  frontend_dev: "bg-[#C74882]",
  qa_engineer: "bg-[#D97706]",
};

const AGENT_STATUS_COLORS: Record<string, string> = {
  idle: "bg-[#78766F]",
  working: "bg-[#2D6A4F]",
  waiting: "bg-[#B8860B]",
  error: "bg-[#D4583A]",
};

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Polling interval (ms)
// ---------------------------------------------------------------------------
const POLL_INTERVAL = 10_000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProjectOverview() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pendingGates, setPendingGates] = useState(0);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Initial fetch
  // -----------------------------------------------------------------------
  useEffect(() => {
    Promise.all([
      getProject(projectId),
      listAgents(projectId).catch(() => [] as Agent[]),
      listTasks(projectId).catch(() => [] as Task[]),
      getPendingGates(projectId).then((g) => g.length).catch(() => 0),
      getBudget(projectId).catch(() => null),
    ])
      .then(([proj, ag, tk, pg, bg]) => {
        setProject(proj);
        setAgents(ag);
        setTasks(tk);
        setPendingGates(pg);
        setBudget(bg);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load project data");
      });
  }, [projectId]);

  // -----------------------------------------------------------------------
  // WebSocket real-time updates
  // -----------------------------------------------------------------------
  const handleWSEvent = useCallback(
    (evt: WSEvent) => {
      switch (evt.type) {
        case "state.changed": {
          if (evt.data?.to_state) {
            setProject((prev) =>
              prev ? { ...prev, state: evt.data!.to_state as ProjectState } : prev
            );
          }
          // Re-fetch full project data for any other fields that changed
          getProject(projectId).then(setProject).catch(() => {});
          break;
        }

        case "agent.started": {
          if (evt.role) {
            setAgents((prev) =>
              prev.map((a) =>
                a.role === evt.role ? { ...a, status: "working" as const } : a
              )
            );
          }
          break;
        }

        case "agent.completed": {
          if (evt.role) {
            setAgents((prev) =>
              prev.map((a) =>
                a.role === evt.role ? { ...a, status: "idle" as const } : a
              )
            );
          }
          break;
        }

        case "agent.error": {
          if (evt.role) {
            setAgents((prev) =>
              prev.map((a) =>
                a.role === evt.role ? { ...a, status: "error" as const } : a
              )
            );
          }
          break;
        }

        case "task.updated": {
          listTasks(projectId).then(setTasks).catch(() => {});
          break;
        }

        case "budget.alert": {
          getBudget(projectId).then(setBudget).catch(() => {});
          break;
        }

        case "gate.submitted": {
          setPendingGates((prev) => prev + 1);
          break;
        }

        case "gate.reviewed": {
          setPendingGates((prev) => Math.max(0, prev - 1));
          break;
        }
      }
    },
    [projectId]
  );

  const { connected } = useWebSocket({
    projectId,
    onEvent: handleWSEvent,
  });

  // -----------------------------------------------------------------------
  // 10-second polling fallback
  // -----------------------------------------------------------------------
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    pollRef.current = setInterval(() => {
      listAgents(projectId).then(setAgents).catch(() => {});
      listTasks(projectId).then(setTasks).catch(() => {});
      getBudget(projectId).then(setBudget).catch(() => {});
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [projectId]);

  // -----------------------------------------------------------------------
  // Start handler
  // -----------------------------------------------------------------------
  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const updated = await startProject(projectId);
      setProject(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start project");
    } finally {
      setStarting(false);
    }
  }

  // -----------------------------------------------------------------------
  // Retry handler
  // -----------------------------------------------------------------------
  async function handleRetry() {
    setStarting(true);
    setError(null);
    try {
      await retryProject(projectId);
      const updated = await getProject(projectId);
      setProject(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry project");
    } finally {
      setStarting(false);
    }
  }

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------
  const tasksByStatus = tasks.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const currentStateIdx = project
    ? PROJECT_STATES.indexOf(project.state)
    : -1;

  // For failed/paused, we highlight differently — no pipeline position
  const isTerminal = project?.state === "failed" || project?.state === "paused";

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4 p-4 bg-[#FAF9F7]">
      {/* Left pane — project info */}
      <div className="w-[40%] overflow-y-auto space-y-4 shrink-0">
        {/* Error banner */}
        {error && (
          <div className="flex items-center justify-between rounded-lg border border-[#D4583A]/20 bg-[#D4583A]/5 px-4 py-3">
            <p className="text-sm text-[#D4583A]">{error}</p>
            <Button
              size="sm"
              variant="ghost"
              className="text-[#D4583A] hover:text-[#D4583A]/80 hover:bg-[#D4583A]/10"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* State machine progress */}
        <Card className="bg-white border border-[#1A1A18]/[0.08] shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium text-[#1A1A18]/80">
                  Project Progress
                </CardTitle>
                <Badge
                  className={`text-[10px] px-2 py-0 gap-1 ${
                    connected
                      ? "bg-[#2D6A4F]/10 text-[#2D6A4F]"
                      : "bg-[#78766F]/10 text-[#78766F]"
                  }`}
                >
                  {connected ? (
                    <Wifi className="size-3" />
                  ) : (
                    <WifiOff className="size-3" />
                  )}
                  {connected ? "Live" : "Offline"}
                </Badge>
              </div>
              {project?.state === "briefing" && (
                <Button
                  size="sm"
                  onClick={handleStart}
                  disabled={starting}
                  className="gap-1.5 bg-[#1A1A18] text-white hover:bg-[#1A1A18]/90"
                >
                  <Play className="size-3.5" />
                  {starting ? "Starting..." : "Start Project"}
                </Button>
              )}
              {project?.state === "failed" && (
                <Button
                  size="sm"
                  onClick={handleRetry}
                  disabled={starting}
                  className="gap-1.5 bg-[#D4583A] text-white hover:bg-[#D4583A]/90"
                >
                  <Play className="size-3.5" />
                  {starting ? "Retrying..." : "Retry Project"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Compact dot-based progress for 15 states */}
            <div className="relative flex items-center w-full">
              {/* Connecting line (behind dots) */}
              <div className="absolute top-[9px] left-2 right-2 h-[2px] bg-[#F0EFEC] z-0" />
              {currentStateIdx > 0 && !isTerminal && (
                <div
                  className="absolute top-[9px] left-2 h-[2px] bg-[#2D6A4F] z-[1] transition-all duration-500"
                  style={{
                    width: `${((currentStateIdx) / (PROJECT_STATES.length - 1)) * 100}%`,
                    maxWidth: "calc(100% - 16px)",
                  }}
                />
              )}
              {/* Dots */}
              <div className="relative z-[2] flex items-center justify-between w-full">
                {PROJECT_STATES.map((state, i) => {
                  const isPast = currentStateIdx >= 0 && i < currentStateIdx && !isTerminal;
                  const isCurrent = i === currentStateIdx && !isTerminal;
                  const isFuture = !isPast && !isCurrent;

                  return (
                    <div
                      key={state}
                      className="flex flex-col items-center group relative"
                      style={{ width: `${100 / PROJECT_STATES.length}%` }}
                    >
                      {/* Dot */}
                      <div
                        className={`rounded-full transition-all duration-300 ${
                          isCurrent
                            ? `size-[18px] ${STATE_DOT_COLORS[state] ?? "bg-[#3A5FCD]"} ring-2 ring-offset-2 ring-offset-white ${
                                STATE_DOT_COLORS[state]?.replace("bg-", "ring-") ?? "ring-[#3A5FCD]"
                              }/30`
                            : isPast
                              ? "size-3 bg-[#2D6A4F]"
                              : "size-3 bg-[#E8E6E3]"
                        }`}
                      />
                      {/* Label — only show for current + neighbors, or on hover */}
                      <span
                        className={`text-[8px] mt-1.5 text-center leading-tight whitespace-nowrap ${
                          isCurrent
                            ? "font-semibold text-[#1A1A18]"
                            : isPast
                              ? "text-[#2D6A4F] font-medium"
                              : "text-[#1A1A18]/35"
                        } ${
                          isCurrent || (currentStateIdx >= 0 && Math.abs(i - currentStateIdx) <= 1)
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100"
                        } transition-opacity`}
                      >
                        {STATE_LABELS[state] ?? state}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Show terminal state banner if failed/paused */}
            {isTerminal && project && (
              <div
                className={`mt-3 text-center text-xs font-medium py-1.5 rounded-md ${
                  project.state === "failed"
                    ? "bg-[#D4583A]/10 text-[#D4583A]"
                    : "bg-[#D97706]/10 text-[#D97706]"
                }`}
              >
                {STATE_LABELS[project.state] ?? project.state}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="bg-white border border-[#1A1A18]/[0.08] shadow-none">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="size-4 text-[#2D6A4F]" />
                <span className="text-xs text-[#1A1A18]/70">Completed</span>
              </div>
              <p className="text-2xl font-semibold text-[#1A1A18]">
                {tasksByStatus.completed ?? 0}
              </p>
              <p className="text-[10px] text-[#1A1A18]/55 mt-0.5">
                of {tasks.length} tasks
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white border border-[#1A1A18]/[0.08] shadow-none">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="size-4 text-[#3A5FCD]" />
                <span className="text-xs text-[#1A1A18]/70">In Progress</span>
              </div>
              <p className="text-2xl font-semibold text-[#1A1A18]">
                {tasksByStatus.in_progress ?? 0}
              </p>
              <p className="text-[10px] text-[#1A1A18]/55 mt-0.5">active tasks</p>
            </CardContent>
          </Card>
          <Card className="bg-white border border-[#1A1A18]/[0.08] shadow-none">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="size-4 text-[#B8860B]" />
                <span className="text-xs text-[#1A1A18]/70">Pending Gates</span>
              </div>
              <p className="text-2xl font-semibold text-[#1A1A18]">
                {pendingGates}
              </p>
              <p className="text-[10px] text-[#1A1A18]/55 mt-0.5">awaiting review</p>
            </CardContent>
          </Card>
          <Card className="bg-white border border-[#1A1A18]/[0.08] shadow-none">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle
                  className={`size-4 ${
                    budget?.alert_level === "critical"
                      ? "text-[#D4583A]"
                      : budget?.alert_level === "warning"
                        ? "text-[#B8860B]"
                        : "text-[#2D6A4F]"
                  }`}
                />
                <span className="text-xs text-[#1A1A18]/70">Budget Used</span>
              </div>
              <p className="text-2xl font-semibold text-[#1A1A18]">
                {budget ? `${Math.round(budget.utilization_pct)}%` : "--"}
              </p>
              <p className="text-[10px] text-[#1A1A18]/55 mt-0.5">
                {budget
                  ? `$${(budget.spent_cents / 100).toFixed(2)} / $${(budget.total_budget_cents / 100).toFixed(2)}`
                  : "loading..."}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Agent status cards */}
        <div>
          <h2 className="text-sm font-medium text-[#1A1A18]/80 mb-3">Agent Status</h2>
          {agents.length === 0 ? (
            <Card className="bg-white border border-[#1A1A18]/[0.08] shadow-none">
              <CardContent className="py-8 text-center">
                <p className="text-sm text-[#1A1A18]/55">
                  No agents active. Start the project to initialize agents.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {agents.map((agent) => (
                <Card
                  key={agent.role}
                  className="bg-white border border-[#1A1A18]/[0.08] shadow-none"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className={`size-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                          AGENT_ROLE_COLORS[agent.role] ?? "bg-[#78766F]"
                        }`}
                      >
                        {agent.role
                          .split("_")
                          .map((w) => w[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#1A1A18] truncate">
                          {formatRole(agent.role)}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`size-1.5 rounded-full ${
                              AGENT_STATUS_COLORS[agent.status] ?? "bg-[#78766F]"
                            }`}
                          />
                          <span className="text-[10px] text-[#1A1A18]/70 capitalize">
                            {agent.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between text-[11px] text-[#1A1A18]/70">
                      <span>{agent.token_usage_total.toLocaleString()} tokens</span>
                      <span>${(agent.cost_total_cents / 100).toFixed(4)}</span>
                    </div>
                    {agent.current_task_id && (
                      <p className="text-[10px] text-[#1A1A18]/55 mt-2 truncate">
                        Task: {agent.current_task_id}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Task summary */}
        <div>
          <h2 className="text-sm font-medium text-[#1A1A18]/80 mb-3">
            Task Distribution
          </h2>
          <Card className="bg-white border border-[#1A1A18]/[0.08] shadow-none">
            <CardContent className="p-4">
              {tasks.length === 0 ? (
                <p className="text-sm text-[#1A1A18]/55 text-center py-4">
                  No tasks created yet
                </p>
              ) : (
                <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-[#F0EFEC]">
                  {(
                    [
                      { key: "completed", color: "bg-[#2D6A4F]" },
                      { key: "review", color: "bg-[#B8860B]" },
                      { key: "in_progress", color: "bg-[#3A5FCD]" },
                      { key: "blocked", color: "bg-[#D4583A]" },
                      { key: "not_started", color: "bg-[#78766F]" },
                    ] as const
                  ).map(({ key, color }) => {
                    const count = tasksByStatus[key] ?? 0;
                    if (count === 0) return null;
                    return (
                      <div
                        key={key}
                        className={`${color} rounded-sm transition-all`}
                        style={{
                          width: `${(count / tasks.length) * 100}%`,
                        }}
                        title={`${key.replace("_", " ")}: ${count}`}
                      />
                    );
                  })}
                </div>
              )}
              {tasks.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                  {[
                    { key: "completed", color: "bg-[#2D6A4F]", label: "Completed" },
                    { key: "review", color: "bg-[#B8860B]", label: "Review" },
                    { key: "in_progress", color: "bg-[#3A5FCD]", label: "In Progress" },
                    { key: "blocked", color: "bg-[#D4583A]", label: "Blocked" },
                    { key: "not_started", color: "bg-[#78766F]", label: "Not Started" },
                  ].map(({ key, color, label }) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <span className={`size-2 rounded-full ${color}`} />
                      <span className="text-[10px] text-[#1A1A18]/70">
                        {label}: {tasksByStatus[key] ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right pane — workspace IDE */}
      <div className="flex-1 min-w-0">
        <WorkspacePanel projectId={projectId} />
      </div>
    </div>
  );
}
