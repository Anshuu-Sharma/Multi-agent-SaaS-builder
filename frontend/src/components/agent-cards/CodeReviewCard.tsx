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
    <div className={`rounded-md border p-3 text-xs space-y-3 ${approved ? "border-[#2D6A4F]/20 bg-[#2D6A4F]/5" : "border-[#D4583A]/20 bg-[#D4583A]/5"}`}>
      <div className="flex items-center gap-2">
        <Badge className={`text-[10px] ${approved ? "bg-[#2D6A4F]/10 text-[#2D6A4F]" : "bg-[#D4583A]/10 text-[#D4583A]"}`}>{approved ? "Approved" : "Changes Requested"}</Badge>
        <span className="text-[10px] text-[#1A1A18]/55">{comments.length} comments</span>
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
        <div><p className="font-medium text-[#D4583A]/70 mb-1">Required Changes</p><ul className="list-disc list-inside text-[#1A1A18]/80 space-y-0.5">{requiredChanges.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
      )}
      <RawJsonToggle data={data} />
    </div>
  );
}
