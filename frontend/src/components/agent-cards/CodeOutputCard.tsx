"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RawJsonToggle } from "./RawJsonToggle";

export function CodeOutputCard({ data }: { data: Record<string, unknown> }) {
  const [selectedFile, setSelectedFile] = useState<number | null>(null);
  const files = (data.files as Record<string, unknown>[]) ?? [];
  const tests = (data.tests as Record<string, unknown>[]) ?? [];
  const summary = (data.summary as string) ?? "";
  const blockers = (data.blockers as string[]) ?? [];
  const nextSteps = (data.next_steps as string[]) ?? [];
  const allFiles: (Record<string, unknown> & { isTest: boolean })[] = [
    ...files.map((f) => ({ ...f, isTest: false })),
    ...tests.map((f) => ({ ...f, isTest: true })),
  ];

  return (
    <div className="rounded-md border border-[#3A5FCD]/20 bg-[#FAF9F7] p-3 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-[#3A5FCD]/10 text-[#3A5FCD] text-[10px]">Code Output</Badge>
        <span className="text-[10px] text-[#1A1A18]/55">{files.length} files, {tests.length} tests</span>
      </div>
      {summary && <p className="text-[#1A1A18]/70">{summary}</p>}
      {allFiles.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Files</p>
          <div className="space-y-0.5">
            {allFiles.map((f, i) => (
              <div key={i}>
                <button onClick={() => setSelectedFile(selectedFile === i ? null : i)} className="flex items-center gap-2 w-full text-left hover:bg-[#1A1A18]/5 rounded px-1 py-0.5">
                  <span className="text-[10px]">{selectedFile === i ? "\u25BC" : "\u25B6"}</span>
                  <span className="font-mono text-[#1A1A18]/80">{f.path as string}</span>
                  <Badge className={`text-[9px] px-1 ${f.isTest ? "bg-[#B8860B]/10 text-[#B8860B]" : (f.operation as string) === "modify" ? "bg-[#D97706]/10 text-[#D97706]" : "bg-[#2D6A4F]/10 text-[#2D6A4F]"}`}>{f.isTest ? "test" : (f.operation as string) ?? "create"}</Badge>
                </button>
                {selectedFile === i && (
                  <pre className="mt-1 ml-4 p-2 rounded bg-[#1A1A18] text-[#E0E0E0] overflow-auto max-h-60 text-[10px] font-mono leading-relaxed">{(f.content as string)?.slice(0, 3000)}{((f.content as string)?.length ?? 0) > 3000 && "\n\n... truncated"}</pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {blockers.length > 0 && (
        <div><p className="font-medium text-[#D4583A]/70 mb-1">Blockers</p><ul className="list-disc list-inside text-[#D4583A]/60 space-y-0.5">{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul></div>
      )}
      {nextSteps.length > 0 && (
        <div><p className="font-medium text-[#1A1A18]/70 mb-1">Next Steps</p><ul className="list-disc list-inside text-[#1A1A18]/80 space-y-0.5">{nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
      )}
      <RawJsonToggle data={data} />
    </div>
  );
}
