import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage, JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer, Server as NetServer, Socket } from "net";

export class NetServerTransport implements Transport {
  private server: NetServer;
  private socket?: Socket;
  public onmessage?: (message: JSONRPCMessage) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;

  constructor(private socketPath: string) {
    this.server = createServer((socket) => {
      if (this.socket) {
        // Only one connection at a time for this bridge
        socket.destroy();
        return;
      }
      this.socket = socket;
      
      let buffer = "";
      const MAX_LINE_LENGTH = 1024 * 1024; // 1MB limit per line
      socket.on("data", (data) => {
        buffer += data.toString();
        // Prevent memory exhaustion from too much data without newlines
        if (buffer.length > MAX_LINE_LENGTH * 2) {
          this.onerror?.(new Error("Incoming message line buffer exceeded limit"));
          socket.destroy();
          return;
        }
        let lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.length > MAX_LINE_LENGTH) {
            this.onerror?.(new Error("Line exceeded maximum allowed length"));
            continue;
          }
          try {
            const message = JSONRPCMessageSchema.parse(JSON.parse(line));
            this.onmessage?.(message);
          } catch (err) {
            this.onerror?.(err as Error);
          }
        }
      });

      socket.on("close", () => {
        this.socket = undefined;
        this.onclose?.();
      });

      socket.on("error", (err) => {
        this.onerror?.(err);
      });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.socketPath, () => resolve());
      this.server.on("error", reject);
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.socket) {
      throw new Error("No client connected to NetServerTransport");
    }
    this.socket.write(JSON.stringify(message) + "\n");
  }

  async close(): Promise<void> {
    this.socket?.destroy();
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}
