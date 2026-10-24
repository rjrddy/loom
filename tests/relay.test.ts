import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { start } from "../src/server.js";
import { Wire, until } from "../scripts/wire.js";
import { Replica, ROOT } from "../src/core.js";
test("actual WebSockets: concurrent offline union, dedupe, actor/auth/readonly and cursor gates", async () => {
  const dir = mkdtempSync(join(tmpdir(), "loom-relay-"));
  const app = start({
    port: 0,
    db: join(dir, "db.sqlite"),
    editToken: "local-edit",
    viewToken: "local-view",
  });
  const clients: Wire[] = [];
  try {
    await once(app.http, "listening");
    const port = (app.http.address() as { port: number }).port,
      url = `ws://127.0.0.1:${port}/sync`;
    const a = new Wire(url, "alpha"),
      b = new Wire(url, "beta"),
      view = new Wire(url, "viewer", "local-view");
    clients.push(a, b, view);
    await Promise.all(clients.map((c) => c.ready));
    assert.equal(view.role, "view");
    const x = a.replica.insert("alpha", ROOT, "X"),
      y = b.replica.insert("beta", ROOT, "Y");
    a.send(x);
    b.send(y);
    await until(() => a.replica.ops.has(y.id) && b.replica.ops.has(x.id));
    assert.equal(a.replica.digest(), b.replica.digest());
    a.send(x);
    await until(() => app.metrics.duplicates === 1);
    a.send({ ...x, ch: "Z" });
    await until(() => a.errors.includes("id_collision"));
    view.send(view.replica.insert("viewer", ROOT, "V"));
    await until(() => view.errors.includes("read_only"));
    a.send({
      kind: "insert",
      id: "intruder:999",
      stamp: [999, "intruder"],
      after: ROOT,
      ch: "F",
    });
    await until(() => a.errors.includes("actor_mismatch"));
    a.ws.send(JSON.stringify({ type: "cursor", x: NaN, y: 2 }));
    await until(() => a.errors.includes("invalid_cursor"));
    const unauthorized = new Wire(url, "unauthorized", "wrong-token");
    clients.push(unauthorized);
    await until(() => unauthorized.errors.includes("hello_rejected"));
    const offline = new Replica();
    for (const op of a.replica.all()) offline.apply(op);
    const local = offline.insert("offline", ROOT, "L");
    const reconnect = new Wire(url, "offline");
    clients.push(reconnect);
    await reconnect.ready;
    reconnect.send(local);
    await until(() => b.replica.ops.has(local.id));
    assert.equal(b.replica.text(), app.store.replica.text());
    assert.equal(
      (await fetch(`http://127.0.0.1:${port}/api/metrics`)).status,
      401,
    );
    console.log(
      JSON.stringify({
        caught: [
          "id_collision",
          "read_only",
          "actor_mismatch",
          "invalid_cursor",
          "hello_rejected",
        ],
        duplicates: app.metrics.duplicates,
        offline_merge: "pass",
      }),
    );
  } finally {
    for (const c of clients) c.close();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
