"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  listGates,
  getGateArtifact,
  reviewGate,
  type Gate,
  type GateArtifact,
  type AgentMessage,
} from "@/lib/api";
import { MessageCard } from "@/components/agent-cards/MessageCard";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-[#B8860B]/10 text-[#B8860B]",
  approved: "bg-[#2D6A4F]/10 text-[#2D6A4F]",
  rejected: "bg-[#D4583A]/10 text-[#D4583A]",
};

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function ApprovalsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [gates, setGates] = useState<Gate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Record<string, GateArtifact>>({});
  const [loadingArtifact, setLoadingArtifact] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);

  const fetchGates = useCallback(() => {
    listGates(projectId)
      .then((g) => {
        // Sort: pending first, then by creation date desc
        g.sort((a, b) => {
          if (a.status === "pending" && b.status !== "pending") return -1;
          if (a.status !== "pending" && b.status === "pending") return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        setGates(g);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load gates");
        setGates([]);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    fetchGates();
  }, [fetchGates]);

  async function toggleExpand(gateId: string) {
    if (expandedId === gateId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(gateId);

    // Load artifact if not cached
    if (!artifacts[gateId]) {
      setLoadingArtifact(gateId);
      try {
        const artifact = await getGateArtifact(projectId, gateId);
        setArtifacts((prev) => ({ ...prev, [gateId]: artifact }));
      } catch {
        // Artifact may not exist yet
      } finally {
        setLoadingArtifact(null);
      }
    }
  }

  async function handleReview(gateId: string, approved: boolean) {
    setReviewing(gateId);
    try {
      await reviewGate(projectId, gateId, {
        approved,
        notes: notes[gateId] || undefined,
      });
      fetchGates();
      setExpandedId(null);
      setNotes((prev) => {
        const copy = { ...prev };
        delete copy[gateId];
        return copy;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed. Please try again.");
    } finally {
      setReviewing(null);
    }
  }

  const pendingCount = gates.filter((g) => g.status === "pending").length;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#1A1A18]">
            Approval Center
          </h2>
          <p className="text-xs text-[#1A1A18]/70 mt-1">
            Review and approve agent gate submissions
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge className="bg-[#B8860B]/10 text-[#B8860B] text-xs">
            {pendingCount} pending
          </Badge>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center justify-between rounded-md border border-[#D4583A]/20 bg-[#D4583A]/5 px-4 py-3 mb-4">
          <p className="text-sm text-[#D4583A]">{error}</p>
          <button
            className="text-xs text-[#D4583A] hover:text-[#B84832] underline"
            onClick={fetchGates}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card
              key={i}
              className="bg-white border-[rgba(26,26,24,0.08)] animate-pulse"
            >
              <CardContent className="p-5 h-20" />
            </Card>
          ))}
        </div>
      ) : gates.length === 0 ? (
        <Card className="bg-white border-[rgba(26,26,24,0.08)] border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck className="size-8 text-[#1A1A18]/35 mb-3" />
            <p className="text-sm text-[#1A1A18]/70">No gates submitted yet</p>
            <p className="text-xs text-[#1A1A18]/45 mt-1">
              Gates appear here when agents reach approval checkpoints
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {gates.map((gate) => {
            const isExpanded = expandedId === gate.id;
            const artifact = artifacts[gate.id];
            const isPending = gate.status === "pending";

            return (
              <Card
                key={gate.id}
                className={`transition-colors ${
                  isPending
                    ? "bg-white border-[rgba(26,26,24,0.08)] border-l-2 border-l-[#B8860B]"
                    : "bg-white border-[rgba(26,26,24,0.08)]"
                }`}
              >
                <CardContent className="p-0">
                  {/* Gate header */}
                  <button
                    onClick={() => toggleExpand(gate.id)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-[#F4F2EF]/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ShieldCheck
                        className={`size-4 shrink-0 ${
                          isPending
                            ? "text-[#B8860B]"
                            : gate.status === "approved"
                              ? "text-[#2D6A4F]"
                              : "text-[#D4583A]"
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#1A1A18] truncate">
                            {gate.gate_name}
                          </span>
                          <Badge
                            className={`text-[10px] px-1.5 py-0 ${
                              STATUS_STYLES[gate.status] ?? STATUS_STYLES.pending
                            }`}
                          >
                            {gate.status}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-[#1A1A18]/55 mt-0.5">
                          Submitted by {formatRole(gate.submitted_by ?? "system")} &middot;{" "}
                          {new Date(gate.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="size-4 text-[#1A1A18]/45 shrink-0" />
                    ) : (
                      <ChevronDown className="size-4 text-[#1A1A18]/45 shrink-0" />
                    )}
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <>
                      <Separator className="bg-[rgba(26,26,24,0.08)]" />
                      <div className="p-4 space-y-4 bg-white">
                        {/* Artifact preview */}
                        <div>
                          <p className="text-xs font-medium text-[#1A1A18]/70 mb-2">
                            Artifact ({gate.artifact_type ?? "document"})
                          </p>
                          {loadingArtifact === gate.id ? (
                            <div className="flex items-center gap-2 text-xs text-[#1A1A18]/55 py-4">
                              <Loader2 className="size-3 animate-spin" />
                              Loading artifact...
                            </div>
                          ) : artifact?.artifact ? (
                            <ScrollArea className="max-h-80 rounded-md border border-[rgba(26,26,24,0.08)] bg-[#F4F2EF]">
                              <div className="p-4">
                                <p className="text-[10px] font-medium text-[#1A1A18]/55 mb-2">
                                  {artifact.artifact.title} — by {formatRole(artifact.artifact.created_by)}
                                </p>
                                <MessageCard
                                  message={
                                    {
                                      content: artifact.artifact.content,
                                    } as AgentMessage
                                  }
                                />
                              </div>
                            </ScrollArea>
                          ) : (
                            <p className="text-xs text-[#1A1A18]/45 py-2">
                              No artifact content available
                            </p>
                          )}
                        </div>

                        {/* Notes from previous review */}
                        {gate.review_notes && (
                          <div>
                            <p className="text-xs font-medium text-[#1A1A18]/70 mb-1">
                              Review Notes
                            </p>
                            <p className="text-xs text-[#1A1A18]/70 bg-[#F4F2EF] rounded p-3">
                              {gate.review_notes}
                            </p>
                          </div>
                        )}

                        {/* Review actions for pending gates */}
                        {isPending && (
                          <div className="space-y-3 pt-2">
                            <div>
                              <label className="text-xs font-medium text-[#1A1A18]/70 mb-1.5 block">
                                Notes (required for rejection)
                              </label>
                              <Textarea
                                value={notes[gate.id] ?? ""}
                                onChange={(e) =>
                                  setNotes((prev) => ({
                                    ...prev,
                                    [gate.id]: e.target.value,
                                  }))
                                }
                                placeholder="Add review notes..."
                                rows={3}
                                className="bg-white border-[rgba(26,26,24,0.08)] text-[#1A1A18] text-xs resize-none placeholder:text-[#1A1A18]/45"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleReview(gate.id, true)}
                                disabled={reviewing === gate.id}
                                className="gap-1.5 bg-[#2D6A4F] hover:bg-[#245A42] text-white"
                              >
                                {reviewing === gate.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Check className="size-3" />
                                )}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleReview(gate.id, false)}
                                disabled={
                                  reviewing === gate.id ||
                                  !(notes[gate.id] ?? "").trim()
                                }
                                className="gap-1.5 bg-[#D4583A] hover:bg-[#B84832] text-white"
                              >
                                {reviewing === gate.id ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <X className="size-3" />
                                )}
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
