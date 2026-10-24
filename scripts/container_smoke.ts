/** Actual Linux image, nonroot UID, WebSocket ACK, competing writer and volume recreation. */
import { spawnSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Wire, until } from "./wire.js";
import { ROOT } from "../src/core.js";
const name = "loom-smoke-primary",
  volume = "loom-smoke-" + randomUUID(),
  token = "synthetic-container-editor-token-0001";
function docker(args: string[], check = true) {
  const result = spawnSync("docker", args, { encoding: "utf8" });
  if (check && result.status !== 0)
    throw Error("docker_failed: " + result.stderr);
  return result;
}
async function ready() {
  await until(() => {
    const result = docker(
      [
        "exec",
        name,
        "node",
        "-e",
        "fetch('http://127.0.0.1:8097/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))",
      ],
      false,
    );
    return result.status === 0;
  }, 30000);
}
function run() {
  docker([
    "run",
    "-d",
    "--name",
    name,
    "-p",
    "127.0.0.1:18114:8097",
    "-v",
    volume + ":/app/.cache",
    "-e",
    "LOOM_EDIT_TOKEN=" + token,
    "-e",
    "LOOM_VIEW_TOKEN=synthetic-container-viewer-token-0001",
    "loom:test",
  ]);
}
const clients: Wire[] = [];
try {
  docker(["volume", "create", volume]);
  run();
  await ready();
  const root = await fetch("http://127.0.0.1:18114/");
  const html = await root.text();
  if (!root.ok || !html.includes("Loom")) throw Error("static_ui_missing");
  const asset = html.match(/src="([^"]+\.js)"/);
  if (!asset || !(await fetch("http://127.0.0.1:18114" + asset[1])).ok)
    throw Error("asset_missing");
  if (docker(["exec", name, "id", "-u"]).stdout.trim() !== "1000")
    throw Error("not_nonroot");
  const a = new Wire("ws://127.0.0.1:18114/sync", "container-writer", token);
  clients.push(a);
  await a.ready;
  const op = a.replica.insert(a.actor, ROOT, "C");
  let acked = false;
  a.ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === "ack" && m.id === op.id) acked = true;
  });
  a.send(op);
  await until(() => acked);
  const digest = createHash("sha256").update(a.replica.digest()).digest("hex");
  const competing = docker(
    [
      "run",
      "--rm",
      "--network",
      "none",
      "-v",
      volume + ":/app/.cache",
      "-e",
      "LOOM_EDIT_TOKEN=" + token,
      "-e",
      "LOOM_VIEW_TOKEN=synthetic-container-viewer-token-0001",
      "loom:test",
    ],
    false,
  );
  if (
    competing.status === 0 ||
    (!competing.stdout.includes("startup_failed") &&
      !competing.stderr.includes("startup_failed"))
  )
    throw Error("competing_writer_not_fenced");
  docker(["kill", "--signal=KILL", name]);
  a.close();
  docker(["rm", name]);
  run();
  await ready();
  const b = new Wire("ws://127.0.0.1:18114/sync", "container-restored", token);
  clients.push(b);
  await b.ready;
  const recovered = createHash("sha256")
    .update(b.replica.digest())
    .digest("hex");
  if (recovered !== digest) throw Error("volume_recovery_mismatch");
  const result = {
    uid: 1000,
    static_ui_and_js: "pass",
    actual_ws_ack: "pass",
    competing_writer: "rejected",
    sigkill_and_container_recreation:
      "same acknowledged union from named volume",
    union_sha256: recovered,
    scope:
      "actual Linux image and SQLite volume; process kill/recreation, not power-loss testing",
  };
  writeFileSync(
    "docs/results/container-proof.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  for (const c of clients) c.close();
  docker(["rm", "-f", name], false);
  docker(["volume", "rm", volume], false);
}
