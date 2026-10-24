# Loom quality and acceptance

Status: final verification pending. The intended local scope is a single persisted relay, shared synthetic text/canvas, independent browser participants, offline outboxes and eventual-delivery convergence. No hosted service, human productivity improvement or universal CRDT proof is claimed.

| Gate | Evidence | Status |
|---|---|---|
| Hard core written and explained | Owned sequence/register core and displayed-draft adapter; DESIGN/ADRs | PASS locally |
| One-command independent clone | results/fresh-clone | Pending |
| Live UI and real offline merge | Two browser contexts, dropped WS frames, reload/outbox merge, responsive receipts | PASS locally; final capture pending |
| Unit/integration/property/failure tests | Seeded schedules, real auth/identity/collision/readonly/heartbeat, SQLite fence and SIGKILL restart | PASS locally |
| Measured benchmark | benchmark.json, per-trial hashes and raw timing samples | PASS locally; final run pending |
| Demonstrated caught failure | caught-focused-draft.log and protocol rejection receipts | PASS |
| ADRs/interview/drill | docs/adr, INTERVIEW.md, DRILL.md | Pending final documentation |
| Dependency scan | npm audit raw output | Pending final scan |
| CI/nonroot image/volume recreation | Actual Linux gates; final exact head in coordinator LOOM_CI_VERIFICATION.json | Pending |
| No unmeasured claims | Generated README from retained run; conditions and limits explicit | PASS within stated scope |

Convergence requires eventual delivery, distinct actors, nonconflicting IDs and a union within capacity. Same-field LWW updates can lose values by rule. No tombstone GC, production editor/IME/grapheme/undo support, multi-room tenant security, vector-clock optimization, HA, power-loss test or production network latency is established. Native propagation is loopback and polling-limited, not browser/internet p99. Hosting configuration is prepared only. Existing repositories remain preserved; stop before Fit.
