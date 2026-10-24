import test from "node:test";
import assert from "node:assert/strict";
import {
  Replica,
  ROOT,
  validate,
  editDraft,
  compare,
  canonical,
  type Op,
} from "../src/core.js";
import { Store } from "../src/store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export function rng(seed: number) {
  let n = seed >>> 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
export function campaign(trials = 80, steps = 750) {
  let generated = 0,
    dropped = 0;
  for (let seed = 1; seed <= trials; seed++) {
    const random = rng(seed),
      replicas = Array.from({ length: 4 }, () => new Replica()),
      all: Op[] = [];
    for (let i = 0; i < steps; i++) {
      const k = Math.floor(random() * 4),
        r = replicas[k],
        actor = `peer${k}`,
        visible = r.visible();
      let op: Op;
      if (random() < 0.6 || !visible.length)
        op = r.insert(
          actor,
          visible.length && random() > 0.2
            ? visible[Math.floor(random() * visible.length)].id
            : ROOT,
          String.fromCharCode(97 + Math.floor(random() * 26)),
        );
      else if (random() < 0.45)
        op = r.delete(actor, visible[Math.floor(random() * visible.length)].id);
      else
        op = r.set(
          actor,
          `card${Math.floor(random() * 5)}`,
          random() < 0.5 ? "x" : "y",
          Math.floor(random() * 800),
        );
      all.push(op);
      generated++;
      if (all.length > 2)
        for (let target = 0; target < 4; target++) {
          if (random() < 0.48) {
            dropped++;
            continue;
          }
          replicas[target].apply(all[Math.floor(random() * all.length)]);
        }
    }
    // Heal partition/drop schedule through anti-entropy; permanent message loss cannot converge.
    for (const r of replicas) {
      const order = [...all];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      for (const op of order) {
        r.apply(op);
        if (random() < 0.15) r.apply(op);
      }
    }
    const expectedUnion = JSON.stringify(
      [...all].sort((a, b) => compare(a.stamp, b.stamp)).map(canonical),
    );
    const expected = replicas[0];
    for (const r of replicas) {
      assert.equal(r.digest(), expectedUnion);
      assert.equal(r.digest(), expected.digest());
      assert.equal(r.text(), expected.text());
      assert.deepEqual(r.cards(), expected.cards());
    }
  }
  return {
    trials,
    replicas: 4,
    operations: generated,
    initial_delivery_drops: dropped,
    converged: trials,
    scope:
      "seeded finite trials; reordered/duplicated/dropped initial deliveries, eventual full anti-entropy; not permanent-loss convergence",
  };
}
test("sequence preserves delete-before-insert and descendants through tombstones", () => {
  const a = new Replica(),
    b = new Replica();
  const x = a.insert("a", ROOT, "X"),
    y = a.insert("a", x.id, "Y"),
    del = a.delete("a", x.id);
  b.apply(del);
  b.apply(y);
  b.apply(x);
  assert.equal(b.text(), "Y");
  assert.equal(a.digest(), b.digest());
});
test("concurrent siblings and per-field LWW converge in either order", () => {
  const a = new Replica(),
    b = new Replica();
  const x = a.insert("a", ROOT, "A"),
    y = b.insert("b", ROOT, "B");
  a.apply(y);
  b.apply(x);
  assert.equal(a.text(), b.text());
  const one = a.set("a", "card", "x", 100),
    two = b.set("b", "card", "y", 200);
  a.apply(two);
  b.apply(one);
  assert.deepEqual(a.cards(), b.cards());
  assert.equal(a.cards()[0].x, 100);
  assert.equal(a.cards()[0].y, 200);
});
test("malformed/cyclic/future-anchor/conflicting IDs fail closed", () => {
  const r = new Replica();
  const op = r.insert("a", ROOT, "x");
  assert.throws(() => r.apply({ ...op, ch: "y" }), /id_collision/);
  assert.throws(() => validate({ ...op, after: op.id }), /invalid_insert/);
  assert.throws(() => validate({ ...op, extra: 1 }), /unknown_fields/);
  assert.throws(() => r.set("a", "c", "x", NaN), /invalid_position/);
  assert.throws(() => r.insert("a", ROOT, "ab"), /invalid_insert/);
});
test("seeded partition/reorder/drop/duplicate campaign converges after healing", () => {
  const result = campaign(40, 500);
  console.log(JSON.stringify(result));
});
test("SQLite dedupe, exclusive writer fencing and restart persistence", () => {
  const dir = mkdtempSync(join(tmpdir(), "loom-store-"));
  try {
    const path = join(dir, "db.sqlite"),
      s = new Store(path, false);
    const r = new Replica(),
      op = r.insert("test", ROOT, "Q");
    assert.equal(s.accept(op).fresh, true);
    assert.equal(s.accept(op).fresh, false);
    assert.throws(() => s.accept({ ...op, ch: "R" }), /id_collision/);
    assert.throws(() => new Store(path, false));
    const digest = s.replica.digest();
    s.close();
    const restored = new Store(path, false);
    assert.equal(restored.replica.digest(), digest);
    restored.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("focused draft edits preserve unseen remote insertions", () => {
  const a = new Replica();
  a.insert("seed", ROOT, "A");
  const base = a.visible();
  a.insert("remote", base[0].id, "R");
  const edit = editDraft(a, "local", base, "AL");
  assert.equal(edit.nodes.map((n) => n.ch).join(""), "AL");
  assert.ok(a.text().includes("R"));
  assert.ok(a.text().includes("L"));
});
