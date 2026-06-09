"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { FileText, ChevronDown, ChevronRight, Clock, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listDocuments, type DocumentArtifact } from "@/lib/api";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";

import { PRDCard } from "@/components/agent-cards/PRDCard";
import { ArchitectureCard } from "@/components/agent-cards/ArchitectureCard";
import { BudgetCard } from "@/components/agent-cards/BudgetCard";
import { DiscoveryCard } from "@/components/agent-cards/DiscoveryCard";
import { CodeOutputCard } from "@/components/agent-cards/CodeOutputCard";
import { QAReportCard } from "@/components/agent-cards/QAReportCard";

// ---------------------------------------------------------------------------
// Doc type display helpers
// ---------------------------------------------------------------------------

const DOC_TYPE_COLORS: Record<string, string> = {
  discovery: "bg-[#D4583A]/10 text-[#D4583A]",
  prd_creation: "bg-[#7B4F9D]/10 text-[#7B4F9D]",
  architecture: "bg-[#2D6A4F]/10 text-[#2D6A4F]",
  budget: "bg-[#B8860B]/10 text-[#B8860B]",
  development: "bg-[#3A5FCD]/10 text-[#3A5FCD]",
  code: "bg-[#3A5FCD]/10 text-[#3A5FCD]",
  qa_test: "bg-[#D97706]/10 text-[#D97706]",
  qa_testing: "bg-[#D97706]/10 text-[#D97706]",
  code_review: "bg-[#C74882]/10 text-[#C74882]",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  discovery: "Discovery",
  prd_creation: "PRD",
  architecture: "Architecture",
  budget: "Budget",
  development: "Development",
  code: "Code",
  qa_test: "QA Testing",
  qa_testing: "QA Testing",
  code_review: "Code Review",
};

function formatDocType(docType: string): string {
  return (
    DOC_TYPE_LABELS[docType] ??
    docType
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function docTypeColor(docType: string): string {
  return DOC_TYPE_COLORS[docType] ?? "bg-[#78766F]/10 text-[#78766F]";
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRole(role: string): string {
  return role
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Smart content renderer
// ---------------------------------------------------------------------------

function SmartContent({ doc }: { doc: DocumentArtifact }) {
  let parsed: Record<string, unknown> | null = null;
  try {
    const json = JSON.parse(doc.content);
    if (typeof json === "object" && json !== null && !Array.isArray(json)) {
      parsed = json as Record<string, unknown>;
    }
  } catch {
    // content is not JSON
  }

  if (parsed) {
    const dt = doc.doc_type;
    if (dt === "prd_creation") return <PRDCard data={parsed} />;
    if (dt === "architecture") return <ArchitectureCard data={parsed} />;
    if (dt === "budget") return <BudgetCard data={parsed} />;
    if (dt === "discovery") return <DiscoveryCard data={parsed} />;
    if (dt === "code" || dt === "development") return <CodeOutputCard data={parsed} />;
    if (dt === "qa_test" || dt === "qa_testing") return <QAReportCard data={parsed} />;
    // Fallback: render JSON pretty-printed
    return (
      <pre className="p-3 rounded-md bg-[#1A1A18]/[0.03] border border-[#1A1A18]/[0.06] text-[11px] text-[#1A1A18]/70 font-mono overflow-auto max-h-96 whitespace-pre-wrap">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    );
  }

  // Plain text fallback
  return (
    <pre className="p-3 rounded-md bg-[#1A1A18]/[0.03] border border-[#1A1A18]/[0.06] text-[11px] text-[#1A1A18]/70 font-mono overflow-auto max-h-96 whitespace-pre-wrap">
      {doc.content}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Document row (expandable)
// ---------------------------------------------------------------------------

function DocumentRow({
  doc,
  expanded,
  onToggle,
}: {
  doc: DocumentArtifact;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-[#1A1A18]/[0.06] last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#F4F2EF]/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="size-3.5 text-[#1A1A18]/40 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 text-[#1A1A18]/40 shrink-0" />
        )}

        <Badge className={`text-[9px] px-1.5 py-0 shrink-0 ${docTypeColor(doc.doc_type)}`}>
          {formatDocType(doc.doc_type)}
        </Badge>

        <span className="text-xs text-[#1A1A18] font-medium truncate flex-1">
          {doc.title}
        </span>

        <Badge className="bg-[#1A1A18]/5 text-[#1A1A18]/55 text-[9px] px-1.5 py-0 shrink-0">
          v{doc.version}
        </Badge>

        <span className="flex items-center gap-1 text-[10px] text-[#1A1A18]/45 shrink-0">
          <User className="size-3" />
          {formatRole(doc.created_by)}
        </span>

        <span className="flex items-center gap-1 text-[10px] text-[#1A1A18]/45 shrink-0">
          <Clock className="size-3" />
          {formatTimestamp(doc.created_at)}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 ml-7">
          <SmartContent doc={doc} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Group documents by doc_type
// ---------------------------------------------------------------------------

const TYPE_ORDER = [
  "discovery",
  "prd_creation",
  "architecture",
  "budget",
  "sprint_planning",
  "development",
  "code",
  "code_review",
  "qa_test",
  "qa_testing",
];

function groupByType(docs: DocumentArtifact[]): [string, DocumentArtifact[]][] {
  const map = new Map<string, DocumentArtifact[]>();
  for (const doc of docs) {
    const group = map.get(doc.doc_type) ?? [];
    group.push(doc);
    map.set(doc.doc_type, group);
  }

  // Sort groups by TYPE_ORDER, unknowns at end
  const entries = Array.from(map.entries());
  entries.sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a[0]);
    const bi = TYPE_ORDER.indexOf(b[0]);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocumentsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [documents, setDocuments] = useState<DocumentArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDocs = useCallback(() => {
    listDocuments(projectId)
      .then((docs) => {
        setDocuments(docs);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load documents");
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Re-fetch on agent output events
  const handleWSEvent = useCallback(
    (evt: WSEvent) => {
      if (evt.type === "agent.output") {
        fetchDocs();
      }
    },
    [fetchDocs]
  );

  useWebSocket({ projectId, onEvent: handleWSEvent });

  const groups = groupByType(documents);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-[#1A1A18]">
            Documents & Artifacts
          </h2>
          <p className="text-xs text-[#1A1A18]/70 mt-1">
            All generated documents and agent outputs
          </p>
        </div>
        <Badge className="bg-[#1A1A18]/5 text-[#1A1A18]/70 text-xs">
          {documents.length} document{documents.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between rounded-md border border-[#D4583A]/20 bg-[#D4583A]/5 px-4 py-3 mb-4">
          <p className="text-sm text-[#D4583A]">{error}</p>
          <button
            className="text-xs text-[#D4583A] hover:text-[#B84832] underline"
            onClick={fetchDocs}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-white border-[rgba(26,26,24,0.08)] shadow-none animate-pulse">
              <CardContent className="p-5 h-20" />
            </Card>
          ))}
        </div>
      ) : documents.length === 0 ? (
        /* Empty state */
        <Card className="bg-white border-[rgba(26,26,24,0.08)] border-dashed shadow-none">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="size-8 text-[#1A1A18]/35 mb-3" />
            <p className="text-sm text-[#1A1A18]/70">No documents yet</p>
            <p className="text-xs text-[#1A1A18]/45 mt-1">
              Documents will appear as agents produce artifacts
            </p>
          </CardContent>
        </Card>
      ) : (
        /* Grouped documents */
        <div className="space-y-5">
          {groups.map(([docType, docs]) => (
            <div key={docType}>
              <div className="flex items-center gap-2 mb-2">
                <Badge className={`text-[10px] px-2 py-0.5 ${docTypeColor(docType)}`}>
                  {formatDocType(docType)}
                </Badge>
                <span className="text-[10px] text-[#1A1A18]/45">
                  {docs.length} document{docs.length !== 1 ? "s" : ""}
                </span>
              </div>

              <Card className="bg-white border-[rgba(26,26,24,0.08)] shadow-none overflow-hidden">
                <CardContent className="p-0">
                  {docs.map((doc) => (
                    <DocumentRow
                      key={doc.id}
                      doc={doc}
                      expanded={expandedId === doc.id}
                      onToggle={() =>
                        setExpandedId((prev) => (prev === doc.id ? null : doc.id))
                      }
                    />
                  ))}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
