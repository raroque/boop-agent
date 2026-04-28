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
      socket.on("data", (data) => {
        buffer += data.toString();
        let lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
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
