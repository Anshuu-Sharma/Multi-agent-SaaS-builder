"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  LayoutDashboard,
  ShieldCheck,
  FileText,
  Users,
  ListTodo,
  MessageSquare,
  DollarSign,
  ScrollText,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getProject, type Project, type ProjectState } from "@/lib/api";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import { WebContainerProvider } from "@/contexts/WebContainerContext";

const STATE_COLORS: Record<ProjectState, string> = {
  // Planning states — blue
  briefing: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  discovery: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  prd_creation: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  // Review states — amber/gold
  prd_review: "bg-[#B8860B]/8 text-[#B8860B] border border-[#B8860B]/15",
  design_review: "bg-[#B8860B]/8 text-[#B8860B] border border-[#B8860B]/15",
  arch_review: "bg-[#B8860B]/8 text-[#B8860B] border border-[#B8860B]/15",
  budget_review: "bg-[#B8860B]/8 text-[#B8860B] border border-[#B8860B]/15",
  // Build states — blue
  design: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  architecture: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  budget: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  sprint_planning: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  development: "bg-[#3A5FCD]/8 text-[#3A5FCD] border border-[#3A5FCD]/15",
  // Testing/release states — green
  code_review: "bg-[#2D6A4F]/8 text-[#2D6A4F] border border-[#2D6A4F]/15",
  qa_testing: "bg-[#2D6A4F]/8 text-[#2D6A4F] border border-[#2D6A4F]/15",
  uat: "bg-[#2D6A4F]/8 text-[#2D6A4F] border border-[#2D6A4F]/15",
  deployment: "bg-[#2D6A4F]/8 text-[#2D6A4F] border border-[#2D6A4F]/15",
  // Terminal states
  complete: "bg-[#2D6A4F]/10 text-[#2D6A4F] border border-[#2D6A4F]/20",
  failed: "bg-[#D4583A]/8 text-[#D4583A] border border-[#D4583A]/15",
  paused: "bg-[#D97706]/8 text-[#D97706] border border-[#D97706]/15",
};

function formatState(state: string): string {
  return state
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const TABS = [
  { label: "Overview", href: "", icon: LayoutDashboard },
  { label: "Approvals", href: "/approvals", icon: ShieldCheck },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Agents", href: "/agents", icon: Users },
  { label: "Tasks", href: "/tasks", icon: ListTodo },
  { label: "Meetings", href: "/meetings", icon: MessageSquare },
  { label: "Budget", href: "/budget", icon: DollarSign },
  { label: "Audit", href: "/audit", icon: ScrollText },
];

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const pathname = usePathname();
  const projectId = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    getProject(projectId)
      .then(setProject)
      .catch(() => {
        setProject(null);
        setLoadError(true);
      });
  }, [projectId]);

  const handleWSEvent = useCallback((evt: WSEvent) => {
    if (evt.type === "state.changed" && evt.data?.to_state) {
      setProject((prev) =>
        prev
          ? { ...prev, state: evt.data!.to_state as ProjectState }
          : prev
      );
    }
  }, []);

  const { connected } = useWebSocket({
    projectId,
    onEvent: handleWSEvent,
  });

  const basePath = `/projects/${projectId}`;

  function isActive(tabHref: string) {
    const fullPath = basePath + tabHref;
    if (tabHref === "") {
      return pathname === basePath || pathname === basePath + "/";
    }
    return pathname.startsWith(fullPath);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Project header */}
      <div className="border-b border-[#1A1A18]/8 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 md:px-8 pt-4 pb-0">
          <div className="flex items-center gap-3 mb-4">
            <Link
              href="/"
              className="text-[#1A1A18]/55 hover:text-[#1A1A18]/70 transition-colors"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-lg font-semibold text-[#1A1A18] truncate">
                {project?.name ?? (loadError ? "Failed to load project" : "Loading...")}
              </h1>
              {project && (
                <Badge
                  className={`text-[10px] px-2 py-0 font-medium shrink-0 ${
                    STATE_COLORS[project.state] ?? STATE_COLORS.briefing
                  }`}
                >
                  {formatState(project.state)}
                </Badge>
              )}
              <Badge
                className={`text-[10px] px-2 py-0 gap-1 shrink-0 ${
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
          </div>

          {/* Tabs */}
          <nav className="flex gap-0.5 overflow-x-auto -mb-px">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = isActive(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={basePath + tab.href}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                    active
                      ? "border-[#D4583A] text-[#D4583A]"
                      : "border-transparent text-[#1A1A18]/55 hover:text-[#1A1A18]/70 hover:border-[#1A1A18]/15"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <WebContainerProvider>{children}</WebContainerProvider>
      </div>
    </div>
  );
}
