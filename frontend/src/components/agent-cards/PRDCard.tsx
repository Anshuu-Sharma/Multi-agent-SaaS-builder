"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RawJsonToggle } from "./RawJsonToggle";

const PRIORITY_COLORS: Record<string, string> = {
  "must-have": "bg-[#D4583A]/10 text-[#D4583A]",
  "should-have": "bg-[#B8860B]/10 text-[#B8860B]",
  "nice-to-have": "bg-[#78766F]/10 text-[#78766F]",
  "must_have": "bg-[#D4583A]/10 text-[#D4583A]",
  "should_have": "bg-[#B8860B]/10 text-[#B8860B]",
  "could_have": "bg-[#78766F]/10 text-[#78766F]",
};

export function PRDCard({ data }: { data: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const vision = (data.product_vision as string) ?? "";
  const goals = (data.goals as string[]) ?? [];
  const features = (data.features as Record<string, unknown>[]) ?? [];
  const stories = (data.user_stories as Record<string, unknown>[]) ?? [];
  const nfrs = (data.non_functional_requirements as string[]) ?? [];
  const prioritization = data.feature_prioritization as Record<string, unknown> | undefined;
  const mustHave = prioritization?.must_have as Record<string, unknown>[] ?? features.filter((f) => f.priority === "must-have" || f.priority === "must_have");
  const shouldHave = prioritization?.should_have as Record<string, unknown>[] ?? features.filter((f) => f.priority === "should-have" || f.priority === "should_have");
  const couldHave = prioritization?.could_have as Record<string, unknown>[] ?? features.filter((f) => f.priority === "nice-to-have" || f.priority === "could_have");

  const sections = [
    { key: "must", label: "Must Have", items: mustHave, color: PRIORITY_COLORS["must-have"] },
    { key: "should", label: "Should Have", items: shouldHave, color: PRIORITY_COLORS["should-have"] },
    { key: "could", label: "Could Have", items: couldHave, color: PRIORITY_COLORS["nice-to-have"] },
  ];

  return (
    <div className="rounded-md border border-[#D4583A]/20 bg-[#FAF9F7] p-3 text-xs space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-[#D4583A]/10 text-[#D4583A] text-[10px]">PRD</Badge>
        <span className="text-[10px] text-[#1A1A18]/55">{features.length || (mustHave.length + shouldHave.length + couldHave.length)} features, {stories.length} stories</span>
      </div>
      {vision && <p className="text-[#1A1A18]/70 italic">{vision}</p>}
      {goals.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Goals</p>
          <ul className="list-disc list-inside text-[#1A1A18]/80 space-y-0.5">{goals.slice(0, 4).map((g, i) => <li key={i}>{g}</li>)}</ul>
        </div>
      )}
      {sections.map(({ key, label, items, color }) => items.length > 0 ? (
        <div key={key}>
          <button onClick={() => setExpanded(expanded === key ? null : key)} className="flex items-center gap-2 w-full text-left">
            <span className="text-[10px]">{expanded === key ? "\u25BC" : "\u25B6"}</span>
            <Badge className={`${color} text-[10px]`}>{label}</Badge>
            <span className="text-[10px] text-[#1A1A18]/55">({items.length})</span>
          </button>
          {expanded === key && (
            <ul className="mt-1 ml-4 space-y-1 text-[#1A1A18]/80">
              {items.map((f, i) => (
                <li key={i} className="flex items-start gap-1">
                  <span className="text-[#1A1A18]/45 mt-0.5">-</span>
                  <span><strong>{(f.name ?? f.feature_name ?? `Feature ${i + 1}`) as string}</strong>{typeof f.description === "string" && f.description ? <span className="text-[#1A1A18]/55"> — {f.description}</span> : null}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null)}
      {nfrs.length > 0 && (
        <div>
          <p className="font-medium text-[#1A1A18]/70 mb-1">Non-Functional Requirements</p>
          <div className="flex flex-wrap gap-1">{nfrs.map((n, i) => <Badge key={i} className="bg-[#3A5FCD]/10 text-[#3A5FCD] text-[10px]">{n}</Badge>)}</div>
        </div>
      )}
      <RawJsonToggle data={data} />
    </div>
  );
}
