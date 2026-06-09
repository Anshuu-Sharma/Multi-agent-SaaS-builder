"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Square, Terminal as TerminalIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileSystemTree } from "@webcontainer/api";
import { useWebContainer } from "@/contexts/WebContainerContext";
import type { WorkspaceFile, FileContent } from "@/lib/api";
import { readWorkspaceFile } from "@/lib/api";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export function PreviewPanel({ projectId, files }: { projectId: string; files: WorkspaceFile[]; }) {
  const { status, serverUrl, boot, error: wcError } = useWebContainer();
  const [running, setRunning] = useState(false);
  const [showTerminal, setShowTerminal] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  
  const hasPackageJson = files.some((f) => f.path === "package.json" && !f.is_dir);

  const writeToTerminal = useCallback((text: string) => {
    if (xtermRef.current) {
      xtermRef.current.write(text.replace(/\n/g, '\r\n') + '\r\n');
    }
  }, []);

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
      fitAddonRef.current = fitAddon;

      const resizeObserver = new ResizeObserver(() => fitAddon.fit());
      resizeObserver.observe(terminalRef.current);

      return () => {
        resizeObserver.disconnect();
        term.dispose();
        xtermRef.current = null;
      };
    }
  }, [showTerminal]);

  const handleRun = useCallback(async () => {
    if (!hasPackageJson) { writeToTerminal("No package.json found — cannot run preview."); return; }
    setRunning(true);
    if (xtermRef.current) xtermRef.current.clear();
    writeToTerminal("Booting WebContainer...");
    try {
      const wc = await boot();
      writeToTerminal("WebContainer ready. Loading files...");
      const fileContents = await Promise.all(
        files.filter((f) => !f.is_dir).map((f) => readWorkspaceFile(projectId, f.path).catch(() => ({ path: f.path, content: "" })))
      );
      const fsTree: Record<string, unknown> = {};
      for (const fc of fileContents as FileContent[]) {
        const parts = fc.path.split("/");
        let current = fsTree;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) current[parts[i]] = { directory: {} };
          current = (current[parts[i]] as Record<string, unknown>).directory as Record<string, unknown>;
        }
        current[parts[parts.length - 1]] = { file: { contents: fc.content } };
      }
      await wc.mount(fsTree as FileSystemTree);
      writeToTerminal(`Mounted ${fileContents.length} files.\r\nRunning npm install...`);
      const installProcess = await wc.spawn("npm", ["install"]);
      installProcess.output.pipeTo(new WritableStream({ write(data) { writeToTerminal(data); } }));
      const installExit = await installProcess.exit;
      if (installExit !== 0) { writeToTerminal(`npm install failed with exit code ${installExit}`); setRunning(false); return; }
      writeToTerminal("Install complete. Starting dev server...");
      const devProcess = await wc.spawn("npm", ["run", "dev"]);
      devProcess.output.pipeTo(new WritableStream({ write(data) { writeToTerminal(data); } }));
    } catch (err) {
      writeToTerminal(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setRunning(false);
    }
  }, [boot, files, hasPackageJson, projectId, writeToTerminal]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1A1A18]/10 bg-[#FAF9F7] shrink-0">
        <div className="flex items-center gap-2">
          {!running ? (
            <Button size="sm" onClick={handleRun} disabled={status === "booting" || !hasPackageJson} className="h-6 px-2 text-[10px] gap-1 bg-[#2D6A4F] text-white hover:bg-[#2D6A4F]/90">
              {status === "booting" ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />} Run
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setRunning(false)} className="h-6 px-2 text-[10px] gap-1 text-[#D4583A]"><Square className="size-3" /> Stop</Button>
          )}
          {!hasPackageJson && <span className="text-[10px] text-[#1A1A18]/55">No package.json — preview unavailable</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setShowTerminal(!showTerminal)} className="h-6 px-2 text-[10px] gap-1"><TerminalIcon className="size-3" /> Terminal</Button>
      </div>
      <div className="flex-1 bg-white relative">
        {serverUrl ? (
          <iframe src={serverUrl} className="w-full h-full border-0" title="Preview" sandbox="allow-scripts allow-same-origin" />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-[#1A1A18]/45">
            {status === "booting" ? "Booting WebContainer..." : running ? "Waiting for dev server..." : wcError ? `Error: ${wcError}` : "Click Run to start preview"}
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
