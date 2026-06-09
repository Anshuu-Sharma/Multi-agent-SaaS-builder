"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { readWorkspaceFile } from "@/lib/api";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full text-xs text-[#1A1A18]/45">Loading editor...</div>,
});

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", json: "json", md: "markdown", css: "css", scss: "scss",
    html: "html", yml: "yaml", yaml: "yaml", sql: "sql", sh: "shell",
    toml: "toml", ini: "ini", env: "shell", txt: "plaintext",
  };
  return map[ext] ?? "plaintext";
}

export function CodeEditor({ projectId, filePath, onContentChange }: { projectId: string; filePath: string | null; onContentChange?: (path: string, content: string) => void; }) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filePath) { setContent(""); return; }
    setLoading(true);
    readWorkspaceFile(projectId, filePath)
      .then((f) => setContent(f.content))
      .catch(() => setContent(`// Failed to load ${filePath}`))
      .finally(() => setLoading(false));
  }, [projectId, filePath]);

  if (!filePath) return <div className="flex items-center justify-center h-full text-xs text-[#1A1A18]/45">Select a file to view</div>;
  if (loading) return <div className="flex items-center justify-center h-full text-xs text-[#1A1A18]/45">Loading {filePath}...</div>;

  return (
    <MonacoEditor
      height="100%"
      language={getLanguage(filePath)}
      value={content}
      theme="vs-dark"
      onChange={(value) => { if (value !== undefined && onContentChange && filePath) onContentChange(filePath, value); }}
      options={{ readOnly: !onContentChange, minimap: { enabled: false }, fontSize: 12, lineNumbers: "on", scrollBeyondLastLine: false, wordWrap: "on", padding: { top: 8 } }}
    />
  );
}
