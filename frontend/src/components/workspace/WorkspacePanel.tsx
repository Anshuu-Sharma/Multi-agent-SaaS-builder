"use client";

import { useEffect, useState, useCallback } from "react";
import { Code, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listWorkspaceFiles, type WorkspaceFile } from "@/lib/api";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import { FileTree } from "./FileTree";
import { CodeEditor } from "./CodeEditor";
import { PreviewPanel } from "./PreviewPanel";

type ViewMode = "editor" | "preview";

export function WorkspacePanel({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("editor");
  const [loading, setLoading] = useState(true);

  const fetchFiles = useCallback(() => {
    listWorkspaceFiles(projectId).then(setFiles).catch(() => setFiles([])).finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  useWebSocket({ projectId, onEvent: (evt: WSEvent) => { if (evt.type === "agent.output") setTimeout(fetchFiles, 1000); } });

  if (loading) return <div className="flex items-center justify-center h-full text-xs text-[#1A1A18]/45">Loading workspace...</div>;

  return (
    <div className="flex flex-col h-full border border-[#1A1A18]/10 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between px-2 py-1 border-b border-[#1A1A18]/10 bg-[#FAF9F7] shrink-0">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setViewMode("editor")} className={`h-6 px-2 text-[10px] gap-1 ${viewMode === "editor" ? "bg-[#1A1A18]/10" : ""}`}><Code className="size-3" /> Code</Button>
          <Button size="sm" variant="ghost" onClick={() => setViewMode("preview")} className={`h-6 px-2 text-[10px] gap-1 ${viewMode === "preview" ? "bg-[#1A1A18]/10" : ""}`}><Eye className="size-3" /> Preview</Button>
        </div>
        <Button size="sm" variant="ghost" onClick={fetchFiles} className="h-6 px-2 text-[10px]"><RefreshCw className="size-3" /></Button>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-48 border-r border-[#1A1A18]/10 overflow-y-auto shrink-0 bg-[#FAF9F7]">
          <FileTree files={files} selectedPath={selectedFile} onSelectFile={(p) => { setSelectedFile(p); setViewMode("editor"); }} />
        </div>
        <div className="flex-1 min-w-0">
          {viewMode === "editor" ? <CodeEditor projectId={projectId} filePath={selectedFile} /> : <PreviewPanel projectId={projectId} files={files} />}
        </div>
      </div>
    </div>
  );
}
