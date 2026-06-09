import { Badge } from "@/components/ui/badge";
import { RawJsonToggle } from "./RawJsonToggle";

export function DiscoveryCard({ data }: { data: Record<string, unknown> }) {
  const questions = (data.clarifying_questions as string[]) ?? [];
  const personas = (data.user_personas ?? data.initial_user_personas) as Record<string, unknown>[] ?? [];
  const metrics = (data.recommended_success_metrics ?? data.success_metrics) as unknown;
  const competitive = data.competitive_analysis;

  return (
    <div className="rounded-md border border-[#D4583A]/20 bg-[#FAF9F7] p-3 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-[#D4583A]/10 text-[#D4583A] text-[10px]">Discovery</Badge>
        <span className="text-[10px] text-[#1A1A18]/55">{personas.length} personas, {questions.length} questions</span>
      </div>

      {personas.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">User Personas</p>
          <div className="flex flex-wrap gap-1">
            {personas.map((p, i) => (
              <Badge key={i} className="bg-[#7B4F9D]/10 text-[#7B4F9D] text-[10px]">
                {(p.persona_name as string) ?? (p.name as string) ?? `Persona ${i + 1}`}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {questions.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Key Questions</p>
          <ul className="list-disc list-inside text-[#1A1A18]/80 space-y-0.5">
            {questions.slice(0, 5).map((q, i) => <li key={i}>{q}</li>)}
            {questions.length > 5 && <li className="text-[#1A1A18]/55">+{questions.length - 5} more</li>}
          </ul>
        </div>
      )}

      {competitive != null && typeof competitive === "object" ? (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Competitive Analysis</p>
          <p className="text-[#1A1A18]/80">{((competitive as Record<string, unknown>).competitors as string[])?.join(", ") ?? JSON.stringify(competitive).slice(0, 200)}</p>
        </div>
      ) : null}

      {Array.isArray(metrics) && metrics.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Success Metrics</p>
          <div className="flex flex-wrap gap-1">
            {(metrics as string[]).slice(0, 5).map((m, i) => (
              <Badge key={i} className="bg-[#2D6A4F]/10 text-[#2D6A4F] text-[10px]">{typeof m === "string" ? m : JSON.stringify(m)}</Badge>
            ))}
          </div>
        </div>
      )}

      <RawJsonToggle data={data} />
    </div>
  );
}
