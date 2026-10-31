import { useEffect, useState } from "react";
import {
  getRequirement,
  getResearchedRequirements,
  getResearchStatus,
  startResearch,
  type RegulatoryRequirement,
} from "../api";
import type { Founder } from "../state";
import {
  curatedResources,
  relevantFindings,
  taskContent,
} from "../taskContent";
import { ExternalLink } from "./Common";
import Chat from "./Chat";
import TaskDocumentUpload from "./TaskDocumentUpload";
import PreparationExample from "./PreparationExample";
function safeURL(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
export default function TaskGuide({
  founder: s,
  title,
  requirementId,
  finding: provided,
  onUpload,
  onCompare,
  onReload,
}: {
  founder: Founder;
  title: string;
  requirementId?: string;
  finding?: RegulatoryRequirement;
  onUpload?: () => void;
  onCompare?: () => void;
  onReload?: () => Promise<void>;
}) {
  const [finding, setFinding] = useState(provided),
    [rows, setRows] = useState<RegulatoryRequirement[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [research, setResearch] = useState(false),
    [runId, setRunId] = useState(""),
    [checked, setChecked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setFinding(provided);
    setRows([]);
    setChecked({});
    const load =
      provided && attempt === 0
        ? Promise.resolve(provided)
        : requirementId
          ? getRequirement(s.businessId, requirementId)
          : getResearchedRequirements(s.businessId);
    void load
      .then((result) => {
        if (!active) return;
        if (Array.isArray(result)) setRows(relevantFindings(title, result));
        else {
          setFinding(result);
          setRows([result]);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Official resources could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [s.businessId, title, requirementId, provided, attempt]);
  useEffect(() => {
    if (!runId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const status = await getResearchStatus(s.businessId);
        if (!active) return;
        if (status.status === "complete") {
          setResearch(false);
          setRunId("");
          setAttempt((n) => n + 1);
          void onReload?.();
        } else if (status.status === "failed") {
          setError(status.message);
          setResearch(false);
          setRunId("");
        } else timer = setTimeout(poll, 1500);
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          setResearch(false);
          setRunId("");
        }
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [runId, s.businessId, onReload]);
  async function researchResources() {
    setResearch(true);
    setError("");
    try {
      const result = await startResearch(
        s.businessId,
        !!finding?.needs_revalidation,
      );
      if (result.status === "complete") {
        setResearch(false);
        setAttempt((n) => n + 1);
        await onReload?.();
      } else setRunId(result.id || "pending");
    } catch (e) {
      setError((e as Error).message);
      setResearch(false);
    }
  }
  const content = taskContent(s, title, finding),
    curated = curatedResources(s, title);
  const sources = rows
    .flatMap((r) => [
      ...(r.application_url && !r.needs_revalidation
        ? [
            {
              url: r.application_url,
              title: "Open verified official application page ↗",
              note: `Retrieved ${new Date(r.last_checked).toLocaleDateString()}`,
            },
          ]
        : []),
      {
        url: r.source_url,
        title: r.agency,
        note: r.needs_revalidation
          ? "Previous evidence — refresh before relying on it"
          : `Retrieved ${new Date(r.last_checked).toLocaleDateString()}`,
      },
      ...r.sources.map((source) => ({
        url: source.url,
        title: source.title,
        note: `Retrieved ${new Date(source.retrieved_at).toLocaleDateString()}${r.needs_revalidation ? " · needs revalidation" : ""}`,
      })),
    ])
    .filter(
      (source, i, all) =>
        safeURL(source.url) && all.findIndex((x) => x.url === source.url) === i,
    );
  const hasDocs = content.docs.some((d) => d.kind !== "Information to prepare");
  return (
    <div className="task-guide-layout">
      <div className="task-guide-main">
        <section
          className="panel task-guide-section"
          aria-labelledby="task-meaning"
        >
          <span className="task-section-number">01</span>
          <h2 id="task-meaning">What Is This Step?</h2>
          <p className="task-actual-title">
            <strong>{title}</strong>
          </p>
          <p>{content.explanation}</p>
          {finding?.needs_revalidation && (
            <p className="warn">
              This finding needs revalidation. Refresh government research
              before relying on it.
            </p>
          )}
          {content.topic === "structure" && onCompare && (
            <button className="text-link" onClick={onCompare}>
              Compare business structures →
            </button>
          )}
        </section>
        <section
          className="panel task-guide-section"
          aria-labelledby="task-terms"
        >
          <span className="task-section-number">02</span>
          <h2 id="task-terms">Terms You Should Know</h2>
          <dl className="task-terms">
            {content.terms.map(([term, definition]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{definition}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section
          className="panel task-guide-section"
          aria-labelledby="task-documents"
        >
          <span className="task-section-number">03</span>
          <h2 id="task-documents">Documents Needed</h2>
          {!hasDocs && <p>No specific documents are needed for this step.</p>}
          {finding && !content.docs.length && (
            <p>
              The available evidence does not establish a document list. Confirm
              the current instructions with the issuing agency.
            </p>
          )}
          <div className="task-document-checklist">
            {content.docs.map((d) => (
              <label key={d.text}>
                <input
                  type="checkbox"
                  checked={!!checked[d.text]}
                  onChange={(e) =>
                    setChecked({ ...checked, [d.text]: e.target.checked })
                  }
                />
                <span>
                  {d.text}
                  <small>{d.kind}</small>
                </span>
              </label>
            ))}
          </div>
          <PreparationExample founder={s} title={title} items={content.docs} />
          {onUpload && (
            <TaskDocumentUpload founder={s} onViewAll={onUpload} />
          )}
        </section>
        <section
          className="panel task-guide-section"
          aria-labelledby="task-resources"
        >
          <span className="task-section-number">04</span>
          <h2 id="task-resources">Helpful Resources</h2>
          <div className="task-resource-group">
            <h3>Official Resources</h3>
            {loading && (
              <p role="status" className="mini muted">
                Loading official resources…
              </p>
            )}
            {sources.map((source) => (
              <div className="task-resource" key={source.url}>
                <ExternalLink href={source.url}>{source.title}</ExternalLink>
                <small>{source.note}</small>
              </div>
            ))}
            {curated
              .filter(([, url]) => !sources.some((s) => s.url === url))
              .map(([label, url]) => (
                <div className="task-resource" key={url}>
                  <ExternalLink href={url}>{label} ↗</ExternalLink>
                  <small>
                    Curated official starting point · not checked live
                  </small>
                </div>
              ))}
            {!loading && !sources.length && !curated.length && (
              <p className="muted">
                No official resources have been verified for this step yet.
                Research your saved activity and location, or check the relevant
                agency directly.
              </p>
            )}
            {error && (
              <p className="warn" role="alert">
                {error}{" "}
                <button
                  className="text-link"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  Retry loading resources
                </button>
              </p>
            )}
            <button
              className="btn small secondary"
              disabled={research}
              onClick={() => void researchResources()}
            >
              {research
                ? "Researching official resources…"
                : finding?.needs_revalidation
                  ? "Refresh official resources"
                  : "Find official resources"}
            </button>
          </div>
          <div className="task-resource-group videos">
            <h3>Video Tutorials</h3>
            <p className="mini muted">
              No individual video has been verified. Search results should be
              checked against official instructions.
            </p>
            <strong>{title} — tutorial search</strong>
            <ExternalLink
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(title + " " + [s.city, s.state].filter(Boolean).join(" ") + " tutorial")}`}
            >
              Search tutorial videos (unverified) ↗
            </ExternalLink>
          </div>
        </section>
      </div>
      <aside
        className="panel task-guide-assistant"
        aria-label="Task AI assistant"
      >
        <Chat
          key={`${s.businessId}:${requirementId || s.roadmap[s.activeTask]?.id}`}
          founder={s}
          title={title}
          requirementId={requirementId}
        />
      </aside>
    </div>
  );
}
