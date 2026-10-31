import { useEffect, useRef, useState } from "react";
import { askBusinessAdvisor, getConversation, type ChatMessage } from "../api";
import AnswerContent from "./AnswerContent";
import { ExternalLink } from "./Common";
import { taskGuide, type Founder } from "../state";
export default function Chat({
  founder: s,
  title,
  requirementId,
  workspace = false,
}: {
  founder: Founder;
  title: string;
  requirementId?: string;
  workspace?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [historyError, setHistoryError] = useState(""),
    [historyLoading, setHistoryLoading] = useState(true),
    [error, setError] = useState(""),
    [retryQuestion, setRetryQuestion] = useState(""),
    [mode, setMode] = useState(""),
    [reload, setReload] = useState(0);
  const log = useRef<HTMLDivElement>(null),
    request = useRef<AbortController | null>(null),
    active = useRef(true);
  const currentTask = workspace
    ? undefined
    : requirementId
      ? s.roadmap.find((task) => task.requirement_id === requirementId)?.id
      : s.roadmap[Math.min(s.activeTask, s.roadmap.length - 1)]?.id;
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, busy]);
  useEffect(() => {
    active.current = true;
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setMessages([]);
    setError("");
    setRetryQuestion("");
    setMode("");
    setHistoryLoading(true);
    setHistoryError("");
    let cancelled = false;
    const scope = requirementId
      ? "requirement:" + requirementId
      : currentTask
        ? "task:" + currentTask
        : "advisor";
    void getConversation(s.businessId, scope)
      .then((history) => {
        if (!cancelled && Array.isArray(history.messages))
          setMessages(
            history.messages.map((m) => ({
              role: m.role,
              text: m.content,
              citations: m.citations,
            })),
          );
      })
      .catch(() => {
        if (!cancelled)
          setHistoryError(
            "Your conversation could not be loaded. Retry before sending a new question.",
          );
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
      active.current = false;
      request.current?.abort();
      request.current = null;
    };
  }, [s.businessId, currentTask, requirementId, reload]);
  async function send(text = question, retry = false) {
    const q = text.trim();
    if (!q || busy || historyLoading || historyError) return;
    setQuestion("");
    setBusy(true);
    setError("");
    setRetryQuestion("");
    if (!retry) setMessages((old) => [...old, { role: "user", text: q }]);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 65000);
    try {
      const result = await askBusinessAdvisor(
        {
          business_id: s.businessId,
          task_id: currentTask,
          requirement_id: requirementId,
          question: q,
          business_type: s.type,
          business_model: s.model,
          city: s.city,
          state: s.state,
          company_name: s.name,
          task: title,
          task_guide: taskGuide(title),
          history: [],
        },
        controller.signal,
      );
      if (!active.current || request.current !== controller) return;
      setMessages((old) => [
        ...old,
        { role: "assistant", text: result.answer, citations: result.citations },
      ]);
      setMode(
        result.mode === "demo"
          ? "Live AI is not configured. This reply is guided assistance."
          : "",
      );
    } catch (e) {
      if (!active.current || request.current !== controller) return;
      setError(
        controller.signal.aborted
          ? "The assistant took too long to reply. Please retry."
          : e instanceof Error
            ? e.message
            : "The assistant could not reply. Please retry.",
      );
      setRetryQuestion(q);
    } finally {
      clearTimeout(timeout);
      if (active.current && request.current === controller) setBusy(false);
    }
  }
  const suggestions = workspace
    ? [
        "What is my next practical step?",
        "What information is still missing?",
        "How do my decisions affect my roadmap?",
      ]
    : [
        "Can you explain this in simpler terms?",
        "How does this apply to my business?",
        "What documents should I prepare?",
        "Do I really need to do this?",
      ];
  return (
    <>
      <span className="badge">✦ YOUR AI ADVISOR</span>
      <h2>Ask LaunchPilot AI</h2>
      <p className="muted mini">
        {workspace
          ? "Your personal assistant for your business."
          : "Your personal assistant for this step."}
      </p>
      {historyLoading && (
        <p className="mini muted" role="status">
          Loading your discussion…
        </p>
      )}
      {historyError && (
        <p className="warn" role="alert">
          {historyError}{" "}
          <button className="text-link" onClick={() => setReload((n) => n + 1)}>
            Retry history
          </button>
        </p>
      )}
      <div
        className="chatlog"
        ref={log}
        role="log"
        aria-label="Conversation history"
        aria-live="polite"
      >
        <div className="bubble bot">
          {workspace
            ? "What would you like to work through?"
            : `Let’s work through this step for ${s.name || "your business"}. Ask me to explain a term, help you prepare, or clarify your next action.`}
        </div>
        {messages.map((m, i) => (
          <div
            key={i}
            className={`bubble ${m.role === "user" ? "user" : "bot"}`}
          >
            {m.role === "user" ? m.text : <AnswerContent text={m.text} />}
            {m.citations?.map((citation, n) => (
              <div key={`${citation.url}:${n}`} className="mini">
                <ExternalLink href={citation.url}>
                  [{n + 1}] {citation.title}
                </ExternalLink>
                <blockquote>{citation.excerpt}</blockquote>
              </div>
            ))}
          </div>
        ))}
        {busy && (
          <div className="bubble bot" role="status">
            Thinking…
          </div>
        )}
      </div>
      <div className="chat-suggestions" aria-label="Suggested questions">
        {suggestions.map((q) => (
          <button
            type="button"
            key={q}
            disabled={busy || historyLoading || !!historyError}
            onClick={() => setQuestion(q)}
          >
            {q}
          </button>
        ))}
      </div>
      {error && (
        <p className="warn chat-error" role="alert">
          {error}{" "}
          <button
            className="text-link"
            disabled={busy}
            onClick={() => void send(retryQuestion, true)}
          >
            Retry message
          </button>
        </p>
      )}
      <form
        className="chat-entry"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          className="input"
          required
          maxLength={1000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about this step…"
          aria-label="Ask a question"
          disabled={busy || historyLoading || !!historyError}
        />
        <button
          className="btn"
          disabled={
            busy || historyLoading || !!historyError || !question.trim()
          }
        >
          Send ↗
        </button>
      </form>
      {mode && (
        <p className="chat-mode" role="status">
          {mode}
        </p>
      )}
      <p className="assistant-note">
        Your saved business details and this task provide context. Specific
        regulatory answers need current official evidence.
      </p>
    </>
  );
}
