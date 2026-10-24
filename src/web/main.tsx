import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Workspace } from "./client.js";
import "./style.css";
function App() {
  const [, refresh] = useState(0),
    [tab, setTab] = useState("table"),
    [token, setToken] = useState("local-edit"),
    [editingToken, setEditingToken] = useState("local-edit"),
    [selected, setSelected] = useState("note-a"),
    [proof, setProof] = useState<Record<string, unknown> | null>(null),
    [showAccess, setShowAccess] = useState(false),
    [draft, setDraft] = useState<string | null>(null);
  const workspace = useRef<Workspace | null>(null),
    board = useRef<HTMLDivElement>(null),
    lastCursor = useRef(0);
  useEffect(() => {
    const c = new Workspace(() => refresh((n) => n + 1), token);
    workspace.current = c;
    refresh((n) => n + 1);
    return () => c.dispose();
  }, [token]);
  const c = workspace.current,
    cards = c?.replica.cards().filter((n) => !n.deleted) || [],
    card = cards.find((n) => n.id === selected),
    other = c?.peers.filter((p) => p.actor !== c.actor) || [],
    pending = c?.pending.size || 0;
  const connected = c?.status === "connected";
  useEffect(() => {
    if (tab === "proof")
      void fetch("/api/evidence", {
        headers: { Authorization: "Bearer " + token },
      })
        .then((r) => r.json())
        .then(setProof)
        .catch(() => setProof({ status: "Evidence unavailable" }));
  }, [tab, token]);
  const download = () => {
    if (!c) return;
    const url = URL.createObjectURL(
        new Blob([c.export()], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "loom-local-draft.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="app">
      <header className="topbar">
        <a href="/" className="wordmark" aria-label="Loom home">
          <span className="woven">
            ╱╲
            <br />
            ╲╱
          </span>
          loom<span className="period">.</span>
        </a>
        <div className="room">
          <span className="room-icon">⌘</span>
          <div>
            Untitled, together<small>SHARED WORKSPACE / SYNTHETIC DEMO</small>
          </div>
        </div>
        <div className="top-actions">
          <div className="avatars">
            <span>You</span>
            {other.map((p) => (
              <span key={p.actor} title={p.actor}>
                {p.role === "view" ? "V" : p.actor.slice(0, 2).toUpperCase()}
              </span>
            ))}
          </div>
          <button className="share" onClick={() => setShowAccess(!showAccess)}>
            Workspace access ↗
          </button>
        </div>
      </header>
      <div className="ribbon">
        <nav>
          <button
            className={tab === "table" ? "active" : ""}
            onClick={() => setTab("table")}
          >
            ⌑ &nbsp; The table
          </button>
          <button
            className={tab === "proof" ? "active" : ""}
            onClick={() => setTab("proof")}
          >
            ⌁ &nbsp; The proof
          </button>
        </nav>
        <div className="sync" role="status">
          <i className={connected ? "live" : ""} />
          {connected
            ? pending
              ? `${pending} edits waiting for acknowledgement`
              : "All changes acknowledged"
            : c?.status || "Starting"}
          <span className="slash">/</span>
          <button onClick={() => c?.toggleOnline()}>
            {c?.online ? "Go offline" : "Reconnect"}
          </button>
        </div>
      </div>
      {showAccess && (
        <section className="access">
          <label>
            Bearer token
            <input
              type="password"
              value={editingToken}
              onChange={(e) => setEditingToken(e.target.value)}
            />
          </label>
          <button
            onClick={() => {
              setToken(editingToken);
              setDraft(null);
              setShowAccess(false);
            }}
          >
            Connect with token
          </button>
          <p>
            Loopback demo: local-edit / local-view. Tokens stay in memory. Open
            a second browser profile to collaborate.
          </p>
        </section>
      )}
      {c?.error && (
        <div className="error" role="alert">
          {c.error}
          <button onClick={download}>Export local draft</button>
        </div>
      )}
      {tab === "table" ? (
        <>
          <div className="intro">
            <div>
              <p className="eyebrow">A LITTLE ROOM TO THINK</p>
              <h1>
                Good ideas need
                <br />
                <em>a place to meet.</em>
              </h1>
            </div>
            <div className="intro-note">
              <span className="asterisk">✳</span>
              <p>
                Move a thought. Leave a line.
                <br />
                Go offline. Come back together.
              </p>
              <small>AN OWNED CRDT · A REAL WEBSOCKET RELAY</small>
            </div>
          </div>
          <div className="workspace">
            <section className="canvas-area">
              <div className="canvas-top">
                <span>
                  <b>01</b> The thinking surface
                </span>
                <button
                  disabled={c?.role === "view"}
                  onClick={() => {
                    if (c) setSelected(c.addCard());
                  }}
                >
                  ＋ Add a thought
                </button>
              </div>
              <div
                className="board"
                ref={board}
                onPointerMove={(e) => {
                  const rect = board.current?.getBoundingClientRect();
                  if (rect && Date.now() - lastCursor.current > 120) {
                    lastCursor.current = Date.now();
                    c?.cursor(
                      Math.max(
                        0,
                        Math.min(
                          1600,
                          ((e.clientX - rect.left) / rect.width) * 900,
                        ),
                      ),
                      Math.max(
                        0,
                        Math.min(
                          1600,
                          ((e.clientY - rect.top) / rect.height) * 620,
                        ),
                      ),
                    );
                  }
                }}
              >
                <div className="board-inner">
                  {cards.map((n, i) => (
                    <div
                      key={n.id}
                      data-card={n.id}
                      className={`note ${n.color} ${selected === n.id ? "selected" : ""}`}
                      style={{ left: `${n.x / 9}%`, top: `${n.y / 6.2}%` }}
                    >
                      <button
                        className="drag-handle"
                        aria-label={`Move ${n.id}`}
                        onPointerDown={(e) => {
                          if (c?.role === "view") return;
                          setSelected(n.id);
                          const startX = e.clientX,
                            startY = e.clientY,
                            rect = board.current!.getBoundingClientRect();
                          e.currentTarget.setPointerCapture(e.pointerId);
                          e.currentTarget.onpointermove = (ev) => {
                            const dx =
                                ((ev.clientX - startX) / rect.width) * 900,
                              dy = ((ev.clientY - startY) / rect.height) * 620;
                            c?.setCard(
                              n.id,
                              "x",
                              Math.max(0, Math.min(680, n.x + dx)),
                            );
                            c?.setCard(
                              n.id,
                              "y",
                              Math.max(0, Math.min(440, n.y + dy)),
                            );
                          };
                          e.currentTarget.onpointerup = () => {
                            e.currentTarget.onpointermove = null;
                            e.currentTarget.onpointerup = null;
                          };
                        }}
                      >
                        <span>THOUGHT {String(i + 1).padStart(2, "0")}</span>⠿
                      </button>
                      <button
                        className="note-body"
                        onClick={() => setSelected(n.id)}
                        aria-label={`Select ${n.id}`}
                      >
                        {n.text}
                      </button>
                      <span className="note-foot">
                        a work in progress <span>↗</span>
                      </span>
                    </div>
                  ))}
                  {other
                    .filter((p) => p.cursor)
                    .map((p) => (
                      <div
                        key={p.actor}
                        className="cursor"
                        style={{
                          left: `${p.cursor!.x / 9}%`,
                          top: `${p.cursor!.y / 6.2}%`,
                        }}
                      >
                        ↖<span>{p.actor.slice(0, 6)}</span>
                      </div>
                    ))}
                  <span className="coordinate">0,0 — IDEAS IN MOTION</span>
                  <span className="board-stamp">
                    Nothing here has
                    <br />
                    to be finished.
                  </span>
                </div>
              </div>
              <div className="canvas-foot">
                <span>Drag the top of a card to move it.</span>
                <span>One table · many perspectives</span>
              </div>
            </section>
            <aside className="paper">
              <div className="paper-top">
                <span>
                  <b>02</b> A shared line
                </span>
                <span>↙</span>
              </div>
              <h2>
                Put it in
                <br />
                <em>your own words.</em>
              </h2>
              <p className="paper-caption">
                Every character has an identity.
                <br />
                Concurrent edits find their place.
              </p>
              <label htmlFor="shared-text" className="sr-only">
                Shared document
              </label>
              <textarea
                id="shared-text"
                className="document"
                aria-label="Shared document"
                disabled={c?.role === "view"}
                value={draft ?? c?.replica.text() ?? ""}
                onFocus={() => setDraft(c?.beginText() || "")}
                onChange={(e) => {
                  setDraft(e.target.value);
                  c?.editText(e.target.value);
                }}
                onBlur={() => {
                  c?.endText();
                  setDraft(null);
                }}
              />
              <div className="document-foot">
                <span>
                  {Array.from(c?.replica.text() || "").length} characters
                </span>
                <span>Sequence CRDT</span>
              </div>
              <p className="focus-note">
                While you type, your draft stays in place. Leave the field to
                see concurrent changes merged.
              </p>
            </aside>
          </div>
          <section className="bottom-strip">
            <div className="selection">
              <span className="eyebrow">ON THE TABLE</span>
              {card ? (
                <>
                  <label htmlFor="card-text">Selected thought</label>
                  <input
                    id="card-text"
                    value={card.text}
                    disabled={c?.role === "view"}
                    maxLength={180}
                    onChange={(e) =>
                      c?.setCard(card.id, "text", e.target.value)
                    }
                  />
                  <div className="swatches">
                    {["lemon", "rose", "sky", "mint"].map((color) => (
                      <button
                        key={color}
                        aria-label={`Set card color ${color}`}
                        className={color}
                        disabled={c?.role === "view"}
                        onClick={() => c?.setCard(card.id, "color", color)}
                      />
                    ))}
                    <button
                      className="remove"
                      disabled={c?.role === "view"}
                      onClick={() => c?.setCard(card.id, "deleted", true)}
                    >
                      Remove thought
                    </button>
                  </div>
                </>
              ) : (
                <p>Select a card to edit its words.</p>
              )}
            </div>
            <div className="connection-card">
              <span className="eyebrow">CONNECTED, EVEN WHEN YOU’RE NOT</span>
              <h3>
                {c?.online
                  ? "One room. Different rhythms."
                  : "Your ideas can wait for the network."}
              </h3>
              <p>
                Offline edits stay in this browser tab’s saved draft. Reconnect
                to exchange missing operations. Acknowledgement follows the
                relay’s SQLite commit.
              </p>
              <button onClick={download}>Export this tab’s draft ↗</button>
            </div>
            <div className="receipt">
              <span className="eyebrow">REPLICA RECEIPT</span>
              <dl>
                <div>
                  <dt>Operation union</dt>
                  <dd data-testid="op-count">{c?.replica.ops.size || 0}</dd>
                </div>
                <div>
                  <dt>Pending acknowledgement</dt>
                  <dd data-testid="pending-count">{pending}</dd>
                </div>
                <div>
                  <dt>Other participants</dt>
                  <dd>{other.length}</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>{c?.role || "checking"}</dd>
                </div>
              </dl>
              <small>Not a global “everyone has synced” promise.</small>
            </div>
          </section>
        </>
      ) : (
        <section className="proof">
          <p className="eyebrow">THE PART WE CAN DEFEND</p>
          <h1>
            Shared state.
            <br />
            <em>Measured, not assumed.</em>
          </h1>
          <p>
            Recorded synthetic convergence and loopback WebSocket measurements.
            They do not establish a production availability or network-latency
            guarantee.
          </p>
          <pre>
            {proof
              ? JSON.stringify(proof, null, 2)
              : "Loading recorded evidence…"}
          </pre>
        </section>
      )}
      <footer>
        <span>
          loom. <small>A SHARED DRAFT, NOT A FINISHED THOUGHT.</small>
        </span>
        <span>
          Synthetic demo only · No hosted service ·{" "}
          <a href="https://github.com/rjrddy/loom">Source & evidence ↗</a>
        </span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
