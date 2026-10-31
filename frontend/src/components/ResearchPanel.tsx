import { useEffect, useRef, useState } from "react";
import {
  getResearchStatus,
  getResearchedRequirements,
  startResearch,
  type ResearchStatus,
  type RegulatoryRequirement,
} from "../api";
import type { ScreenProps } from "../state";
import { Panel } from "./Common";
import RegulatoryGuide from "./RegulatoryGuide";
export default function ResearchPanel({ founder: s, reload }: ScreenProps) {
  const [status, setStatus] = useState<ResearchStatus | null>(null),
    [findings, setFindings] = useState<RegulatoryRequirement[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const notified = useRef("");
  const profileKey = [
    s.businessId,
    s.type,
    s.model,
    s.city,
    s.state,
    s.legalStructure,
    s.name,
    s.budget,
    s.ownershipDetails,
    s.idea,
    JSON.stringify(s.details),
  ].join("|");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const [next, rows] = await Promise.all([
          getResearchStatus(s.businessId),
          getResearchedRequirements(s.businessId),
        ]);
        if (!active) return;
        setStatus(next);
        setFindings(Array.isArray(rows) ? rows : []);
        setError("");
        if (next.status === "queued" || next.status === "running")
          timer = setTimeout(poll, 1500);
        if (
          next.status === "complete" &&
          next.id &&
          notified.current !== next.id
        ) {
          notified.current = next.id;
          await reload?.();
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Research results could not be loaded.",
          );
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    profileKey,
    status?.id,
    status?.status === "queued",
    reload,
    s.businessId,
  ]);
  async function begin(refresh = false) {
    setBusy(true);
    setError("");
    setSelected(null);
    try {
      const next = await startResearch(s.businessId, refresh);
      setStatus(next);
      if (next.status === "complete") {
        setFindings(await getResearchedRequirements(s.businessId));
        await reload?.();
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Research could not be started.",
      );
    } finally {
      setBusy(false);
    }
  }
  const running = status?.status === "queued" || status?.status === "running";
  const selection = findings.find((r) => r.id === selected);
  return (
    <div style={{ marginBottom: 20 }}>
      <Panel>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Live government research</h2>
          <div className="row">
            <button
              className="btn"
              disabled={
                busy ||
                running ||
                !s.type ||
                !(s.model || s.idea || s.details.activities?.length) ||
                !s.city ||
                !s.state
              }
              onClick={() => void begin()}
            >
              Research Regulations
            </button>
            {status?.id && (
              <button
                className="btn secondary"
                disabled={busy || running}
                onClick={() => void begin(true)}
              >
                Refresh research ↻
              </button>
            )}
          </div>
        </div>
        <p className="muted">
          Research official agencies for your saved industry, business model,
          location, and legal structure. Coverage depends on the available
          government evidence.
        </p>
        {(!s.city || !s.state) && (
          <p className="mini muted">
            Save your city and state in Legal & Compliance or Discover before
            starting research.
          </p>
        )}
        {status && (
          <p
            className={status.status === "failed" ? "warn" : "mini muted"}
            role="status"
          >
            {running ? "◌ " : ""}
            {status.stage.replaceAll("_", " ")} · {status.message}
          </p>
        )}
        {status?.stale && status.status === "complete" && (
          <p className="warn">
            Your research needs revalidation. Refresh it before relying on these
            findings.
          </p>
        )}
        {status?.completed_at && (
          <p className="mini muted">
            {status.status === "complete" ? "Last checked" : "Last attempt"}{" "}
            {new Date(status.completed_at).toLocaleString()}
            {status.expires_at
              ? ` · Cache expires ${new Date(status.expires_at).toLocaleString()}`
              : ""}
          </p>
        )}
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
        {status?.warnings?.length ? (
          <details>
            <summary className="link">Coverage and verification notes</summary>
            <ul className="muted">
              {status.warnings.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </details>
        ) : null}
        {!selection && findings.length > 0 && (
          <>
            <h3>Applicable and potentially applicable requirements</h3>
            {findings
              .filter((r) => r.applicability !== "not_applicable")
              .map((r) => (
                <div className="req" key={r.id}>
                  <strong>{r.name}</strong>
                  <p className="mini muted">
                    {r.agency} · {r.jurisdiction} ·{" "}
                    {r.applicability.replaceAll("_", " ")}
                    {r.needs_revalidation ? " · Needs revalidation" : ""}
                  </p>
                  <button
                    className="btn small secondary"
                    onClick={() => setSelected(r.id)}
                  >
                    View Guide →
                  </button>
                </div>
              ))}
            <details>
              <summary className="link">
                Findings assessed as not applicable
              </summary>
              {findings
                .filter((r) => r.applicability === "not_applicable")
                .map((r) => (
                  <div className="req" key={r.id}>
                    <strong>{r.name}</strong>
                    <p className="mini muted">{r.reason}</p>
                    <button
                      className="btn small secondary"
                      onClick={() => setSelected(r.id)}
                    >
                      View Guide →
                    </button>
                  </div>
                ))}
            </details>
          </>
        )}
        {status?.status === "complete" && !findings.length && (
          <p className="warn">
            No supported requirements were extracted. This does not mean your
            business has no obligations. Check the coverage notes and confirm
            with the agencies.
          </p>
        )}
        {selection && (
          <RegulatoryGuide
            founder={s}
            requirementId={selection.id}
            finding={selection}
            onBack={() => setSelected(null)}
          />
        )}
      </Panel>
    </div>
  );
}
