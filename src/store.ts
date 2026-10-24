import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  Replica,
  validate,
  canonical,
  seed,
  type Op,
  MAX_OPS,
} from "./core.js";
/** Exclusive SQLite mode retains the process lock between commits; only one live relay. */
export class Store {
  readonly db: DatabaseSync;
  readonly replica = new Replica();
  constructor(path: string, seeded = true) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    try {
      this.db.exec(
        "PRAGMA journal_mode=DELETE; PRAGMA locking_mode=EXCLUSIVE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=0; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS operations (seq INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, payload TEXT NOT NULL); COMMIT;",
      );
      for (const row of this.db
        .prepare("SELECT payload FROM operations ORDER BY seq")
        .all())
        this.replica.apply(JSON.parse(String(row.payload)));
      if (seeded && !this.replica.ops.size)
        for (const op of seed()) this.accept(op);
    } catch (e) {
      this.db.close();
      throw e;
    }
  }
  accept(input: unknown): { op: Op; fresh: boolean } {
    const op = validate(input),
      old = this.replica.ops.get(op.id);
    if (old) {
      if (canonical(old) !== canonical(op)) throw Error("id_collision");
      return { op: old, fresh: false };
    }
    if (this.replica.ops.size >= MAX_OPS) throw Error("workspace_full");
    this.db
      .prepare("INSERT INTO operations(id,payload) VALUES (?,?)")
      .run(op.id, canonical(op));
    this.replica.apply(op);
    return { op, fresh: true };
  }
  close(): void {
    this.db.close();
  }
}
