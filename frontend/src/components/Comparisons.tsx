import { useEffect, useState } from "react";
import {
  getComparison,
  generateComparison,
  proposeDecision,
  type Comparison,
} from "../api";
import type { ScreenProps } from "../state";
import { ExternalLink, Panel } from "./Common";
import { FollowupQuestions } from "./DiscoveryAdvisor";
import { answerDiscovery } from "../api";
import ResearchPanel from "./ResearchPanel";
export default function Comparisons(
  props: ScreenProps & { kind?: "models" | "structures" },
) {
  const { founder: s, reviewDecision, kind = "models" } = props;
  const [data, setData] = useState<Comparison | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const signature = JSON.stringify([
    s.type,
    s.model,
    s.budget,
    s.city,
    s.state,
    s.legalStructure,
    s.details,
  ]);
  useEffect(() => {
    let active = true;
    void getComparison(s.businessId, kind)
      .then((result) => {
        if (active && Array.isArray(result.options)) {
          setData(result);
          setSelected(result.options.slice(0, 2).map((o) => o.id));
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [s.businessId, signature, kind]);
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const result = await generateComparison(s.businessId, kind);
      setData(result);
      setSelected(result.options.slice(0, 2).map((o) => o.id));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not generate comparison.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function choose(id: string) {
    setBusy(true);
    setError("");
    try {
      const proposal = await proposeDecision(
        s.businessId,
        kind === "models"
          ? { business_model: id }
          : { legal_structure: id as typeof s.legalStructure },
        kind === "models" ? "comparison" : "structure",
      );
      reviewDecision?.(proposal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not review selection.");
    } finally {
      setBusy(false);
    }
  }
  async function answer(field: string, value: string, action: string) {
    setBusy(true);
    setError("");
    try {
      const result = await answerDiscovery(s.businessId, field, value, action);
      reviewDecision?.(result.proposal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not review answer.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div style={{ marginTop: 18 }}>
      <Panel>
        <h2>
          {kind === "models"
            ? "Compare business models"
            : "Compare business structures"}
        </h2>
        <p className="muted">
          Select two or more options to compare side by side.{" "}
          {kind === "structures"
            ? "Ownership, funding, hiring, risk and growth plans help frame the trade-offs."
            : "Evaluate fit with your budget, location, customers and goals."}
        </p>
        <button
          className="btn secondary"
          disabled={busy || (kind === "models" && !s.type)}
          onClick={() => void generate()}
        >
          Personalize comparison with AI
        </button>
        {busy && (
          <p className="mini muted" role="status">
            Preparing your comparison or selection review…
          </p>
        )}
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
        {data && (
          <>
            <p className="mini muted">
              {data.mode === "live"
                ? "AI-generated qualitative comparison"
                : "Guided educational comparison"}{" "}
              · {data.explanation}
            </p>
            <div className="toggle">
              {data.options.map((option) => (
                <label key={option.id} className="pill">
                  <input
                    type="checkbox"
                    checked={selected.includes(option.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, option.id]
                          : selected.filter((id) => id !== option.id),
                      )
                    }
                  />{" "}
                  Compare {option.name}
                </label>
              ))}
            </div>
            {selected.length < 2 && (
              <p className="empty">
                Select at least two options above to compare their trade-offs.
              </p>
            )}
            <div className="cards comparison-cards">
              {data.options
                .filter((o) => selected.includes(o.id))
                .map((option) => (
                  <article
                    key={option.id}
                    className={`option ${option.id === (kind === "models" ? s.model : s.legalStructure) ? "selected" : ""}`}
                  >
                    {option.id ===
                      (kind === "models" ? s.model : s.legalStructure) && (
                      <span className="pill">Your selected option</span>
                    )}
                    {kind === "structures" &&
                      option.id === "corporation" &&
                      s.details.investment_plans === "yes" && (
                        <span className="pill">
                          Worth discussing for your funding goals
                        </span>
                      )}
                    <h3>{option.name}</h3>
                    <p>{option.fit}</p>
                    <details className="comparison-details">
                      <summary className="link">
                        Costs, operations & regulatory considerations
                      </summary>
                      <dl>
                        {(
                          [
                            "startup_costs",
                            "operational_complexity",
                            "customer_acquisition",
                            "scalability",
                            "location_requirements",
                            "regulatory_considerations",
                          ] as const
                        ).map((key) => (
                          <div key={key}>
                            <dt className="field">
                              {key.replaceAll("_", " ")}
                            </dt>
                            <dd
                              className="muted mini"
                              style={{ marginLeft: 0 }}
                            >
                              {option[key]}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                    {(
                      [
                        "advantages",
                        "disadvantages",
                        "risks",
                        "assumptions",
                        "missing_information",
                      ] as const
                    ).map((key) => (
                      <details
                        key={key}
                        open={key === "advantages" || key === "disadvantages"}
                      >
                        <summary className="mini link">
                          {key.replaceAll("_", " ")}
                        </summary>
                        <ul>
                          {option[key].map((text, i) => (
                            <li key={i}>{text}</li>
                          ))}
                        </ul>
                      </details>
                    ))}
                    {option.sources.map((source, i) => (
                      <p key={i}>
                        <ExternalLink href={source.url}>
                          {source.title} ↗
                        </ExternalLink>
                        <small>{source.excerpt}</small>
                      </p>
                    ))}
                    <button
                      className="btn small"
                      disabled={busy}
                      onClick={() => void choose(option.id)}
                    >
                      Review {option.name}
                    </button>
                  </article>
                ))}
            </div>
            {kind === "structures" && (
              <>
                <button
                  className="btn ghost small"
                  style={{ marginTop: 12 }}
                  disabled={busy}
                  onClick={() => void choose("undecided")}
                >
                  Leave structure undecided
                </button>
                <p className="warn">
                  Educational comparison, not legal or tax advice. An LLC does
                  not automatically determine tax treatment or provide complete
                  liability protection. State-specific rules require official
                  evidence and may need professional review.
                </p>
                <FollowupQuestions
                  questions={data.questions}
                  onAnswer={(...args) => void answer(...args)}
                  busy={busy}
                />
              </>
            )}
          </>
        )}
      </Panel>
      {kind === "structures" && (
        <div style={{ marginTop: 18 }}>
          <ResearchPanel {...props} />
        </div>
      )}
    </div>
  );
}
