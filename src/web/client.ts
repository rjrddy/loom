import {
  Replica,
  validate,
  editDraft,
  type TextNode,
  type Op,
  type Field,
} from "../core.js";
export type Peer = {
  actor: string;
  role: string;
  cursor: { x: number; y: number } | null;
};
export class Workspace {
  readonly replica = new Replica();
  readonly actor: string;
  pending = new Map<string, Op>();
  peers: Peer[] = [];
  role = "";
  status = "connecting";
  error = "";
  online = true;
  private ws: WebSocket | null = null;
  private inflight = new Map<string, number>();
  private ready = false;
  private timer: ReturnType<typeof setInterval>;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private key: string;
  constructor(
    private changed: () => void,
    private token: string,
  ) {
    this.actor = sessionStorage.getItem("loom-actor") || crypto.randomUUID();
    sessionStorage.setItem("loom-actor", this.actor);
    this.key = `loom-state-${this.actor}`;
    try {
      const saved = JSON.parse(
        localStorage.getItem(this.key) || '{"ops":[],"pending":[]}',
      );
      for (const op of saved.ops) this.replica.apply(op);
      for (const value of saved.pending) {
        const op = validate(value);
        if (op.stamp[1] !== this.actor) throw Error();
        this.pending.set(op.id, op);
      }
    } catch {
      this.error =
        "Saved workspace is invalid. Export or clear this tab’s local storage deliberately before continuing.";
      this.online = false;
    }
    this.timer = setInterval(() => this.pump(), 180);
    if (this.online) this.connect();
  }
  private persist(): boolean {
    try {
      localStorage.setItem(
        this.key,
        JSON.stringify({
          ops: this.replica.all(),
          pending: [...this.pending.values()],
        }),
      );
      return true;
    } catch {
      this.error =
        "Local storage is full or unavailable. Edits remain in this tab; do not close it.";
      return false;
    }
  }
  private notify() {
    this.changed();
  }
  private connect() {
    if (this.disposed || !this.online) return;
    this.ready = false;
    this.inflight.clear();
    this.status = "connecting";
    this.notify();
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/sync`,
    );
    this.ws = ws;
    ws.onopen = () =>
      ws.send(
        JSON.stringify({ type: "hello", actor: this.actor, token: this.token }),
      );
    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      try {
        const m = JSON.parse(event.data);
        if (m.type === "welcome") this.role = m.role;
        else if (m.type === "ops") {
          for (const op of m.ops) this.replica.apply(op);
          this.persist();
        } else if (m.type === "ready") {
          this.ready = true;
          this.status = "connected";
          this.pump();
        } else if (m.type === "ack") {
          this.pending.delete(m.id);
          this.inflight.delete(m.id);
          this.persist();
        } else if (m.type === "presence") this.peers = m.peers;
        else if (m.type === "error") {
          this.error = `Relay rejected a request: ${m.code}. Pending edits are retained.`;
          if (m.code !== "rate_limit") this.online = false;
          ws.close();
        }
        this.notify();
      } catch {
        this.error = "Invalid relay data; local edits retained.";
        this.online = false;
        ws.close();
        this.notify();
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws || this.disposed) return;
      this.ready = false;
      this.peers = [];
      this.status = this.online ? "reconnecting" : "offline";
      this.notify();
      if (this.online) this.retry = setTimeout(() => this.connect(), 1000);
    };
    ws.onerror = () => {
      this.status = "reconnecting";
      this.notify();
    };
  }
  private pump() {
    if (
      !this.ready ||
      this.ws?.readyState !== WebSocket.OPEN ||
      this.role !== "edit"
    )
      return;
    let sent = 0;
    const now = Date.now();
    for (const op of this.pending.values()) {
      if (now - (this.inflight.get(op.id) || 0) < 3000) continue;
      this.ws.send(JSON.stringify({ type: "op", op }));
      this.inflight.set(op.id, now);
      if (++sent >= 15) break;
    }
  }
  private enqueue(ops: Op[]) {
    for (const op of ops) this.pending.set(op.id, op);
    this.persist();
    this.notify();
    this.pump();
  }
  private draftNodes: TextNode[] | null = null;
  beginText(): string {
    this.draftNodes = this.replica.visible();
    return this.draftNodes.map((n) => n.ch).join("");
  }
  endText(): void {
    this.draftNodes = null;
  }
  editText(next: string) {
    if (this.role === "view") return;
    try {
      const result = editDraft(
        this.replica,
        this.actor,
        this.draftNodes || this.replica.visible(),
        next,
      );
      this.draftNodes = result.nodes;
      this.enqueue(result.ops);
    } catch {
      this.error =
        "Text limit or operation capacity reached. The displayed draft was not applied; keep this tab open.";
      this.notify();
    }
  }

  setCard(id: string, field: Field, value: number | string | boolean) {
    if (this.role === "view") return;
    try {
      this.enqueue([this.replica.set(this.actor, id, field, value)]);
    } catch {
      this.error =
        "Card update rejected locally; operation capacity or value limit reached.";
      this.notify();
    }
  }
  addCard() {
    const id = "card-" + crypto.randomUUID().slice(0, 8);
    this.setCard(id, "x", 90 + (this.replica.cards().length % 4) * 110);
    this.setCard(id, "y", 130 + (this.replica.cards().length % 3) * 90);
    this.setCard(id, "text", "A new thought.");
    this.setCard(id, "color", "mint");
    return id;
  }
  toggleOnline() {
    this.online = !this.online;
    this.error = "";
    if (this.online) this.connect();
    else {
      if (this.retry) clearTimeout(this.retry);
      this.ws?.close();
      this.status = "offline";
      this.notify();
    }
  }
  cursor(x: number, y: number) {
    if (this.ready && this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ type: "cursor", x, y }));
  }
  dispose() {
    this.disposed = true;
    clearInterval(this.timer);
    if (this.retry) clearTimeout(this.retry);
    this.ws?.close();
  }
  export() {
    return JSON.stringify(
      {
        actor: this.actor,
        ops: this.replica.all(),
        pending: [...this.pending.values()],
      },
      null,
      2,
    );
  }
}
