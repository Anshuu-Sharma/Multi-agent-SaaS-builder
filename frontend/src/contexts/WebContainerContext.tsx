"use client";

import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from "react";
import { WebContainer } from "@webcontainer/api";

interface WebContainerState {
  instance: WebContainer | null;
  status: "idle" | "booting" | "ready" | "error";
  serverUrl: string | null;
  error: string | null;
  boot: () => Promise<WebContainer>;
}

const WebContainerCtx = createContext<WebContainerState | null>(null);

export function WebContainerProvider({ children }: { children: ReactNode }) {
  const instanceRef = useRef<WebContainer | null>(null);
  const bootingRef = useRef<Promise<WebContainer> | null>(null);
  const [status, setStatus] = useState<WebContainerState["status"]>("idle");
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const boot = useCallback(async (): Promise<WebContainer> => {
    if (instanceRef.current) return instanceRef.current;
    if (bootingRef.current) return bootingRef.current;
    const promise = (async () => {
      setStatus("booting");
      setError(null);
      try {
        const wc = await WebContainer.boot();
        instanceRef.current = wc;
        wc.on("server-ready", (_port: number, url: string) => { setServerUrl(url); });
        setStatus("ready");
        return wc;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "WebContainer boot failed";
        setError(msg);
        setStatus("error");
        throw err;
      } finally { bootingRef.current = null; }
    })();
    bootingRef.current = promise;
    return promise;
  }, []);

  return (
    <WebContainerCtx.Provider value={{ instance: instanceRef.current, status, serverUrl, error, boot }}>
      {children}
    </WebContainerCtx.Provider>
  );
}

export function useWebContainer() {
  const ctx = useContext(WebContainerCtx);
  if (!ctx) throw new Error("useWebContainer must be used within WebContainerProvider");
  return ctx;
}
