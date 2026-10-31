import LaunchForm from "./LaunchForm";
import DiscoveryAdvisor from "./DiscoveryAdvisor";
import { useEffect, useState } from "react";
import { DATA } from "../data";
import type { ScreenProps } from "../state";
import {
  getComparison,
  generateComparison,
  proposeDecision,
  launchBusiness,
  type Comparison,
} from "../api";
export function BusinessSelector({
  founder: s,
  update,
  compact = false,
  simple = false,
}: ScreenProps & { compact?: boolean; simple?: boolean }) {
  const business = DATA[s.type];
  const chooseType = (type: string) =>
    update({ type, model: "", reqIndex: 0, activeTask: 0 });
  const chooseModel = (model: string) =>
    update({ model, reqIndex: 0, activeTask: 0 });
  if (compact)
    return (
      <>
        <div className="row">
          <strong>Business type:</strong>
          {Object.entries(DATA).map(([key, b]) => (
            <button
              key={key}
              className={`btn small ${s.type === key ? "" : "ghost"}`}
              onClick={() => chooseType(key)}
            >
              {b.icon} {b.name}
            </button>
          ))}
        </div>
        {business && (
          <div className="row" style={{ marginTop: 16 }}>
            <strong>Business model:</strong>
            {business.models.map((m) => (
              <button
                key={m.id}
                className={`btn small ${s.model === m.id ? "" : "ghost"}`}
                onClick={() => chooseModel(m.id)}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
      </>
    );
  return (
    <>
      {!simple && (
        <div className="chat">
          <div className="ai">✦ LaunchPilot · Guided discovery</div>
          <p>
            {business ? (
              <>
                You're exploring a{" "}
                <strong>{business.name.toLowerCase()}</strong>.{" "}
                {business.question}
              </>
            ) : (
              "What kind of company would you like to start?"
            )}
          </p>
        </div>
      )}
      <div className={simple ? "simple-model-list" : "cards"}>
        {!business
          ? Object.entries(DATA).map(([key, b]) => (
              <button
                key={key}
                className="option"
                onClick={() => chooseType(key)}
              >
                <div className="icon">{b.icon}</div>
                <h3>{b.name}</h3>
                {!simple && (
                  <p>
                    Explore tailored business models, planning and regulatory
                    considerations.
                  </p>
                )}
              </button>
            ))
          : business.models.map((m) => (
              <button
                key={m.id}
                className={`option ${s.model === m.id ? "selected" : ""}`}
                onClick={() => chooseModel(m.id)}
              >
                <div className="icon">{m.icon}</div>
                <h3>{m.name}</h3>
                <p>{m.description}</p>
                {!simple && (
                  <ul>
                    {m.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                {s.model === m.id && <span className="pill">✓ SELECTED</span>}
              </button>
            ))}
      </div>
      <div className="row" style={{ marginTop: 23 }}>
        {business && (
          <button className="btn secondary" onClick={() => chooseType("")}>
            ← Change industry
          </button>
        )}
        {s.model && (
          <button className="btn" onClick={() => update({ page: "roadmap" })}>
            Build my roadmap →
          </button>
        )}
        {!simple && (
          <button
            className="btn ghost"
            onClick={() => update({ page: "legal" })}
          >
            Skip to legal & compliance ↗
          </button>
        )}
      </div>
    </>
  );
}
export default function Onboarding(props: ScreenProps) {
  const s = props.founder;
  const [editing, setEditing] = useState(false);
  const [pendingChange, setPendingChange] = useState(false);
  const [advice, setAdvice] = useState(false),
    [comparison, setComparison] = useState<Comparison | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setComparison(null);
    if (s.type)
      void getComparison(s.businessId, "models")
        .then((r) => {
          if (active) setComparison(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [s.businessId, s.type, s.model, s.budget, s.city, s.state, s.details]);
  async function compare() {
    setBusy(true);
    setError("");
    try {
      setComparison(await generateComparison(s.businessId, "models"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function choose(id: string) {
    setBusy(true);
    setError("");
    try {
      props.reviewDecision?.(
        await proposeDecision(
          s.businessId,
          { business_model: id },
          "comparison",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function launch() {
    if (!s.type || !s.city.trim() || !s.state.trim() || !(s.idea?.trim() || s.details.activities?.length)) {
      setEditing(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await launchBusiness(s.businessId);
      await props.reload?.();
      props.update({ page: "roadmap" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (editing) return <LaunchForm
    businessId={s.businessId}
    onBack={() => setEditing(false)}
    onDone={async () => {
      await props.reload?.();
      setEditing(false);
      props.update({page: "roadmap"});
    }}
  />;
  return (
    <div className="exploration-flow">
      <DiscoveryAdvisor
        {...props}
        flow
        onAdvice={setAdvice}
        onPendingChange={setPendingChange}
      />
      {advice &&
        !pendingChange &&
        s.type &&
        s.type !== "other" &&
        !s.details.operating_model_label && (
          <div className="exploration-comparison">
            <h2>Compare your business options</h2>
            <p className="mini muted">
              {comparison?.mode === "live"
                ? "AI comparison based on your saved details."
                : "Compare approaches for your confirmed idea."}
            </p>
            <button
              className="text-link"
              disabled={busy}
              onClick={() => void compare()}
            >
              Compare business models with AI
            </button>
            {comparison?.mode === "live" && comparison.options?.length ? (
              <div className="exploration-options">
                {comparison.options.map((option) => (
                  <article key={option.id}>
                    <h3>{option.name}</h3>
                    <p>{option.fit}</p>
                    <div>
                      <strong>Advantages:</strong>{" "}
                      <ul>
                        {option.advantages.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Trade-offs:</strong>{" "}
                      <ul>
                        {option.disadvantages.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <p>
                      <strong>Costs:</strong> {option.startup_costs}
                    </p>
                    <p>
                      <strong>Location:</strong> {option.location_requirements}
                    </p>
                    {option.assumptions.length > 0 && (
                      <p className="mini muted">
                        Assumptions: {option.assumptions.join(" ")}
                      </p>
                    )}
                    <button
                      className="btn small secondary"
                      disabled={busy || s.model === option.id}
                      onClick={() => void choose(option.id)}
                    >
                      {s.model === option.id
                        ? "Selected"
                        : "Choose " + option.name}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">
                Compare your confirmed business details with AI to see relevant
                options.
              </p>
            )}
          </div>
        )}
      <div className="exploration-edit-details">
        <button className="text-link" disabled={busy || pendingChange} onClick={() => setEditing(true)}>Edit business details</button>
        <p className="mini muted">{pendingChange ? "Review and confirm the proposed details above first. You can then edit them here." : "Update your business description, industry, operating city and state before opening your roadmap."}</p>
      </div>
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
      {advice && (
        <div className="exploration-choices">
          <button
            className="btn"
            disabled={busy || pendingChange}
            onClick={() => void launch()}
          >
            Continue to Launch
          </button>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              document
                .querySelector<HTMLTextAreaElement>(
                  '[aria-label="Describe your business idea"]',
                )
                ?.focus();
            }}
          >
            Keep Exploring
          </button>
        </div>
      )}
    </div>
  );
}
