"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { GitBranch, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { listTasks, type Task } from "@/lib/api";

type TaskStatus = Task["status"];

const COLUMNS: { status: TaskStatus; label: string; dotColor: string }[] = [
  { status: "not_started", label: "Not Started", dotColor: "bg-[#78766F]" },
  { status: "in_progress", label: "In Progress", dotColor: "bg-[#3A5FCD]" },
  { status: "blocked", label: "Blocked", dotColor: "bg-[#D4583A]" },
  { status: "review", label: "Review", dotColor: "bg-[#B8860B]" },
  { status: "completed", label: "Completed", dotColor: "bg-[#2D6A4F]" },
];

const STATUS_BADGE_STYLES: Record<string, string> = {
  not_started: "bg-[#78766F]/10 text-[#78766F]",
  in_progress: "bg-[#3A5FCD]/10 text-[#3A5FCD]",
  blocked: "bg-[#D4583A]/10 text-[#D4583A]",
  review: "bg-[#B8860B]/10 text-[#B8860B]",
  completed: "bg-[#2D6A4F]/10 text-[#2D6A4F]",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-[#78766F]/10 text-[#78766F]",
  medium: "bg-[#3A5FCD]/10 text-[#3A5FCD]",
  high: "bg-[#D97706]/10 text-[#D97706]",
  critical: "bg-[#D4583A]/10 text-[#D4583A]",
};

const TYPE_STYLES: Record<string, string> = {
  feature: "bg-[#7B4F9D]/10 text-[#7B4F9D]",
  bug: "bg-[#D4583A]/10 text-[#D4583A]",
  task: "bg-[#3A5FCD]/10 text-[#3A5FCD]",
  design: "bg-[#C74882]/10 text-[#C74882]",
  research: "bg-[#B8860B]/10 text-[#B8860B]",
  review: "bg-[#D97706]/10 text-[#D97706]",
};

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function TasksPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    listTasks(projectId)
      .then(setTasks)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load tasks");
        setTasks([]);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const tasksByColumn = COLUMNS.map((col) => ({
    ...col,
    tasks: tasks.filter((t) => t.status === col.status),
  }));

  return (
    <div className="p-6 md:p-8 bg-[#FAF9F7] min-h-screen">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[#1A1A18]">Task Board</h2>
        <p className="text-xs text-[#1A1A18]/70 mt-1">
          {tasks.length} total tasks
        </p>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-[#D4583A]/20 bg-[#D4583A]/5 px-4 py-3 mb-4">
          <p className="text-sm text-[#D4583A]">{error}</p>
          <button className="text-xs text-[#D4583A] hover:text-[#D4583A]/70 underline" onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <div
              key={col.status}
              className="w-64 shrink-0 bg-[#F4F2EF] rounded-lg p-3 animate-pulse h-96"
            />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {tasksByColumn.map((col) => (
            <div
              key={col.status}
              className="w-64 shrink-0 flex flex-col"
            >
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className={`size-2 rounded-full ${col.dotColor}`} />
                <span className="text-xs font-medium text-[#1A1A18]/80">
                  {col.label}
                </span>
                <span className="text-[10px] text-[#1A1A18]/55 ml-auto">
                  {col.tasks.length}
                </span>
              </div>

              {/* Column body */}
              <div className="bg-[#F4F2EF] rounded-lg p-2 flex-1">
                <ScrollArea className="max-h-[calc(100vh-260px)]">
                  <div className="space-y-2 pr-1">
                    {col.tasks.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-[#1A1A18]/10 py-8 text-center">
                        <p className="text-[10px] text-[#1A1A18]/45">No tasks</p>
                      </div>
                    ) : (
                      col.tasks.map((task) => (
                        <Card
                          key={task.id}
                          className="bg-white border border-[#1A1A18]/[0.08] shadow-none hover:shadow-md hover:shadow-[#1A1A18]/[0.04] transition-shadow cursor-pointer"
                          onClick={() => setSelectedTask(task)}
                        >
                          <CardContent className="p-3 space-y-2">
                            <p className="text-xs font-medium text-[#1A1A18] leading-snug">
                              {task.title}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Badge
                                className={`text-[9px] px-1.5 py-0 border-0 ${
                                  TYPE_STYLES[task.type] ?? TYPE_STYLES.task
                                }`}
                              >
                                {task.type}
                              </Badge>
                              <Badge
                                className={`text-[9px] px-1.5 py-0 border-0 ${
                                  PRIORITY_STYLES[task.priority] ??
                                  PRIORITY_STYLES.medium
                                }`}
                              >
                                {task.priority}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              {task.assigned_to ? (
                                <span className="text-[10px] text-[#1A1A18]/70">
                                  {formatRole(task.assigned_to)}
                                </span>
                              ) : (
                                <span className="text-[10px] text-[#1A1A18]/45 italic">
                                  Unassigned
                                </span>
                              )}
                              {task.depends_on.length > 0 && (
                                <span
                                  className="flex items-center gap-0.5 text-[10px] text-[#1A1A18]/55"
                                  title={`Depends on ${task.depends_on.length} task(s)`}
                                >
                                  <GitBranch className="size-3" />
                                  {task.depends_on.length}
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task detail dialog */}
      <Dialog
        open={selectedTask !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTask(null);
        }}
      >
        <DialogContent className="bg-white border border-[#1A1A18]/[0.08] shadow-lg max-w-lg">
          {selectedTask && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#1A1A18] text-base">
                  {selectedTask.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap gap-2">
                  <Badge
                    className={`text-[10px] px-2 py-0 border-0 ${
                      TYPE_STYLES[selectedTask.type] ?? TYPE_STYLES.task
                    }`}
                  >
                    {selectedTask.type}
                  </Badge>
                  <Badge
                    className={`text-[10px] px-2 py-0 border-0 ${
                      PRIORITY_STYLES[selectedTask.priority] ??
                      PRIORITY_STYLES.medium
                    }`}
                  >
                    {selectedTask.priority}
                  </Badge>
                  <Badge
                    className={`text-[10px] px-2 py-0 border-0 ${
                      STATUS_BADGE_STYLES[selectedTask.status] ?? "bg-[#78766F]/10 text-[#78766F]"
                    }`}
                  >
                    {selectedTask.status.replace("_", " ")}
                  </Badge>
                </div>

                {selectedTask.description && (
                  <div>
                    <p className="text-xs font-medium text-[#1A1A18]/70 mb-1">
                      Description
                    </p>
                    <p className="text-xs text-[#1A1A18]/80 whitespace-pre-wrap">
                      {selectedTask.description}
                    </p>
                  </div>
                )}

                <Separator className="bg-[#1A1A18]/[0.08]" />

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-[#1A1A18]/70 mb-0.5">Assigned To</p>
                    <p className="text-[#1A1A18]">
                      {selectedTask.assigned_to
                        ? formatRole(selectedTask.assigned_to)
                        : "Unassigned"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[#1A1A18]/70 mb-0.5">Created</p>
                    <p className="text-[#1A1A18]">
                      {new Date(selectedTask.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {selectedTask.depends_on.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-[#1A1A18]/70 mb-1">
                      Dependencies
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selectedTask.depends_on.map((dep) => (
                        <Badge
                          key={dep}
                          className="text-[10px] px-2 py-0 bg-[#F0EFEC] text-[#1A1A18]/80 border-0 gap-1"
                        >
                          <ArrowUpRight className="size-3" />
                          {dep.slice(0, 8)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
