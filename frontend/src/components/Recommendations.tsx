import { useEffect, useState } from "react";
import {
  getRecommendations,
  generateRecommendations,
  recommendationFeedback,
  type Recommendation,
} from "../api";
import type { ScreenProps } from "../state";
import { ExternalLink, Panel } from "./Common";
export default function Recommendations({
  founder: s,
  reviewDecision,
}: ScreenProps) {
  const [items, setItems] = useState<Recommendation[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const profileKey = JSON.stringify([
    s.name,
    s.type,
    s.model,
    s.city,
    s.state,
    s.budget,
    s.legalStructure,
    s.details,
  ]);
  useEffect(() => {
    let active = true;
    const load = () =>
      void getRecommendations(s.businessId)
        .then((rows) => {
          if (active && Array.isArray(rows)) {
            setItems(rows);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    load();
    window.addEventListener("launchpilot-decision", load);
    return () => {
      active = false;
      window.removeEventListener("launchpilot-decision", load);
    };
  }, [s.businessId, profileKey]);
  async function generate() {
    setBusy(true);
    setError("");
    try {
      setItems(await generateRecommendations(s.businessId));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Recommendations are unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function feedback(id: string, action: string) {
    setBusy(true);
    setError("");
    try {
      const result = await recommendationFeedback(s.businessId, id, action);
      if (result.proposal) reviewDecision?.(result.proposal);
      else
        setItems((old) =>
          old.map((r) =>
            r.id === id ? { ...r, status: result.status || r.status } : r,
          ),
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save feedback.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ marginTop: 18 }}>
      <Panel>
        <h2>Personalized recommendations</h2>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => void generate()}
        >
          Generate recommendations
        </button>
        {busy && (
          <p className="mini muted" role="status">
            Preparing your recommendations…
          </p>
        )}
        {!busy && !items.length && !error && (
          <p className="empty">
            Get suggestions based on your confirmed profile. You can save them
            for later or review an action before accepting it.
          </p>
        )}
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
        {(["next_actions", "alternatives", "risks", "questions"] as const).map(
          (category) => {
            const rows = items.filter(
              (r) => r.category === category && r.status !== "dismissed",
            );
            return rows.length ? (
              <section key={category}>
                <h3>
                  {
                    {
                      next_actions: "Recommended next actions",
                      alternatives: "Alternatives worth considering",
                      risks: "Potential risks or blockers",
                      questions: "Questions to clarify",
                    }[category]
                  }
                </h3>
                {rows.map((r) => (
                  <article key={r.id} className="taskbox">
                    <h4>{r.title}</h4>
                    <span className="pill">
                      {r.status}
                      {r.stale ? " · older profile" : ""}
                    </span>
                    <p>
                      <strong>{r.action}</strong>
                    </p>
                    <p>{r.explanation}</p>
                    <p>Why it fits: {r.fit}</p>
                    {(
                      [
                        "advantages",
                        "tradeoffs",
                        "assumptions",
                        "missing_information",
                      ] as const
                    ).map((key) =>
                      r[key].length ? (
                        <div key={key}>
                          <strong className="mini">
                            {key.replaceAll("_", " ")}
                          </strong>
                          <ul>
                            {r[key].map((text, i) => (
                              <li key={i}>{text}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null,
                    )}
                    {r.sources.map((source, i) => (
                      <p key={i}>
                        <ExternalLink href={source.url}>
                          {source.title} ↗
                        </ExternalLink>
                      </p>
                    ))}
                    <div className="row">
                      <button
                        className="btn small"
                        disabled={busy || r.stale || r.status === "accepted"}
                        onClick={() => void feedback(r.id, "accept")}
                      >
                        Review & accept
                      </button>
                      <button
                        className="btn small secondary"
                        disabled={busy}
                        onClick={() => void feedback(r.id, "save")}
                      >
                        Save recommendation
                      </button>
                      <button
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => void feedback(r.id, "dismiss")}
                      >
                        Dismiss recommendation
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            ) : null;
          },
        )}
        <p className="mini muted">
          Suggestions are based on confirmed facts and labelled assumptions.
          They are not guarantees of success. Changes require your confirmation.
        </p>
      </Panel>
    </div>
  );
}
