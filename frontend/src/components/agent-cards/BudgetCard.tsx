import { Badge } from "@/components/ui/badge";
import { RawJsonToggle } from "./RawJsonToggle";

export function BudgetCard({ data }: { data: Record<string, unknown> }) {
  const total = (data.total_estimate_cents as number) ?? 0;
  const breakdown = (data.breakdown as Record<string, number>) ?? {};
  const recommendations = (data.recommendations as string[]) ?? [];

  return (
    <div className="rounded-md border border-[#B8860B]/20 bg-[#FAF9F7] p-3 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-[#B8860B]/10 text-[#B8860B] text-[10px]">Budget Estimate</Badge>
        <span className="text-sm font-semibold text-[#1A1A18]">${(total / 100).toFixed(2)}</span>
      </div>
      {Object.keys(breakdown).length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Breakdown</p>
          <div className="space-y-0.5">
            {Object.entries(breakdown).map(([category, cents]) => (
              <div key={category} className="flex justify-between"><span className="text-[#1A1A18]/70 capitalize">{category.replace("_", " ")}</span><span className="text-[#1A1A18]/70 font-medium">${(cents / 100).toFixed(2)}</span></div>
            ))}
          </div>
        </div>
      )}
      {recommendations.length > 0 && (
        <div><p className="font-medium text-[#1A1A18]/70 mb-1">Recommendations</p><ul className="list-disc list-inside text-[#1A1A18]/80 space-y-0.5">{recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul></div>
      )}
      <RawJsonToggle data={data} />
    </div>
  );
}
