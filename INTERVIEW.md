# Loom interview kit

## Two-minute pitch

Loom is a small collaborative drafting table, built to make concurrent and offline edits explainable. I wrote its sequence CRDT for text and per-field last-writer-wins registers for canvas cards. Stable character identities, retained deletes and deterministic order make reordered delivery safe. The browser saves its union/outbox locally; an authenticated WebSocket relay commits operations to SQLite before broadcasting or acknowledging them.

The strongest failure story is the focused editor regression. I kept the textarea visually stable while remote text arrived, but initially diffed the next keystroke against the newer replica. That deleted unseen remote characters. A real two-browser-context test caught it. The fix diffs against the IDs actually displayed, leaving unseen remote inserts intact; blur reveals the merged result. The failing run is retained.

I measured a seeded partition/reorder/drop campaign and actual durable loopback WebSocket propagation. Exact trial counts, final union hashes, raw latency samples and machine scope are in docs/results/benchmark.json and the generated README. The scope is deliberately local: finite trials with eventual delivery, one relay, bounded operation storage, shared roles and no universal intention-preservation, internet-latency or human-productivity claim.

## Ten-minute architecture walkthrough

Start in `core.ts`: actor/counter identities, logical stamps, strict schema and canonical duplicate checks. Draw a parent/child insertion tree, order concurrent siblings, deliver a delete before its target and show that descendants of a tombstone remain visible. Explain why lower-clock anchors prevent cycles. Show the actual union and materialized text agreeing after shuffled full delivery.

Then explain canvas objects. Each field chooses the maximum logical stamp under a total actor tie-break. Independent fields merge, while competing captions choose a winner. A deletion register does not physically remove history. Discuss why offline replicas prevent casual tombstone garbage collection and why the operation budget is explicit.

Walk through the textarea adapter: capture displayed IDs on focus, compute a single prefix/suffix replacement, generate identity-based operations, preserve remote insertions not in that base. Show the retained failing browser run and the regression. This is a small code-point editor, not a full rich-text/IME/undo system.

Follow the browser outbox through local save, network-offline switch, actual frame drops, page reload and reconnect. The relay authenticates before sending a union, asynchronously streams snapshot chunks, then signals READY. Pending operations are resent with the same IDs; a lost ACK becomes a deduplicated success. A local ACK counter is not proof that every participant is synchronized.

Inspect SQLite ownership. Exclusive locking fences another relay, FULL transactions commit before broadcast/ACK, and the OS releases the lock after process death. Native SIGKILL/restart and Linux named-volume recreation check acknowledged union equality; they do not establish power-loss durability or HA.

Finish with actual WebSocket roles/actor/collision gates, presence/heartbeat, finite log canaries, seeded convergence evidence and the loopback propagation curve. Show the original direct-manipulation interface, proof sheet and one-command independent-clone demo. Separate recorded measurements from live collaboration and call out the unmeasured production/human claims.

## Five tradeoffs

- An owned character tree is inspectable and handles late deletes, but retains history and rematerializes the view instead of using a production optimized sequence index.
- Per-field LWW gives deterministic canvas merges, but same-field concurrent values can lose by rule and a coordinate pair is not an atomic drag transaction.
- Full union exchange is easy to verify after reconnect, but costs bandwidth and memory proportional to retained history.
- Exclusive SQLite commits give simple single-relay ownership and restart behavior, but prevent multi-writer scaling and can block the Node event loop during disk work.
- A stable focused draft avoids cursor/content jumps and preserves unseen insertions, but merged remote content is revealed on blur rather than implementing collaborative selections/IME/rich text.

## Five failure modes

- Delete arrives before insert: retain the delete, then hide the target when it arrives; preserve descendants under its tombstoned anchor.
- Relay commits but ACK is lost: pending ID is resent; equal canonical content deduplicates rather than creates another operation.
- Competing process opens the same database: SQLite exclusive lock rejects it; do not run independent in-memory caches on one file.
- Transport silently stops: protocol ping/pong terminates unresponsive sockets; the client retries and exchanges its union/outbox when delivery returns.
- A focused draft receives unseen remote text: diff against displayed IDs, not the newer replica; the real regression is retained. Capacity/storage failures are surfaced and pending content must be exported deliberately.

## Fifteen likely questions

1. What is the convergence argument? Immutable operation-set union, deterministic tree traversal with retained deletes, and per-field max registers. The argument assumes valid nonconflicting IDs, eventual delivery and enough capacity.
2. Why not use string offsets on the wire? Another participant can shift them before delivery. Stable anchor/target identities survive that change.
3. Why keep a deleted node? Other inserts may still refer to it, including from offline replicas. Removing it prematurely can change ordering or hide descendants.
4. Does convergence preserve every user's intention? No. Same-field LWW chooses a value, and a simple sequence CRDT is not a general intention-preservation proof.
5. Why a Lamport/actor order? It gives deterministic causal priority and a total tie-break without trusting wall-clock synchronization.
6. What if two actors reuse an ID with different content? It is an explicit collision. The relay rejects the conflicting proposal; local pending edits are retained for deliberate reconciliation, not silently rewritten.
7. Can permanent network loss converge? No. The campaign drops initial deliveries and later restores every operation through anti-entropy. It does not claim permanent-loss convergence.
8. What does ACK establish? That this relay committed the operation ID. It does not establish every peer's receipt or production backup durability.
9. Why exclusive SQLite rather than an invented file lock? SQLite already has OS-backed locking and transaction recovery; the actual fence/restart tests exercise that behavior.
10. What if the server dies between commit and broadcast? Restart loads the committed operation; reconnect snapshot or duplicate resend supplies it to peers.
11. Why is browser persistence not absolute durability? Quota, user clearing, session actor cloning, private browsing or failed writes can defeat it. The UI reports storage failures and supports export; no browser-vendor durability guarantee is claimed.
12. What exactly does latency measure? Loopback Node WebSocket send until both other Node replicas applied, after relay SQLite commit, with sequential offers and polling-limited observation. Not browser or internet p99.
13. Is presence durable identity? No. It is transient cursor metadata bound to an authenticated connection and removed on disconnect.
14. What is missing for production access control? Individual identities, room/tenant permissions, credential lifecycle, hardened deployment, backup and operational policy. Shared demo tokens are a limited role boundary.
15. Where is the project partial? Human collaboration benefit, a production editor, larger/held-out network and workload coverage, and hosted durable availability are not established. The stated local convergence/reconnect scope is assessed separately in QUALITY.md.

## Three more months

Optimize sequence indexing and anti-entropy while retaining a reference implementation; add causally safe compaction, grapheme/IME support, undo and shared selections; run larger held-out schedules and real browser/network latency campaigns; implement individual room permissions and durable hosted storage with backup/recovery drills; conduct a blinded usability/collaboration study before claiming human benefit. Keep losing/failing measurements instead of silently narrowing the corpus.
