import { WebSocket } from "ws";
import { Replica, type Op } from "../src/core.js";
export class Wire {
  readonly replica = new Replica();
  readonly ws: WebSocket;
  role = "";
  ready: Promise<void>;
  errors: string[] = [];
  private readyResolve!: () => void;
  constructor(
    url: string,
    readonly actor: string,
    token = "local-edit",
  ) {
    this.ready = new Promise<void>((r) => {
      this.readyResolve = r;
    });
    this.ws = new WebSocket(url);
    this.ws.on("open", () =>
      this.ws.send(JSON.stringify({ type: "hello", actor, token })),
    );
    this.ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === "ops") for (const op of m.ops) this.replica.apply(op);
      if (m.type === "welcome") this.role = m.role;
      if (m.type === "ready") this.readyResolve();
      if (m.type === "error") this.errors.push(m.code);
    });
    this.ws.on("error", () => this.errors.push("transport"));
  }
  send(op: Op): void {
    this.ws.send(JSON.stringify({ type: "op", op }));
  }
  close(): void {
    this.ws.terminate();
  }
}
export async function until(
  check: () => boolean,
  timeout = 5000,
): Promise<void> {
  const end = performance.now() + timeout;
  while (!check()) {
    if (performance.now() > end) throw Error("condition_timeout");
    await new Promise((r) => setTimeout(r, 2));
  }
}
