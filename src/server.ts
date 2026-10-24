import { createServer, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Store } from "./store.js";
import { actorValid, type Op } from "./core.js";
export type RelayOptions = {
  port: number;
  host?: string;
  db: string;
  editToken: string;
  viewToken: string;
};
type Peer = {
  actor: string;
  role: "edit" | "view";
  cursor: { x: number; y: number } | null;
  window: number;
  count: number;
};
export function start(options: RelayOptions) {
  const host = options.host || "127.0.0.1";
  if (
    options.editToken === options.viewToken ||
    (!["127.0.0.1", "localhost", "::1"].includes(host) &&
      [options.editToken, options.viewToken].some(
        (t) => t.length < 24 || t.startsWith("local-"),
      ))
  )
    throw Error("private_distinct_tokens_required");
  const store = new Store(options.db),
    peers = new Map<WebSocket, Peer>();
  const metrics = { accepted: 0, duplicates: 0, rejected: 0, connections: 0 };
  const log = (event: string, code?: string) =>
    console.log(JSON.stringify({ event, ...(code ? { code } : {}) }));
  const equal = (a: string, b: string) => {
    const x = Buffer.from(a),
      y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  };
  const role = (token: string) =>
    equal(token, options.editToken)
      ? "edit"
      : equal(token, options.viewToken)
        ? "view"
        : null;
  const send = (ws: WebSocket, data: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 2e6) {
        ws.close(1013, "slow_peer");
        return;
      }
      ws.send(JSON.stringify(data));
    }
  };
  const broadcast = (data: unknown) => {
    for (const ws of peers.keys()) send(ws, data);
  };
  const presence = () =>
    broadcast({
      type: "presence",
      peers: [...peers.values()].map((p) => ({
        actor: p.actor,
        role: p.role,
        cursor: p.cursor,
      })),
    });
  const reply = (
    r: ServerResponse,
    status: number,
    data: unknown,
    kind = "application/json",
  ) => {
    r.writeHead(status, {
      "Content-Type": kind,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'",
    });
    r.end(
      typeof data === "string" || Buffer.isBuffer(data)
        ? data
        : JSON.stringify(data),
    );
  };
  const http = createServer((req, res) => {
    const path = new URL(req.url || "/", "http://localhost").pathname;
    if (req.method !== "GET") {
      reply(res, 405, { error: "method_not_allowed" });
      return;
    }
    if (path === "/health") {
      reply(res, 200, { status: "ready" });
      return;
    }
    if (path.startsWith("/api/")) {
      if (!role((req.headers.authorization || "").replace(/^Bearer /, ""))) {
        reply(res, 401, { error: "bearer_required" });
        return;
      }
      if (path === "/api/metrics")
        reply(res, 200, {
          ...metrics,
          peers: peers.size,
          operations: store.replica.ops.size,
        });
      else if (path === "/api/evidence") {
        const p = resolve("docs/results/benchmark.json");
        reply(
          res,
          200,
          existsSync(p)
            ? JSON.parse(readFileSync(p, "utf8"))
            : { status: "not measured" },
        );
      } else reply(res, 404, { error: "not_found" });
      return;
    }
    const root = resolve("dist-web"),
      file = resolve(root, path === "/" ? "index.html" : "." + path);
    if (!file.startsWith(root + sep) || !existsSync(file)) {
      reply(res, 404, { error: "not_found" });
      return;
    }
    try {
      reply(
        res,
        200,
        readFileSync(file),
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript",
          ".css": "text/css",
        }[extname(file)] || "application/octet-stream",
      );
    } catch {
      reply(res, 404, { error: "not_found" });
    }
  });
  http.requestTimeout = 10000;
  http.headersTimeout = 10000;
  http.maxConnections = 64;
  http.on("clientError", (_e, socket) => {
    log("http_rejected", "parse_error");
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 32768,
    perMessageDeflate: false,
  });
  http.on("upgrade", (req, socket, head) => {
    // Same-origin browser connections; origin-less native clients remain token-authenticated.
    if (
      req.url !== "/sync" ||
      (req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}` &&
        req.headers.origin !== `https://${req.headers.host}`) ||
      wss.clients.size >= 24
    ) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });
  wss.on("connection", (ws) => {
    metrics.connections++;
    const deadline = setTimeout(() => ws.close(1008, "hello_required"), 5000);
    ws.on("error", () => log("socket_error", "transport"));
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        let peer = peers.get(ws);
        if (!peer) {
          const access = typeof msg.token === "string" ? role(msg.token) : null;
          if (
            msg.type !== "hello" ||
            !access ||
            !actorValid(msg.actor) ||
            [...peers.values()].some((p) => p.actor === msg.actor)
          )
            throw Error("hello_rejected");
          clearTimeout(deadline);
          peer = {
            actor: msg.actor,
            role: access,
            cursor: null,
            window: Date.now(),
            count: 0,
          };
          peers.set(ws, peer);
          send(ws, { type: "welcome", role: access });
          const ops = store.replica.all();
          for (let i = 0; i < ops.length; i += 80)
            send(ws, { type: "ops", ops: ops.slice(i, i + 80) });
          send(ws, { type: "ready", operations: ops.length });
          presence();
          return;
        }
        if (Date.now() - peer.window > 1000) {
          peer.window = Date.now();
          peer.count = 0;
        }
        if (++peer.count > 250) throw Error("rate_limit");
        if (msg.type === "op") {
          if (peer.role !== "edit") throw Error("read_only");
          const input = msg.op as Op;
          if (!input || input.stamp?.[1] !== peer.actor)
            throw Error("actor_mismatch");
          const { op, fresh } = store.accept(input);
          if (fresh) {
            metrics.accepted++;
            broadcast({ type: "ops", ops: [op] });
          } else metrics.duplicates++;
          send(ws, { type: "ack", id: op.id });
        } else if (msg.type === "cursor") {
          if (
            typeof msg.x !== "number" ||
            typeof msg.y !== "number" ||
            !Number.isFinite(msg.x) ||
            !Number.isFinite(msg.y) ||
            msg.x < 0 ||
            msg.x > 1600 ||
            msg.y < 0 ||
            msg.y > 1600
          )
            throw Error("invalid_cursor");
          peer.cursor = { x: msg.x, y: msg.y };
          presence();
        } else throw Error("unknown_message");
      } catch (e) {
        metrics.rejected++;
        const message = e instanceof Error ? e.message : "";
        const safe = [
          "invalid_operation",
          "invalid_id",
          "invalid_insert",
          "invalid_delete",
          "invalid_object",
          "invalid_position",
          "invalid_card_text",
          "invalid_color",
          "invalid_tombstone",
          "invalid_field",
          "invalid_kind",
          "unknown_fields",
          "workspace_full",
          "id_collision",
          "read_only",
          "actor_mismatch",
          "hello_rejected",
          "rate_limit",
          "invalid_cursor",
          "unknown_message",
        ].includes(message)
          ? message
          : "request_rejected";
        log("rejected", safe);
        send(ws, { type: "error", code: safe });
        if (!peers.has(ws)) ws.close(1008, "authentication_failed");
      }
    });
    ws.on("close", () => {
      clearTimeout(deadline);
      peers.delete(ws);
      presence();
    });
  });
  http.listen(options.port, host, () => log("ready"));
  return {
    http,
    wss,
    store,
    metrics,
    close: async () => {
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => http.close(() => r()));
      store.close();
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === new URL("file://" + resolve(process.argv[1])).href
) {
  try {
    const app = start({
      port: Number(process.env.PORT || 8097),
      host: process.env.HOST || "127.0.0.1",
      db: process.env.LOOM_DB || ".cache/loom.sqlite",
      editToken: process.env.LOOM_EDIT_TOKEN || "local-edit",
      viewToken: process.env.LOOM_VIEW_TOKEN || "local-view",
    });
    for (const s of ["SIGTERM", "SIGINT"] as const)
      process.on(s, () => {
        void app.close().then(() => process.exit(0));
      });
  } catch {
    console.error(
      JSON.stringify({
        event: "startup_failed",
        code: "configuration_storage_or_lock",
      }),
    );
    process.exitCode = 1;
  }
}
