"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { Wifi, WifiOff, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAgents, getAgentMessages, type Agent, type AgentMessage } from "@/lib/api";
import { MessageCard } from "@/components/agent-cards/MessageCard";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";

const ROLE_COLORS: Record<string, string> = {
  ceo: "bg-[#7B4F9D]",
  cpo: "bg-[#D4583A]",
  cto: "bg-[#2D6A4F]",
  cfo: "bg-[#B8860B]",
  backend_dev: "bg-[#3A5FCD]",
  frontend_dev: "bg-[#C74882]",
  qa_engineer: "bg-[#D97706]",
  qa: "bg-[#D97706]",
  system: "bg-[#78766F]",
};

const STATUS_BADGE: Record<string, string> = {
  idle: "bg-[#78766F]/10 text-[#78766F]",
  working: "bg-[#2D6A4F]/10 text-[#2D6A4F]",
  waiting: "bg-[#B8860B]/10 text-[#B8860B]",
  error: "bg-[#D4583A]/10 text-[#D4583A]",
};

const MESSAGE_TYPE_STYLES: Record<string, string> = {
  thinking: "border-l-[#78766F]",
  action: "border-l-[#3A5FCD]",
  result: "border-l-[#2D6A4F]",
  error: "border-l-[#D4583A]",
  system: "border-l-[#78766F]",
};

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function roleInitials(role: string): string {
  return role
    .split("_")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function AgentsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // WebSocket for real-time feed + agent status updates
  const { connected } = useWebSocket({
    projectId,
    onEvent: (evt: WSEvent) => {
      // Agent output / messages → add to feed
      if (
        (evt.type === "agent.output" || evt.type === "message") &&
        evt.role &&
        evt.content
      ) {
        const msg: AgentMessage = {
          id: evt.id,
          role: evt.role,
          content: evt.content,
          timestamp: evt.timestamp,
          message_type: (evt.data?.message_type as AgentMessage["message_type"]) ?? "action",
          phase: evt.data?.phase as string | undefined,
        };
        setMessages((prev) => [...prev.slice(-199), msg]);
      }

      // Agent started → update pill to "working"
      if (evt.type === "agent.started" && evt.role) {
        const role = evt.role;
        setAgents((prev) =>
          prev.map((a) =>
            a.role === role ? { ...a, status: "working" as const } : a
          )
        );
        setMessages((prev) => [
          ...prev.slice(-199),
          {
            id: evt.id,
            role,
            content: `Agent started working${evt.data?.phase ? ` on ${(evt.data.phase as string).replace(/_/g, " ")}` : ""}`,
            timestamp: evt.timestamp,
            message_type: "action" as const,
            phase: evt.data?.phase as string | undefined,
          },
        ]);
      }

      // Agent completed → update pill to "idle"
      if (evt.type === "agent.completed" && evt.role) {
        const role = evt.role;
        setAgents((prev) =>
          prev.map((a) =>
            a.role === role ? { ...a, status: "idle" as const } : a
          )
        );
      }

      // Agent error → update pill to "error"
      if (evt.type === "agent.error" && evt.role) {
        const role = evt.role;
        setAgents((prev) =>
          prev.map((a) =>
            a.role === role ? { ...a, status: "error" as const } : a
          )
        );
        setMessages((prev) => [
          ...prev.slice(-199),
          {
            id: evt.id,
            role,
            content: `Agent error: ${(evt.data?.error as string) ?? "unknown error"}`,
            timestamp: evt.timestamp,
            message_type: "error" as const,
          },
        ]);
      }

      // State changed → inject system message into feed
      if (evt.type === "state.changed") {
        const from = (evt.data?.from_state as string) ?? "?";
        const to = (evt.data?.to_state as string) ?? "?";
        setMessages((prev) => [
          ...prev.slice(-199),
          {
            id: evt.id,
            role: "system",
            content: `Project transitioned: ${from.replace(/_/g, " ")} → ${to.replace(/_/g, " ")}`,
            timestamp: evt.timestamp,
            message_type: "action" as const,
          },
        ]);
      }

      // Gate submitted → inject notification
      if (evt.type === "gate.submitted") {
        setMessages((prev) => [
          ...prev.slice(-199),
          {
            id: evt.id,
            role: evt.role ?? "system",
            content: `Gate submitted for review: ${(evt.data?.gate_key as string)?.replace(/_/g, " ") ?? "approval gate"}`,
            timestamp: evt.timestamp,
            message_type: "result" as const,
          },
        ]);
      }
    },
  });

  useEffect(() => {
    Promise.all([
      listAgents(projectId),
      getAgentMessages(projectId),
    ])
      .then(([ag, msgs]) => {
        setAgents(ag);
        setMessages(msgs);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load agent data");
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const filteredMessages =
    filterRole === "all"
      ? messages
      : messages.filter((m) => m.role === filterRole);

  const roles = Array.from(new Set(agents.map((a) => a.role)));

  return (
    <div className="p-6 md:p-8 flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-[#1A1A18]">Agent Activity</h2>
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
            {connected ? "Live" : "Disconnected"}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="size-3.5 text-[#1A1A18]/55" />
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-40 h-8 text-xs bg-white border-[#1A1A18]/[0.08] text-[#1A1A18]">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent className="bg-white border-[#1A1A18]/[0.08]">
              <SelectItem value="all" className="text-xs">
                All agents
              </SelectItem>
              {roles.map((role) => (
                <SelectItem key={role} value={role} className="text-xs">
                  {formatRole(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Agent status row */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 shrink-0">
        {agents.map((agent) => (
          <Button
            key={agent.role}
            variant="ghost"
            size="sm"
            onClick={() =>
              setFilterRole(filterRole === agent.role ? "all" : agent.role)
            }
            className={`shrink-0 gap-2 h-8 px-3 ${
              filterRole === agent.role
                ? "bg-[#F0EFEC] text-[#1A1A18]"
                : "text-[#1A1A18]/70 hover:bg-[#F0EFEC]/60"
            }`}
          >
            <span
              className={`size-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
                ROLE_COLORS[agent.role] ?? "bg-[#78766F]"
              }`}
            >
              {roleInitials(agent.role)}
            </span>
            <span className="text-xs">{formatRole(agent.role)}</span>
            <Badge
              className={`text-[9px] px-1 py-0 ${
                STATUS_BADGE[agent.status] ?? STATUS_BADGE.idle
              }`}
            >
              {agent.status}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between rounded-md border border-[#D4583A]/20 bg-[#D4583A]/5 px-4 py-3 mb-4 shrink-0">
          <p className="text-sm text-[#D4583A]">{error}</p>
          <Button size="sm" variant="ghost" className="text-[#D4583A] hover:text-[#D4583A]/80" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      )}

      {/* Message feed */}
      <Card className="bg-white border-[#1A1A18]/[0.08] flex-1 overflow-hidden">
        <CardContent className="p-0 h-full">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-[#1A1A18]/45">Loading messages...</p>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-[#1A1A18]/45">
                No messages yet. Activity will appear here in real-time.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-full" ref={scrollRef}>
              <div className="p-4 space-y-3">
                {filteredMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 border-l-2 pl-3 py-1 ${
                      MESSAGE_TYPE_STYLES[msg.message_type] ??
                      MESSAGE_TYPE_STYLES.action
                    }`}
                  >
                    <div
                      className={`size-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5 ${
                        ROLE_COLORS[msg.role] ?? "bg-[#78766F]"
                      }`}
                    >
                      {roleInitials(msg.role)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-[#1A1A18]">
                          {formatRole(msg.role)}
                        </span>
                        <Badge className="text-[9px] px-1 py-0 bg-[#F0EFEC] text-[#1A1A18]/70">
                          {msg.message_type}
                        </Badge>
                        <span className="text-[10px] text-[#1A1A18]/45">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <MessageCard message={msg} />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
