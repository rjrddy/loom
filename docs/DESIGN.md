# Loom: convergence needs more than a shared string

A text offset changes under somebody else's edit. A delete may arrive before its insertion. Two offline participants can assign the same logical time to different updates. A relay can commit an operation and lose the acknowledgement. A focused textarea can accidentally delete text the user never saw. Loom separates these problems instead of solving them with last-message-wins replacement of the entire document.

## Owned sequence core

Each insert has an immutable actor/counter ID, a Lamport/actor stamp, an anchor ID and one Unicode code point. ROOT is the start anchor. Children are ordered by descending logical time, then an ASCII actor tie-break; traversal emits the deterministic tree order. An anchor's counter must precede its child's counter, preventing cycles. Missing ancestors remain stored but invisible until their chain connects. Iterative traversal avoids recursion-depth failure on long chains.

Deletes reference identities, not mutable offsets. The union retains delete operations even when the target insert has not arrived. Tombstoned nodes still anchor descendants; they are not physically removed. Thus receiving a delete before its target neither loses it nor deletes a later sibling incorrectly. There is no tombstone garbage collection, because safe reclamation needs knowledge about offline replicas that this small workspace does not have.

All valid operations are retained in an ID map. Repeating the same ID and canonical content is idempotent. Reusing an ID for different content is an explicit collision, not a silent overwrite. Convergence assumes distinct participant actors, nonconflicting IDs, a union within the operation budget and eventual delivery. A permanently partitioned participant cannot converge. The seeded trials are finite empirical evidence, not a formal universal proof.

## Canvas registers

Each object field is an independent max register under the total Lamport/actor order. Max is associative, commutative and idempotent, so each field agrees after the same union arrives. Concurrent movement and text/color updates can merge independently. Two concurrent updates to the same field choose one value by the documented order; this is not an intention-preserving text merge. A boolean register tombstones the object, and later field updates do not implicitly resurrect it.

The canvas uses a fixed logical surface with responsive CSS coordinates. Cards can overlap; there is no diagram layout engine, zoom/pan/infinite-world implementation or group move transaction. A drag updates coordinates independently. The text document uses the sequence CRDT; the card caption uses a whole-field register.

## The actual editor failure

The first browser regression kept a textarea draft visually stable while remote operations arrived, but diffed the next input against the newer replica text. That turned unseen remote characters into deletions. The real two-context run is retained in `results/caught-focused-draft.log`. The fix keeps the character identities shown to the focused editor and diffs against that base. New local inserts use stable anchors and remote insertions remain in the union. On blur the editor reveals the full merged view. A dedicated unit regression and real browser test cover this boundary.

This is a single contiguous code-point prefix/suffix diff, not a production collaborative editor. Grapheme-aware cursor movement, IME composition, rich text, undo, shared selections and general intention preservation remain out of scope. Text/operation limits reject before the planned sequence mutation. On storage failure the UI warns that in-memory edits must be exported before closing.

## Persistence and acknowledgement

The relay uses built-in Node SQLite rather than inventing a transactional database. DELETE journal mode, FULL synchronous commits and exclusive locking mode are explicit. An initial exclusive transaction acquires the writer lock; SQLite retains it between commits in exclusive mode. A second relay opening the same database fails rather than broadcasting from a stale cache. Real native and Linux-container checks exercise the fence. Process death releases the OS lock; SQLite recovers its journal before normal reads. SIGKILL/restart and actual named-volume container recreation are separate proofs, not power-loss experiments.

Operation validation and collision/capacity checks precede insertion. The SQLite insert commits before the in-memory union is published, broadcast, or acknowledged. If a process dies after commit but before ACK, the client keeps the operation in its outbox; retransmission is a deduplicated success. If the database commit fails, no successful ACK is manufactured. Local-disk corruption fails startup; this is not a replicated backup or HA system.

## Reconnect and offline state

The browser stores its retained union and pending outbox together in tab-scoped local storage keyed by a session actor. Tokens stay in memory. Reload preserves the session actor and pending operations; a cloned tab may copy the session actor and is deliberately rejected as an active duplicate. Independent browser profiles/contexts are the demonstrated participant boundary.

On connection the token-authenticated relay sends the retained operation union in asynchronously flushed chunks, then READY. Concurrent live broadcasts may interleave with the snapshot; immutable set union makes that order harmless. Only then does the client resend unacknowledged operations. Duplicates do not create another database record. ACK removes only that operation from the local outbox. It does not certify that every other participant has received it. An old or cleared browser store cannot recover an operation that never reached the relay.

The UI's offline switch closes transport while editing continues locally. The browser test separately blocks only WebSocket frames, reloads over HTTP, checks the saved pending text, restores delivery, and observes convergence with another live participant. This is offline editing of an already loaded workspace, not a service-worker/PWA guarantee that an unvisited or uncached page loads without HTTP.

## Failure boundaries and controls

The relay checks a bounded operation schema, actor binding, read-only role, input frame size, connection count, per-peer message rate and outbound buffering. Hello has a deadline. Protocol ping/pong detects an unresponsive connection; clients retry closed connections. Presence cursors are range-checked ephemeral metadata and disappear on disconnect. A heartbeat test suppresses actual protocol pongs using a short test interval; the production interval is a configuration default, not a latency measurement.

Shared edit/view bearer tokens are demo access control, not individual accounts or Byzantine consensus. Authorized hostile editors can consume the finite operation budget; counter/identity abuse and copied local state are not solved by the CRDT. Rejected local pending operations are retained and surfaced rather than silently rolled back or reported as committed. Operators may need to export/reconcile them deliberately.

Structured operational logs contain only controlled event/error codes and no text, raw WebSocket bodies, bearer tokens or HTTP request URLs. A malformed HTTP-version canary is tested before routing. This finite test is not a security certification. Only synthetic demo content is seeded. No analytics, external fonts, hosted service or model APIs are used.

## Measured scope

The full campaign records its PRNG seed, operation count and final union hash for every successful trial. It delivers random old operations during generation, drops initial deliveries, shuffles/deduplicates during healing, and compares exact operation unions plus text and canvas materializations. All replicas eventually receive every operation. It does not pretend permanent message loss converges.

Propagation uses actual WebSockets and SQLite commits, with separate Node client replicas. A sequential offer completes when both other clients have applied it. Raw samples, quantile method, polling resolution and machine are retained. It is neither internet/browser p99 nor saturation throughput. Browser proof uses independent contexts and actual controls. Human collaboration effectiveness is not measured.

## Primary references

- CRDT sequence/order background: https://www.bartoszsypytkowski.com/operation-based-crdts-arrays-2/ (conceptual reference; no code imported).
- SQLite exclusive locking: https://www.sqlite.org/pragma.html#pragma_locking_mode
- SQLite synchronous policy: https://www.sqlite.org/pragma.html#pragma_synchronous
- Node SQLite: https://github.com/nodejs/node/blob/v22.x/doc/api/sqlite.md
- WebSocket implementation: https://github.com/websockets/ws
- Outside UI reference: https://docs.excalidraw.com/docs/introduction/development . Direct manipulation and a separate collaboration relay informed the task layout; no Excalidraw components, assets or CRDT code are used.
