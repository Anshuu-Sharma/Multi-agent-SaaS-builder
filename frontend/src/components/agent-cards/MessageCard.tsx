"use client";

import { useState } from "react";
import type { AgentMessage } from "@/lib/api";
import { DiscoveryCard } from "./DiscoveryCard";
import { PRDCard } from "./PRDCard";
import { ArchitectureCard } from "./ArchitectureCard";
import { CodeOutputCard } from "./CodeOutputCard";
import { CodeReviewCard } from "./CodeReviewCard";
import { QAReportCard } from "./QAReportCard";
import { BudgetCard } from "./BudgetCard";

type ParsedOutput = { type: string; data: Record<string, unknown> };

function detectOutputType(content: string): ParsedOutput | null {
  try {
    const data = JSON.parse(content);
    if (typeof data !== "object" || data === null) return null;
    if ("files" in data && "tests" in data && "summary" in data) return { type: "code_output", data };
    if ("approved" in data && "comments" in data) return { type: "code_review", data };
    if ("tests_run" in data && "bugs_found" in data) return { type: "qa_report", data };
    if ("feature_prioritization" in data || ("product_vision" in data && "features" in data)) return { type: "prd", data };
    if ("tech_stack" in data && ("system_design" in data || "api_design" in data)) return { type: "architecture", data };
    if ("clarifying_questions" in data && ("user_personas" in data || "initial_user_personas" in data)) return { type: "discovery", data };
    if ("total_estimate_cents" in data || ("breakdown" in data && "assumptions" in data)) return { type: "budget", data };
    return { type: "generic_json", data };
  } catch { return null; }
}

export function MessageCard({ message }: { message: AgentMessage }) {
  const parsed = detectOutputType(message.content);
  if (!parsed) return <p className="text-xs text-[#1A1A18]/70 whitespace-pre-wrap break-words">{message.content}</p>;

  switch (parsed.type) {
    case "discovery": return <DiscoveryCard data={parsed.data} />;
    case "prd": return <PRDCard data={parsed.data} />;
    case "architecture": return <ArchitectureCard data={parsed.data} />;
    case "code_output": return <CodeOutputCard data={parsed.data} />;
    case "code_review": return <CodeReviewCard data={parsed.data} />;
    case "qa_report": return <QAReportCard data={parsed.data} />;
    case "budget": return <BudgetCard data={parsed.data} />;
    default: return <GenericJsonCard data={parsed.data} />;
  }
}

function GenericJsonCard({ data }: { data: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const keys = Object.keys(data);
  return (
    <div className="rounded-md border border-[#1A1A18]/10 bg-[#FAF9F7] p-3 text-xs">
      <p className="text-[#1A1A18]/80 mb-2">Structured output with {keys.length} fields: {keys.slice(0, 5).join(", ")}{keys.length > 5 && "..."}</p>
      <button onClick={() => setExpanded(!expanded)} className="text-[10px] text-[#3A5FCD] hover:underline">{expanded ? "Hide JSON" : "View JSON"}</button>
      {expanded && <pre className="mt-2 p-2 rounded bg-[#1A1A18]/5 overflow-auto max-h-60 text-[10px] text-[#1A1A18]/70">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
