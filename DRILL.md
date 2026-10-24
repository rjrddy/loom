# Loom follow-up drill

1. Why are descendants of a deleted character still traversed? The delete hides that character, not the identity anchor or its children.
2. What happens to an insertion whose parent has not arrived? It remains stored and invisible until its ancestor chain reaches ROOT.
3. How do you prevent insertion cycles? Valid anchors have a lower logical counter than the new node; a cycle would require counters to decrease and return to their start.
4. Why doesn't a duplicate change the result? Equal canonical content under one immutable ID is a no-op; the operation set remains unchanged.
5. Can a conflicting duplicate be merged? No. It violates the identity assumption and is rejected explicitly; the local outbox is retained.
6. Does each actor use an independent wall clock? No. A replica advances its logical clock from observed stamps, and actor text breaks equal-counter ties deterministically.
7. What makes per-field LWW commute? Each field takes max under the same total order, which is associative, commutative and idempotent.
8. Is a card caption a sequence CRDT? No. The document is; card captions are whole-field LWW values and concurrent values may lose by rule.
9. Can a coordinate update resurrect a removed card? No. The deletion field is independent; it must be explicitly set false to resurrect it.
10. Why did the focused editor lose unseen text? It diffed a stale displayed string against a newer materialized replica. The fix anchors edits in displayed character IDs.
11. Does the adapter handle arbitrary IME/grapheme semantics? No. It is a single code-point prefix/suffix diff; production editor behavior is future work.
12. What if the snapshot and live operations interleave? Both add immutable operations to the union. Relative transport order does not change the final valid union.
13. Why wait for READY before replaying pending operations? It lets the client learn the retained union and role before submitting its saved outbox; it also makes reconnect behavior inspectable.
14. Why retain an ACKed operation locally? It is part of the replica union. ACK removes its pending status, not its history.
15. How is a second relay fenced? SQLite exclusive locking retains the database lock between commits. The tests actually open a competitor and require failure.
16. Does SIGKILL prove power-loss safety? No. It proves the tested process restart/recreation path retains acknowledged state; FULL synchronous mode is a requested storage policy, not a power-loss experiment.
17. What detects a silent dead connection? WebSocket protocol ping/pong plus a deadline, followed by client reconnect. The test disables automatic pongs rather than pretending a manual close is half-open detection.
18. What does the random campaign drop? Initial message deliveries while generating edits. Healing later delivers the full union, shuffled and duplicated. Permanent loss is outside its claim.
19. Why not report the measured p99 as internet p99? The offer sequence, clients, disk, polling and loopback network are different. Every raw sample and the narrower scope are retained.
20. What would make a larger multi-room service hard? Stable identities, tenant authorization, bounded history/compaction, incremental anti-entropy, storage lifecycle, security/abuse limits and replicated availability; none follows automatically from this finite local demonstration.
