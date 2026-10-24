import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { Wire, until } from "../scripts/wire.js";
import { ROOT } from "../src/core.js";
test("real SIGKILL restart preserves acknowledged data; parser/auth logs omit canary and tokens", async () => {
  const dir = mkdtempSync(join(tmpdir(), "loom-process-")),
    db = join(dir, "db.sqlite"),
    listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((r) => listener.close(() => r()));
  let child: ChildProcess | null = null;
  let logs = "";
  const clients: Wire[] = [];
  const start = async () => {
    const c = spawn(process.execPath, ["dist-node/src/server.js"], {
      env: { ...process.env, PORT: String(port), LOOM_DB: db },
      stdio: ["ignore", "pipe", "pipe"],
    });
    c.stdout?.on("data", (chunk) => {
      logs += chunk.toString();
    });
    c.stderr?.on("data", (chunk) => {
      logs += chunk.toString();
    });
    child = c;
    await until(() => logs.includes('"event":"ready"'));
    return c;
  };
  try {
    await start();
    const a = new Wire(`ws://127.0.0.1:${port}/sync`, "restart-client");
    clients.push(a);
    await a.ready;
    const op = a.replica.insert(a.actor, ROOT, "K");
    let acked = false;
    a.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "ack" && msg.id === op.id) acked = true;
    });
    a.send(op);
    await until(() => acked);
    const expected = a.replica.digest();
    child!.kill("SIGKILL");
    await once(child!, "exit");
    a.close();
    logs = "";
    await start();
    const b = new Wire(`ws://127.0.0.1:${port}/sync`, "restored-client");
    clients.push(b);
    await b.ready;
    assert.equal(b.replica.digest(), expected);
    const { connect } = await import("node:net");
    const raw = connect(port, "127.0.0.1");
    await once(raw, "connect");
    raw.write("GET / HTTP/synthetic-canary@example.invalid\r\n\r\n");
    await once(raw, "data");
    raw.destroy();
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(logs.includes("parse_error"));
    assert.ok(!logs.includes("synthetic-canary@example.invalid"));
    assert.ok(!logs.includes("local-edit"));
    writeFileSync(
      "docs/results/process-proof.json",
      JSON.stringify(
        {
          acknowledged_id: op.id,
          sigkill_restart: "same SQLite file; full operation union identical",
          parser_canary_logged: false,
          credential_logged: false,
          scope: "process kill, not simulated power loss",
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify({ sigkill_restart: "pass", parser_canary: "excluded" }),
    );
  } finally {
    for (const c of clients) c.close();
    const active = child as ChildProcess | null;
    if (active && active.exitCode === null && active.signalCode === null) {
      active.kill("SIGTERM");
      await once(active, "exit");
    }
    writeFileSync("docs/results/process-server.log", logs);
    rmSync(dir, { recursive: true, force: true });
  }
});
