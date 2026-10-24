import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, cpus, platform, arch, totalmem } from "node:os";
import { Replica, ROOT, compare, canonical, type Op } from "../src/core.js";
import { start } from "../src/server.js";
import { Wire, until } from "./wire.js";
function random(seed: number) {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function campaign(trials: number, steps: number) {
  let generated = 0,
    drops = 0;
  const trialResults: {
    seed: number;
    operations: number;
    converged: boolean;
    union_sha256: string;
  }[] = [];
  const started = performance.now();
  for (let seed = 1; seed <= trials; seed++) {
    const rng = random(seed),
      replicas = Array.from({ length: 4 }, () => new Replica()),
      all: Op[] = [];
    for (let i = 0; i < steps; i++) {
      const k = Math.floor(rng() * 4),
        r = replicas[k],
        actor = `peer${k}`,
        visible = r.visible();
      let op: Op;
      if (rng() < 0.6 || !visible.length)
        op = r.insert(
          actor,
          visible.length && rng() > 0.2
            ? visible[Math.floor(rng() * visible.length)].id
            : ROOT,
          String.fromCharCode(97 + Math.floor(rng() * 26)),
        );
      else if (rng() < 0.45)
        op = r.delete(actor, visible[Math.floor(rng() * visible.length)].id);
      else
        op = r.set(
          actor,
          `card${Math.floor(rng() * 5)}`,
          rng() < 0.5 ? "x" : "y",
          Math.floor(rng() * 800),
        );
      all.push(op);
      generated++;
      for (let j = 0; j < 4; j++) {
        if (rng() < 0.48) {
          drops++;
          continue;
        }
        replicas[j].apply(all[Math.floor(rng() * all.length)]);
      }
    }
    for (const r of replicas) {
      const order = [...all];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      for (const op of order) {
        r.apply(op);
        if (rng() < 0.15) r.apply(op);
      }
    }
    const expectedUnion = JSON.stringify(
      [...all].sort((a, b) => compare(a.stamp, b.stamp)).map(canonical),
    );
    for (const r of replicas)
      if (
        r.digest() !== expectedUnion ||
        r.digest() !== replicas[0].digest() ||
        r.text() !== replicas[0].text() ||
        JSON.stringify(r.cards()) !== JSON.stringify(replicas[0].cards())
      )
        throw Error(`convergence_failure_seed_${seed}`);
    trialResults.push({
      seed,
      operations: all.length,
      converged: true,
      union_sha256: createHash("sha256")
        .update(replicas[0].digest())
        .digest("hex"),
    });
  }
  return {
    trials,
    operations_per_trial: steps,
    replicas: 4,
    operations: generated,
    initial_delivery_drops: drops,
    converged: trialResults.filter((r) => r.converged).length,
    trial_results: trialResults,
    elapsed_ms: performance.now() - started,
    scope:
      "seeded finite campaign; initial reordering, duplication, drops/partitions; eventual full anti-entropy and distinct actors required; not a proof under permanent loss",
  };
}
const quantile = (a: number[], q: number) =>
  [...a].sort((x, y) => x - y)[Math.ceil(q * a.length) - 1];
async function main() {
  mkdirSync("docs/results", { recursive: true });
  const convergence = campaign(
    process.env.LOOM_QUICK ? 12 : 80,
    process.env.LOOM_QUICK ? 600 : 2000,
  );
  const dir = mkdtempSync(join(tmpdir(), "loom-bench-")),
    app = start({
      port: 0,
      db: join(dir, "bench.sqlite"),
      editToken: "local-edit",
      viewToken: "local-view",
    }),
    clients: Wire[] = [];
  try {
    await once(app.http, "listening");
    const port = (app.http.address() as { port: number }).port,
      url = `ws://127.0.0.1:${port}/sync`;
    for (const actor of ["latency-a", "latency-b", "latency-c"])
      clients.push(new Wire(url, actor));
    await Promise.all(clients.map((c) => c.ready));
    const samples: number[] = [];
    for (let i = 0; i < 300; i++) {
      const a = clients[0],
        op = a.replica.set(a.actor, "measured-card", "x", i),
        start = performance.now();
      a.send(op);
      await until(() =>
        clients.slice(1).every((c) => c.replica.ops.has(op.id)),
      );
      samples.push(performance.now() - start);
      if (i % 60 === 59) await new Promise((r) => setTimeout(r, 1000));
    }
    const result = {
      environment: {
        node: process.version,
        platform: platform(),
        arch: arch(),
        cpu: cpus()[0].model,
        logical_cpus: cpus().length,
        ram_bytes: totalmem(),
      },
      convergence,
      propagation: {
        samples: samples.length,
        clients: 3,
        p50_ms: quantile(samples, 0.5),
        p99_ms: quantile(samples, 0.99),
        min_ms: Math.min(...samples),
        max_ms: Math.max(...samples),
        raw_ms: samples,
        scope:
          "actual loopback WebSocket send → both other Node clients applied; sequential offers; SQLite FULL commit before broadcast; 2ms polling resolution; not internet or browser latency",
      },
      human_collaboration_benefit: "not measured",
    };
    writeFileSync(
      "docs/results/benchmark.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    for (const c of clients) c.close();
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
await main();
