"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Users,
  CheckSquare,
  Lightbulb,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { listMeetings, type Meeting } from "@/lib/api";

const MEETING_TYPE_STYLES: Record<string, string> = {
  standup: "bg-[#3A5FCD]/10 text-[#3A5FCD]",
  planning: "bg-[#7B4F9D]/10 text-[#7B4F9D]",
  review: "bg-[#B8860B]/10 text-[#B8860B]",
  retrospective: "bg-[#2D6A4F]/10 text-[#2D6A4F]",
};

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function MeetingsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    listMeetings(projectId)
      .then((m) => {
        // Sort by date descending
        m.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setMeetings(m);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load meetings");
        setMeetings([]);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#1A1A18]">Meetings</h2>
        <p className="text-xs text-[#1A1A18]/70 mt-1">
          Agent meeting transcripts, decisions, and action items
        </p>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-[#D4583A]/20 bg-[#D4583A]/5 px-4 py-3 mb-4">
          <p className="text-sm text-[#D4583A]">{error}</p>
          <button className="text-xs text-[#D4583A] hover:text-[#B84832] underline" onClick={() => window.location.reload()}>Retry</button>
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
      ) : meetings.length === 0 ? (
        <Card className="bg-white border-[rgba(26,26,24,0.08)] border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="size-8 text-[#1A1A18]/35 mb-3" />
            <p className="text-sm text-[#1A1A18]/70">No meetings recorded</p>
            <p className="text-xs text-[#1A1A18]/45 mt-1">
              Meetings appear when agents collaborate on decisions
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => {
            const isExpanded = expandedId === meeting.id;
            return (
              <Card
                key={meeting.id}
                className="bg-white border-[rgba(26,26,24,0.08)]"
              >
                <CardContent className="p-0">
                  {/* Meeting header */}
                  <button
                    onClick={() =>
                      setExpandedId(isExpanded ? null : meeting.id)
                    }
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-[#F4F2EF]/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MessageSquare className="size-4 text-[#1A1A18]/55 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#1A1A18] capitalize">
                            {meeting.type} Meeting
                          </span>
                          <Badge
                            className={`text-[10px] px-1.5 py-0 ${
                              MEETING_TYPE_STYLES[meeting.type] ??
                              MEETING_TYPE_STYLES.standup
                            }`}
                          >
                            {meeting.type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Users className="size-3 text-[#1A1A18]/45" />
                          <span className="text-[11px] text-[#1A1A18]/70">
                            {meeting.participants
                              .map((p) => formatRole(p))
                              .join(", ")}
                          </span>
                          <span className="text-[10px] text-[#1A1A18]/45">
                            &middot;{" "}
                            {new Date(meeting.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {meeting.decisions.length > 0 && (
                        <Badge className="text-[9px] px-1.5 py-0 bg-[#2D6A4F]/10 text-[#2D6A4F]">
                          {meeting.decisions.length} decisions
                        </Badge>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="size-4 text-[#1A1A18]/45" />
                      ) : (
                        <ChevronDown className="size-4 text-[#1A1A18]/45" />
                      )}
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <>
                      <Separator className="bg-[rgba(26,26,24,0.08)]" />
                      <div className="p-4 space-y-4">
                        {/* Decisions */}
                        {meeting.decisions.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <Lightbulb className="size-3.5 text-[#2D6A4F]" />
                              <p className="text-xs font-medium text-[#1A1A18]/70">
                                Decisions
                              </p>
                            </div>
                            <ul className="space-y-1.5">
                              {meeting.decisions.map((d, i) => (
                                <li
                                  key={i}
                                  className="text-xs text-[#1A1A18]/70 bg-[#2D6A4F]/5 border border-[#2D6A4F]/10 rounded px-3 py-2"
                                >
                                  {d}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Action items */}
                        {meeting.action_items.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <CheckSquare className="size-3.5 text-[#3A5FCD]" />
                              <p className="text-xs font-medium text-[#1A1A18]/70">
                                Action Items
                              </p>
                            </div>
                            <ul className="space-y-1.5">
                              {meeting.action_items.map((item, i) => (
                                <li
                                  key={i}
                                  className="text-xs text-[#1A1A18]/70 bg-[#3A5FCD]/5 border border-[#3A5FCD]/10 rounded px-3 py-2"
                                >
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Transcript */}
                        {meeting.transcript && (
                          <div>
                            <p className="text-xs font-medium text-[#1A1A18]/70 mb-2">
                              Transcript
                            </p>
                            <ScrollArea className="max-h-64 rounded-md border border-[rgba(26,26,24,0.08)] bg-[#F4F2EF]">
                              <pre className="p-4 text-xs text-[#1A1A18]/80 whitespace-pre-wrap font-mono">
                                {meeting.transcript}
                              </pre>
                            </ScrollArea>
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
