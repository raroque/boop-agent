import { useEffect, useRef, useState } from "react";

export interface SocketEvent {
  event: string;
  data: unknown;
  at: number;
}

export type SocketStatus = "connecting" | "live" | "disconnected";

export function useSocket(onEvent?: (e: SocketEvent) => void) {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      setStatus("connecting");
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${proto}//${location.host}/ws`;
      ws = new WebSocket(url);
      ws.onopen = () => setStatus("live");
      ws.onclose = () => {
        setStatus("disconnected");
        reconnectTimer = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws?.close();
      ws.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data) as SocketEvent;
          handlerRef.current?.(parsed);
        } catch {
          /* ignore */
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  return { connected: status === "live", status };
}
