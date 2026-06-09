"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Backend sends { type, source, payload, timestamp }. We normalize to this shape. */
export interface WSEvent {
  id: string;
  type: string;
  role?: string;
  content?: string;
  timestamp: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: Record<string, any>;
}

/** Raw shape received from the backend WebSocket. */
interface RawWSEvent {
  type?: string;
  source?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Record<string, any>;
  timestamp?: string;
}

interface UseWebSocketOptions {
  projectId: string;
  onEvent?: (event: WSEvent) => void;
}

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

export function useWebSocket({ projectId, onEvent }: UseWebSocketOptions) {
  const [events, setEvents] = useState<WSEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_BASE}/api/projects/${projectId}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    ws.onmessage = (ev) => {
      try {
        const raw: RawWSEvent = JSON.parse(ev.data);
        // Normalize backend format → frontend WSEvent
        const normalized: WSEvent = {
          id: crypto.randomUUID(),
          type: raw.type ?? "message",
          role: raw.source,
          content: raw.payload?.content as string | undefined,
          timestamp: raw.timestamp ?? new Date().toISOString(),
          data: raw.payload,
        };
        setEvents((prev) => [...prev.slice(-499), normalized]);
        onEventRef.current?.(normalized);
      } catch {
        // ignore non-JSON frames (e.g. "pong")
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // auto-reconnect after 3 seconds
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [projectId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return { events, connected };
}
