"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Square, Terminal as TerminalIcon, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWebContainer } from "@/contexts/WebContainerContext";
import type { WorkspaceFile } from "@/lib/api";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export function PreviewPanel({ projectId, files }: { projectId: string; files: WorkspaceFile[]; }) {
  const { 
    status, previewHtml, error: previewError, 
    isRunning, runPreview, stopPreview, 
    getTerminalHistory, onTerminalData 
  } = useWebContainer();
  
  const [showTerminal, setShowTerminal] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  
  const hasTsxFiles = files.some((f) => (f.path.endsWith(".tsx") || f.path.endsWith(".jsx")) && !f.is_dir);

  useEffect(() => {
    if (showTerminal && terminalRef.current && !xtermRef.current) {
      const term = new Terminal({
        theme: { background: "#1A1A18", foreground: "#E0E0E0" },
        fontSize: 10,
        fontFamily: "monospace",
        convertEol: true,
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();
      
      xtermRef.current = term;
      
      // Restore history
      term.write(getTerminalHistory());

      const resizeObserver = new ResizeObserver(() => fitAddon.fit());
      resizeObserver.observe(terminalRef.current);

      // Subscribe to new data
      const unsubscribe = onTerminalData((data) => {
        if (data === "\x1bc") {
          term.clear();
        } else {
          term.write(data);
        }
      });

      return () => {
        unsubscribe();
        resizeObserver.disconnect();
        term.dispose();
        xtermRef.current = null;
      };
    }
  }, [showTerminal, getTerminalHistory, onTerminalData]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1A1A18]/10 bg-[#FAF9F7] shrink-0">
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <Button 
              size="sm" 
              onClick={() => runPreview(files, projectId)} 
              disabled={status === "building" || !hasTsxFiles} 
              className="h-6 px-2 text-[10px] gap-1 bg-[#2D6A4F] text-white hover:bg-[#2D6A4F]/90"
            >
              {status === "building" ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />} Run
            </Button>
          ) : (
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={stopPreview} 
              className="h-6 px-2 text-[10px] gap-1 text-[#D4583A]"
            >
              <Square className="size-3" /> Stop
            </Button>
          )}
          {status === "ready" && (
            <span className="flex items-center gap-1 text-[10px] text-[#2D6A4F]">
              <Eye className="size-3" /> Preview ready
            </span>
          )}
          {!hasTsxFiles && <span className="text-[10px] text-[#1A1A18]/55">No JSX/TSX files — preview unavailable</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowTerminal(!showTerminal)} className="h-6 px-2 text-[10px] gap-1">
          <TerminalIcon className="size-3" /> Build Log
        </Button>
      </div>
      <div className="flex-1 bg-white relative">
        {previewHtml ? (
          <iframe 
            srcDoc={previewHtml} 
            className="w-full h-full border-0" 
            title="Preview" 
            sandbox="allow-scripts" 
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-[#1A1A18]/45">
            {status === "building" ? "Building preview..." : previewError ? `Error: ${previewError}` : "Click Run to build & preview"}
          </div>
        )}
      </div>
      {showTerminal && (
        <div className="h-40 border-t border-[#1A1A18]/10 bg-[#1A1A18] shrink-0 p-2 overflow-hidden flex">
          <div ref={terminalRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}
