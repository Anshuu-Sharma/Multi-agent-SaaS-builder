"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ScrollText, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAuditLog, type AuditEntry } from "@/lib/api";

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const ACTION_STYLES: Record<string, string> = {
  create: "bg-[#2D6A4F]/10 text-[#2D6A4F]",
  update: "bg-[#3A5FCD]/10 text-[#3A5FCD]",
  delete: "bg-[#D4583A]/10 text-[#D4583A]",
  approve: "bg-[#2D6A4F]/10 text-[#2D6A4F]",
  reject: "bg-[#D4583A]/10 text-[#D4583A]",
  start: "bg-[#7B4F9D]/10 text-[#7B4F9D]",
  complete: "bg-[#2D6A4F]/10 text-[#2D6A4F]",
  submit: "bg-[#B8860B]/10 text-[#B8860B]",
};

export default function AuditPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");

  useEffect(() => {
    getAuditLog(projectId)
      .then((e) => {
        // Sort newest first
        e.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setEntries(e);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load audit log");
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const actions = Array.from(new Set(entries.map((e) => e.action)));

  const filtered = entries.filter((entry) => {
    if (filterAction !== "all" && entry.action !== filterAction) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const detailsStr = entry.details ? JSON.stringify(entry.details).toLowerCase() : "";
      return (
        entry.actor.toLowerCase().includes(q) ||
        entry.action.toLowerCase().includes(q) ||
        (entry.entity_type ?? "").toLowerCase().includes(q) ||
        detailsStr.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#1A1A18]">Audit Log</h2>
          <p className="text-xs text-[#1A1A18]/70 mt-1">
            Complete history of all project actions
          </p>
        </div>
        <Badge className="bg-[#1A1A18]/5 text-[#1A1A18]/70 text-xs">
          {entries.length} events
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#1A1A18]/45" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events..."
            className="pl-9 h-8 text-xs bg-white border-[rgba(26,26,24,0.08)] text-[#1A1A18] placeholder:text-[#1A1A18]/45"
          />
        </div>
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-36 h-8 text-xs bg-white border-[rgba(26,26,24,0.08)] text-[#1A1A18]">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[rgba(26,26,24,0.08)]">
            <SelectItem value="all" className="text-xs text-[#1A1A18]">
              All actions
            </SelectItem>
            {actions.map((action) => (
              <SelectItem key={action} value={action} className="text-xs text-[#1A1A18]">
                {action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-[#D4583A]/20 bg-[#D4583A]/5 px-4 py-3 mb-4">
          <p className="text-sm text-[#D4583A]">{error}</p>
          <button className="text-xs text-[#D4583A] hover:text-[#B84832] underline" onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {loading ? (
        <Card className="bg-white border-[rgba(26,26,24,0.08)] animate-pulse">
          <CardContent className="p-5 h-96" />
        </Card>
      ) : entries.length === 0 ? (
        <Card className="bg-white border-[rgba(26,26,24,0.08)] border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ScrollText className="size-8 text-[#1A1A18]/35 mb-3" />
            <p className="text-sm text-[#1A1A18]/70">No audit events recorded</p>
            <p className="text-xs text-[#1A1A18]/45 mt-1">
              Events will appear as agents take actions
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-white border-[rgba(26,26,24,0.08)] overflow-hidden">
          <CardContent className="p-0">
            {/* Table header */}
            <div className="grid grid-cols-[140px_100px_90px_100px_1fr] gap-3 px-4 py-2.5 border-b border-[rgba(26,26,24,0.08)] bg-[#F4F2EF]">
              <span className="text-[10px] font-medium text-[#1A1A18]/55 uppercase tracking-wider">
                Timestamp
              </span>
              <span className="text-[10px] font-medium text-[#1A1A18]/55 uppercase tracking-wider">
                Actor
              </span>
              <span className="text-[10px] font-medium text-[#1A1A18]/55 uppercase tracking-wider">
                Action
              </span>
              <span className="text-[10px] font-medium text-[#1A1A18]/55 uppercase tracking-wider">
                Entity
              </span>
              <span className="text-[10px] font-medium text-[#1A1A18]/55 uppercase tracking-wider">
                Details
              </span>
            </div>

            <ScrollArea className="max-h-[calc(100vh-320px)]">
              {filtered.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-xs text-[#1A1A18]/55">
                    No events match the filter
                  </p>
                </div>
              ) : (
                <div>
                  {filtered.map((entry) => (
                    <div
                      key={entry.id}
                      className="grid grid-cols-[140px_100px_90px_100px_1fr] gap-3 px-4 py-2.5 border-b border-[rgba(26,26,24,0.06)] hover:bg-[#F4F2EF]/50 transition-colors"
                    >
                      <span className="text-[11px] text-[#1A1A18]/55 font-mono">
                        {new Date(entry.created_at).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <span className="text-xs text-[#1A1A18]/70 truncate">
                        {formatRole(entry.actor)}
                      </span>
                      <div>
                        <Badge
                          className={`text-[9px] px-1.5 py-0 ${
                            ACTION_STYLES[entry.action] ??
                            "bg-[#1A1A18]/5 text-[#1A1A18]/70"
                          }`}
                        >
                          {entry.action}
                        </Badge>
                      </div>
                      <span className="text-xs text-[#1A1A18]/70 truncate">
                        {entry.entity_type ?? "—"}
                        {entry.entity_id && (
                          <span className="text-[#1A1A18]/45">
                            #{entry.entity_id.slice(0, 6)}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-[#1A1A18]/70 truncate" title={entry.details ? JSON.stringify(entry.details) : ""}>
                        {entry.details
                          ? Object.entries(entry.details)
                              .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
                              .join(", ")
                              .slice(0, 200)
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
