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
        <Badge className={`text-[10px] ${recommendation === "pass" ? "bg-[#2D6A4F]/10 text-[#2D6A4F]" : recommendation === "fail" ? "bg-[#D4583A]/10 text-[#D4583A]" : "bg-[#B8860B]/10 text-[#B8860B]"}`}>{recommendation || "pending"}</Badge>
      </div>
      <div className="flex gap-4">
        <div className="text-center"><p className="text-lg font-semibold text-[#2D6A4F]">{testsPassed}</p><p className="text-[10px] text-[#1A1A18]/55">passed</p></div>
        <div className="text-center"><p className="text-lg font-semibold text-[#D4583A]">{testsFailed}</p><p className="text-[10px] text-[#1A1A18]/55">failed</p></div>
        <div className="text-center"><p className="text-lg font-semibold text-[#1A1A18]/70">{passRate}%</p><p className="text-[10px] text-[#1A1A18]/55">pass rate</p></div>
      </div>
      {bugs.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Bugs Found ({bugs.length})</p>
          {bugs.map((b, i) => (
            <div key={i} className="flex items-start gap-1.5 mb-1">
              <Badge className={`text-[9px] px-1 shrink-0 ${b.severity === "critical" ? "bg-[#D4583A]/10 text-[#D4583A]" : b.severity === "high" ? "bg-[#D97706]/10 text-[#D97706]" : "bg-[#B8860B]/10 text-[#B8860B]"}`}>{b.severity as string}</Badge>
              <span className="text-[#1A1A18]/80">{b.title as string}</span>
            </div>
          ))}
        </div>
      )}
      {notes && <p className="text-[#1A1A18]/70 italic">{notes}</p>}
      <RawJsonToggle data={data} />
    </div>
  );
}
