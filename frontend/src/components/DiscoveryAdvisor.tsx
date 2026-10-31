import { useEffect, useState } from "react";
import {
  getDiscovery,
  sendDiscovery,
  answerDiscovery,
  type DiscoveryResult,
  type Followup,
  type Decision,
} from "../api";
import type { ScreenProps } from "../state";
import AnswerContent from "./AnswerContent";
import { Panel } from "./Common";
export function FollowupQuestions({
  questions,
  onAnswer,
  busy,
}: {
  questions: Followup[];
  onAnswer: (field: string, answer: string, action: string) => void;
  busy: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const options: Record<string, string[]> = {
    formation_status: ["not_formed", "in_progress", "formed", "undecided"],
    investment_plans: ["yes", "no", "undecided"],
    liability_exposure: ["low", "medium", "high", "undecided"],
    hire_employees: ["yes", "no", "undecided"],
  };
  return (
    <>
      {questions.slice(0, 2).map((q) => (
        <div key={q.field} className="taskbox">
          <label className="field" htmlFor={"followup-" + q.field}>
            {q.text}
          </label>
          {options[q.field] ? (
            <select
              id={"followup-" + q.field}
              className="input"
              value={answers[q.field] || ""}
              onChange={(e) =>
                setAnswers({ ...answers, [q.field]: e.target.value })
              }
            >
              <option value="">Choose an answer</option>
              {options[q.field].map((v) => (
                <option key={v} value={v}>
                  {v.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              id={"followup-" + q.field}
              value={answers[q.field] || ""}
              onChange={(e) =>
                setAnswers({ ...answers, [q.field]: e.target.value })
              }
              maxLength={4000}
            />
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="btn small"
              disabled={busy || !answers[q.field]}
              onClick={() => onAnswer(q.field, answers[q.field], "answer")}
            >
              Review answer
            </button>
            <button
              className="btn small ghost"
              disabled={busy}
              onClick={() => onAnswer(q.field, "", "undecided")}
            >
              I haven't decided yet
            </button>
            <button
              className="btn small ghost"
              disabled={busy}
              onClick={() => onAnswer(q.field, "", "skip")}
            >
              Skip question
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
export default function DiscoveryAdvisor({
  founder: s,
  reviewDecision,
  compact = false,
  flow = false,
  onAdvice,
  onPendingChange,
}: ScreenProps & {
  compact?: boolean;
  flow?: boolean;
  onAdvice?: (value: boolean) => void;
  onPendingChange?: (value: boolean) => void;
}) {
  const [data, setData] = useState<DiscoveryResult | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const signature = JSON.stringify([
    s.name,
    s.type,
    s.model,
    s.city,
    s.state,
    s.budget,
    s.details,
  ]);
  useEffect(() => {
    let active = true;
    void getDiscovery(s.businessId)
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [s.businessId, signature]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await sendDiscovery(s.businessId, message);
      setData(result);
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery is unavailable.");
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
      setError(
        e instanceof Error ? e.message : "Could not review this answer.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    onAdvice?.(
      !!data?.conversation?.messages?.some((m) => m.role === "assistant"),
    );
    onPendingChange?.(data?.proposal?.status === "pending");
  }, [data, onAdvice, onPendingChange]);
  function review(d: Decision) {
    reviewDecision?.(d);
  }
  if (flow)
    return (
      <section className="exploration-conversation">
        <h1>Explore your business idea</h1>
        <p>
          Describe what you have in mind. We’ll work through your options
          together.
        </p>
        {!!data?.conversation?.messages?.length && (
          <div
            className="chatlog"
            role="log"
            aria-label="Discovery conversation"
            aria-live="polite"
          >
            {data.conversation.messages.map((m) => (
              <div
                key={m.id}
                className={`bubble ${m.role === "user" ? "user" : "bot"}`}
              >
                {m.role === "assistant" ? (
                  <AnswerContent text={m.content} />
                ) : (
                  m.content
                )}
              </div>
            ))}
          </div>
        )}
        <form onSubmit={send}>
          <textarea
            className="input"
            aria-label="Describe your business idea"
            rows={3}
            maxLength={4000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="I want to open a coffee shop, but I’m unsure where to start…"
          />
          <button className="btn" disabled={busy || !message.trim()}>
            {busy ? "Thinking…" : "Send →"}
          </button>
        </form>
        {error && (
          <p role="alert" className="warn">
            {error}
          </p>
        )}
        {busy && <p role="status">Thinking through your idea…</p>}
        {data?.proposal?.status === "pending" && (
          <div className="idea-review-notice">
            <strong>Your new idea is ready to review</strong>
            <p>
              The conversation explores what you just described. Saved
              comparisons and the roadmap use confirmed business details. Review
              these changes before continuing.
            </p>
            <button
              className="btn small secondary"
              onClick={() => review(data.proposal!)}
            >
              Review business details
            </button>
          </div>
        )}
      </section>
    );
  return (
    <div
      className={compact ? "discovery-compact" : ""}
      style={{ marginBottom: 18 }}
    >
      <Panel>
        {!compact && <span className="badge">AI BUSINESS DISCOVERY</span>}
        <h2>
          {compact ? "Your business idea" : "Describe your business idea"}
        </h2>
        <p className="muted">
          Tell LaunchPilot what you want to build or what you already have.
          Review extracted information before saving it.
        </p>
        {compact ? (
          <>
            {!!data?.conversation?.messages?.length &&
              data?.proposal?.status === "pending" && (
                <div className="discovery-latest" aria-live="polite">
                  {data.conversation.messages.at(-1)?.content}
                </div>
              )}
            {(data?.conversation?.messages?.length || 0) >
              (data?.proposal?.status === "pending" ? 1 : 0) && (
              <details className="discovery-history">
                <summary className="link">Previous messages</summary>
                <div className="chatlog">
                  {data!.conversation.messages
                    .slice(
                      0,
                      data?.proposal?.status === "pending" ? -1 : undefined,
                    )
                    .map((m) => (
                      <div
                        className={`bubble ${m.role === "user" ? "user" : "bot"}`}
                        key={m.id}
                      >
                        {m.role === "assistant" ? (
                          <AnswerContent text={m.content} />
                        ) : (
                          m.content
                        )}
                      </div>
                    ))}
                </div>
              </details>
            )}
          </>
        ) : (
          <>
            <div className="chatlog" aria-live="polite">
              {data?.conversation?.messages?.length ? (
                data.conversation.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`bubble ${m.role === "user" ? "user" : "bot"}`}
                  >
                    {m.role === "assistant" ? (
                      <AnswerContent text={m.content} />
                    ) : (
                      m.content
                    )}
                  </div>
                ))
              ) : (
                <div className="bubble bot">
                  What would you like to launch? You can also skip Discovery and
                  start with Legal & Compliance.
                </div>
              )}
            </div>
          </>
        )}
        <form onSubmit={send} className="chat-entry">
          {compact ? (
            <textarea
              className="input"
              aria-label="Describe your business idea"
              value={message}
              maxLength={4000}
              rows={3}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. I want to open a coffee shop, but I’m not sure where to start."
            />
          ) : (
            <>
              <input
                className="input"
                aria-label="Describe your business idea"
                value={message}
                maxLength={4000}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. I'm building a SaaS startup in Virginia"
              />
            </>
          )}
          <button className="btn" disabled={busy || !message.trim()}>
            Explore idea →
          </button>
        </form>
        {busy && (
          <p className="mini muted" role="status">
            Understanding your idea and preparing a review…
          </p>
        )}
        {error && (
          <p role="alert" className="warn">
            {error}
          </p>
        )}
        {data?.proposal && (!compact || data.proposal.status === "pending") && (
          <button
            className="btn secondary"
            style={{ marginTop: 12 }}
            onClick={() => review(data.proposal!)}
          >
            Review extracted profile
          </button>
        )}
        <FollowupQuestions
          questions={
            compact
              ? (data?.questions || []).slice(0, 1)
              : data?.questions || []
          }
          onAnswer={(...args) => void answer(...args)}
          busy={busy}
        />
        <p className="mini muted">
          You review every change before it is saved. Skip any question you’re
          not ready to answer.
        </p>
      </Panel>
    </div>
  );
}
