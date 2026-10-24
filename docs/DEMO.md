# Run and record Loom

Prerequisite: Node with npm; CI and the image use Node 22. The measured local Node version is recorded under results. Built-in SQLite may emit its experimental API warning. No database account, model, external font or paid service is needed.

```
make demo
```

Open http://127.0.0.1:8097 . Local access is `local-edit` or `local-view`; Workspace access changes the memory-only bearer. Open a separate browser profile/context for a second participant. Duplicated tabs can copy sessionStorage and are rejected as duplicate active actors. Only synthetic/demo text belongs here.

Edit the shared document, leave the field to see concurrent remote changes merged, drag a card header, edit a selected thought, add/remove/color cards and move the pointer on the board to publish presence. Switch one participant offline, type locally while the other continues, then reconnect. Pending acknowledgement counts decrease only after committed relay ACKs. The proof sheet reads recorded results; the table is live.

The default demo owns `.cache/loom.sqlite` and preserves it on Ctrl-C. LOOM_DB can select a dedicated file; do not share that path with other applications or run two relays against it. SQLite exclusive locking rejects a second writer. Server restart reloads the retained operation union. `make lint test bench` reruns native/real WebSocket/process tests and the full campaign. The CI quick campaign is separately scoped; its artifact is not presented as the laptop run.

## Genuine ninety-second capture

- Start with two independent participants; show actual remote cursors and a card moving in both.
- Focus one document while the other appends text, then type locally. Blur to reveal both edits; explain the retained focused-draft regression.
- Go offline in one participant, edit locally, edit online in the other, reconnect and show the combined view plus pending count reaching zero.
- Open the proof sheet: trial results, operation union hashes and actual loopback propagation curve. Explain eventual delivery and finite-corpus limits.
- Switch to read-only access, demonstrate disabled edits, then restore editor access and narrow the window. Human effectiveness remains not measured.

Automated proof uses Python with `requirements-browser.txt`, then `python -m playwright install chromium ffmpeg`, then `python scripts/review.py --record`. It starts/stops its own relay and temporary database, uses independent browser contexts, blocks/restores actual WebSocket frames, reloads a pending draft over HTTP, and records changed real offline operations until the target duration is reached. Inspect `ffprobe docs/results/browser/loom-demo.webm`; never pad a short recording. Existing matching Playwright caches can be selected with PLAYWRIGHT_BROWSERS_PATH.

Offline editing requires the app already loaded. This is not a service-worker/offline-first page installation. Browser quota/cleared storage and session-actor cloning are disclosed limits. Export a pending draft before deliberately clearing its local storage.

## Hosting preparation only

`docker compose up --build` uses a nonroot application and named workspace volume. Default compose credentials are synthetic local values. External binding requires distinct private LOOM_EDIT_TOKEN/LOOM_VIEW_TOKEN and TLS at the proxy. The image gate exercises actual static assets, WebSocket ACK, competing writer rejection, SIGKILL and container recreation from its named volume.

Dockerfile/Render configuration are prepared only: no account or deployment was created. Free ephemeral web storage does not preserve SQLite across recreation. A real deployment needs approved durable storage, private credentials, identities/permissions and backup/recovery policy. https://render.com/docs/free . The relay requires WebSocket support; it is not a static-only Vercel page.
