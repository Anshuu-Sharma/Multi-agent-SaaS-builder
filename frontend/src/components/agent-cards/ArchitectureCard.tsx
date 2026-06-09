"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RawJsonToggle } from "./RawJsonToggle";

export function ArchitectureCard({ data }: { data: Record<string, unknown> }) {
  const [showDesign, setShowDesign] = useState(false);
  const techStack = (data.tech_stack as Record<string, string>) ?? {};
  const apiDesign = (data.api_design as Record<string, unknown>[]) ?? [];
  const risks = (data.technical_risks as Record<string, unknown>[]) ?? [];
  const systemDesign = (data.system_design as string) ?? "";

  return (
    <div className="rounded-md border border-[#2D6A4F]/20 bg-[#FAF9F7] p-3 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-[#2D6A4F]/10 text-[#2D6A4F] text-[10px]">Architecture</Badge>
        <span className="text-[10px] text-[#1A1A18]/55">{Object.keys(techStack).length} stack items, {apiDesign.length} endpoints</span>
      </div>
      {Object.keys(techStack).length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Tech Stack</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            {Object.entries(techStack).map(([k, v]) => (
              <div key={k} className="flex justify-between"><span className="text-[#1A1A18]/70">{k}:</span><span className="text-[#1A1A18]/70 font-medium">{v}</span></div>
            ))}
          </div>
        </div>
      )}
      {apiDesign.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">API Endpoints ({apiDesign.length})</p>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {apiDesign.map((ep, i) => (
              <div key={i} className="flex items-center gap-2">
                <Badge className="bg-[#3A5FCD]/10 text-[#3A5FCD] text-[9px] font-mono px-1">{ep.method as string}</Badge>
                <span className="font-mono text-[#1A1A18]/80">{ep.path as string}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {systemDesign && (
        <div>
          <button onClick={() => setShowDesign(!showDesign)} className="text-[10px] text-[#3A5FCD] hover:underline">{showDesign ? "Hide" : "View"} System Design</button>
          {showDesign && <pre className="mt-1 p-2 rounded bg-[#1A1A18]/5 overflow-auto max-h-40 text-[10px] text-[#1A1A18]/80 whitespace-pre-wrap">{systemDesign}</pre>}
        </div>
      )}
      {risks.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Technical Risks</p>
          {risks.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5 mb-0.5">
              <Badge className={`text-[9px] px-1 ${r.severity === "high" ? "bg-[#D4583A]/10 text-[#D4583A]" : r.severity === "medium" ? "bg-[#B8860B]/10 text-[#B8860B]" : "bg-[#78766F]/10 text-[#78766F]"}`}>{r.severity as string}</Badge>
              <span className="text-[#1A1A18]/80">{r.risk as string}</span>
            </div>
          ))}
        </div>
      )}
      <RawJsonToggle data={data} />
    </div>
  );
}
