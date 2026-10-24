export type Proof = {
  status?: string;
  environment?: { cpu: string; platform: string; arch: string; node: string };
  convergence?: {
    trials: number;
    trial_results?: {
      seed: number;
      operations: number;
      converged: boolean;
      union_sha256: string;
    }[];
    converged: number;
    operations: number;
    operations_per_trial: number;
    replicas: number;
    initial_delivery_drops: number;
    scope: string;
  };
  propagation?: {
    samples: number;
    clients: number;
    p50_ms: number;
    p99_ms: number;
    raw_ms: number[];
    scope: string;
  };
  human_collaboration_benefit?: string;
};
export function ProofView({ proof }: { proof: Proof | null }) {
  const c = proof?.convergence,
    p = proof?.propagation;
  if (!c || !p)
    return <p>{proof?.status || "Loading retained measurements…"}</p>;
  const max = Math.max(...p.raw_ms, 1),
    points = p.raw_ms
      .map(
        (value, i) =>
          `${(i / (p.raw_ms.length - 1)) * 800},${180 - (value / max) * 150}`,
      )
      .join(" ");
  return (
    <>
      <div className="proof-totals">
        <div>
          <span>CONVERGED AFTER HEALING</span>
          <strong>
            {c.converged}
            <small> / {c.trials} trials</small>
          </strong>
          <p>
            {c.operations.toLocaleString()} generated operations · {c.replicas}{" "}
            replicas per trial.
          </p>
        </div>
        <div>
          <span>OBSERVED PROPAGATION P99</span>
          <strong>
            {p.p99_ms.toFixed(3)}
            <small> ms</small>
          </strong>
          <p>
            {p.samples} sequential offers · {p.clients} Node clients · loopback.
          </p>
        </div>
        <div>
          <span>HUMAN COLLABORATION BENEFIT</span>
          <strong className="not-measured">Not measured.</strong>
          <p>Convergence evidence is not a usability or productivity study.</p>
        </div>
      </div>
      <div className="proof-body">
        <section>
          <p className="eyebrow">THE SEEDED CONVERGENCE CAMPAIGN</p>
          <h2>
            Every retained trial
            <br />
            <em>has to agree.</em>
          </h2>
          <div
            className="trial-grid"
            aria-label={`${c.converged} of ${c.trials} trials converged`}
          >
            {(c.trial_results || []).map((r) => (
              <span
                className={r.converged ? "passed" : "failed"}
                key={r.seed}
                title={`Seed ${r.seed}: ${r.converged ? "converged" : "not converged"}; ${r.operations} operations; union ${r.union_sha256.slice(0, 12)}`}
              >
                {String(r.seed).padStart(2, "0")}
              </span>
            ))}
          </div>
          <p>
            {c.operations_per_trial.toLocaleString()} operations per trial.{" "}
            {c.initial_delivery_drops.toLocaleString()} initial deliveries were
            dropped. After the partition heals, replicas exchange the full
            operation union.
          </p>
          <p className="scope">{c.scope}</p>
        </section>
        <section>
          <p className="eyebrow">
            ACTUAL WEBSOCKET SEND → OTHER REPLICAS APPLIED
          </p>
          <h2>
            The shape of
            <br />
            <em>a local round trip.</em>
          </h2>
          <svg
            viewBox="0 0 800 210"
            role="img"
            aria-label="Recorded loopback propagation latency samples"
          >
            <path d="M0 180H800" stroke="#c8ccbd" />
            <polyline
              points={points}
              fill="none"
              stroke="#bc7358"
              strokeWidth="2"
            />
            <text x="0" y="207">
              First offer
            </text>
            <text x="680" y="207">
              Last offer
            </text>
            <text x="5" y="20">
              {max.toFixed(2)} ms peak
            </text>
          </svg>
          <div className="proof-pair">
            <span>
              p50 <b>{p.p50_ms.toFixed(3)} ms</b>
            </span>
            <span>
              p99 <b>{p.p99_ms.toFixed(3)} ms</b>
            </span>
          </div>
          <p className="scope">{p.scope}</p>
        </section>
      </div>
      <p className="machine">
        Recorded on {proof?.environment?.cpu} · {proof?.environment?.platform} /{" "}
        {proof?.environment?.arch} · {proof?.environment?.node}. These are
        retained campaign results, not live connection telemetry.
      </p>
      <details>
        <summary>Inspect the retained raw run</summary>
        <pre>{JSON.stringify(proof, null, 2)}</pre>
      </details>
    </>
  );
}
