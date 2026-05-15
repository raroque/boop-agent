import type { WebSocket } from "ws";
import { EventEmitter } from "node:events";

type Client = WebSocket;
const clients = new Set<Client>();

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export type BroadcastMessage = {
  event: string;
  data: unknown;
  at: number;
};

export function addClient(ws: Client): void {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
}

export function broadcast(event: string, data: unknown): void {
  const msg: BroadcastMessage = { event, data, at: Date.now() };
  const payload = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(payload);
  }
  emitter.emit("event", msg);
}

export function subscribe(handler: (msg: BroadcastMessage) => void): () => void {
  emitter.on("event", handler);
  return () => emitter.off("event", handler);
}
