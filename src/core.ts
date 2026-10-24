/** Owned sequence CRDT + per-field LWW registers. No third-party CRDT runtime. */
export type Stamp = readonly [number, string];
export type Field = "x" | "y" | "text" | "color" | "deleted";
export type Op = { id: string; stamp: Stamp } & (
  | { kind: "insert"; after: string; ch: string }
  | { kind: "delete"; target: string }
  | {
      kind: "set";
      object: string;
      field: Field;
      value: number | string | boolean;
    }
);
export const ROOT = "root";
export const MAX_OPS = 15000;
export const actorValid = (actor: unknown): actor is string =>
  typeof actor === "string" && /^[a-zA-Z0-9_-]{1,48}$/.test(actor);
export function compare(a: Stamp, b: Stamp): number {
  return a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
}
function clockOf(id: string): number {
  return Number(id.slice(id.lastIndexOf(":") + 1));
}
export function validate(value: unknown): Op {
  if (!value || typeof value !== "object") throw Error("invalid_operation");
  const o = value as Op;
  if (
    !Array.isArray(o.stamp) ||
    o.stamp.length !== 2 ||
    !Number.isSafeInteger(o.stamp[0]) ||
    o.stamp[0] < 1 ||
    o.stamp[0] > 1e9 ||
    !actorValid(o.stamp[1]) ||
    o.id !== `${o.stamp[1]}:${o.stamp[0]}`
  )
    throw Error("invalid_id");
  const before = (id: unknown) =>
    typeof id === "string" &&
    /^[a-zA-Z0-9_-]{1,48}:[1-9][0-9]{0,9}$/.test(id) &&
    clockOf(id) < o.stamp[0];
  let keys: string[];
  if (o.kind === "insert") {
    keys = ["id", "stamp", "kind", "after", "ch"];
    if (
      !(o.after === ROOT || before(o.after)) ||
      typeof o.ch !== "string" ||
      Array.from(o.ch).length !== 1 ||
      /[\u0000-\u0008\u000b-\u001f\u007f]/.test(o.ch) ||
      /[\ud800-\udfff]/u.test(o.ch)
    )
      throw Error("invalid_insert");
  } else if (o.kind === "delete") {
    keys = ["id", "stamp", "kind", "target"];
    if (!before(o.target)) throw Error("invalid_delete");
  } else if (o.kind === "set") {
    keys = ["id", "stamp", "kind", "object", "field", "value"];
    if (!actorValid(o.object)) throw Error("invalid_object");
    if (o.field === "x" || o.field === "y") {
      if (
        typeof o.value !== "number" ||
        !Number.isFinite(o.value) ||
        o.value < 0 ||
        o.value > 1600
      )
        throw Error("invalid_position");
    } else if (o.field === "text") {
      if (typeof o.value !== "string" || o.value.length > 180)
        throw Error("invalid_card_text");
    } else if (o.field === "color") {
      if (!["lemon", "rose", "sky", "mint"].includes(String(o.value)))
        throw Error("invalid_color");
    } else if (o.field === "deleted") {
      if (typeof o.value !== "boolean") throw Error("invalid_tombstone");
    } else throw Error("invalid_field");
  } else throw Error("invalid_kind");
  if (Object.keys(o).sort().join() !== keys.sort().join())
    throw Error("unknown_fields");
  return JSON.parse(JSON.stringify(o)) as Op;
}
export function canonical(o: Op): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, o[k as keyof Op]]),
    ),
  );
}
export type Card = {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  deleted: boolean;
};
export class Replica {
  readonly ops = new Map<string, Op>();
  clock = 0;
  apply(input: unknown): boolean {
    const op = validate(input),
      old = this.ops.get(op.id);
    if (old) {
      if (canonical(old) !== canonical(op)) throw Error("id_collision");
      return false;
    }
    if (this.ops.size >= MAX_OPS) throw Error("workspace_full");
    this.ops.set(op.id, op);
    this.clock = Math.max(this.clock, op.stamp[0]);
    return true;
  }
  next(actor: string): { id: string; stamp: Stamp } {
    if (!actorValid(actor)) throw Error("invalid_actor");
    const n = this.clock + 1;
    return { id: `${actor}:${n}`, stamp: [n, actor] };
  }
  insert(actor: string, after: string, ch: string): Op & { kind: "insert" } {
    const op: Op = { ...this.next(actor), kind: "insert", after, ch };
    this.apply(op);
    return op;
  }
  delete(actor: string, target: string): Op & { kind: "delete" } {
    const op: Op = { ...this.next(actor), kind: "delete", target };
    this.apply(op);
    return op;
  }
  set(
    actor: string,
    object: string,
    field: Field,
    value: number | string | boolean,
  ): Op {
    const op: Op = { ...this.next(actor), kind: "set", object, field, value };
    this.apply(op);
    return op;
  }
  visible(): { id: string; ch: string }[] {
    const deleted = new Set(
      [...this.ops.values()]
        .filter((o): o is Op & { kind: "delete" } => o.kind === "delete")
        .map((o) => o.target),
    );
    const children = new Map<string, (Op & { kind: "insert" })[]>();
    for (const o of this.ops.values())
      if (o.kind === "insert") {
        const list = children.get(o.after) || [];
        list.push(o);
        children.set(o.after, list);
      }
    for (const list of children.values())
      list.sort((a, b) => -compare(a.stamp, b.stamp));
    const result: { id: string; ch: string }[] = [],
      stack = [...(children.get(ROOT) || [])].reverse();
    while (stack.length) {
      const o = stack.pop()!;
      if (!deleted.has(o.id)) result.push({ id: o.id, ch: o.ch });
      stack.push(...[...(children.get(o.id) || [])].reverse());
    }
    return result;
  }
  text(): string {
    return this.visible()
      .map((n) => n.ch)
      .join("");
  }
  cards(): Card[] {
    const objects = new Map<string, Map<Field, Op & { kind: "set" }>>();
    for (const o of this.ops.values())
      if (o.kind === "set") {
        const fields =
          objects.get(o.object) || new Map<Field, Op & { kind: "set" }>();
        const old = fields.get(o.field);
        if (!old || compare(old.stamp, o.stamp) < 0) fields.set(o.field, o);
        objects.set(o.object, fields);
      }
    return [...objects]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(
        ([id, fields]) =>
          ({
            id,
            x: 80,
            y: 80,
            text: "Untitled thought",
            color: "lemon",
            deleted: false,
            ...Object.fromEntries([...fields].map(([k, v]) => [k, v.value])),
          }) as Card,
      );
  }
  all(): Op[] {
    return [...this.ops.values()].sort((a, b) => compare(a.stamp, b.stamp));
  }
  digest(): string {
    return JSON.stringify(this.all().map(canonical));
  }
}
export function seed(): Op[] {
  const r = new Replica();
  let after = ROOT;
  for (const ch of "A small space for a shared idea.\nEdit together. Keep your own rhythm.")
    after = r.insert("seed", after, ch).id;
  for (const [id, x, y, text, color] of [
    ["note-a", 110, 100, "Start with the hard question.", "lemon"],
    ["note-b", 400, 200, "What happens when we go offline?", "sky"],
    ["note-c", 215, 350, "Make the proof visible.", "rose"],
  ] as const) {
    r.set("seed", id, "x", x);
    r.set("seed", id, "y", y);
    r.set("seed", id, "text", text);
    r.set("seed", id, "color", color);
  }
  return r.all();
}
