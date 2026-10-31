import { useEffect } from "react";
import { useFounder, type Page } from "./state";
import Onboarding from "./components/Onboarding";
import LaunchForm from "./components/LaunchForm";
import Roadmap from "./components/Roadmap";
import Task from "./components/Task";
import Documents from "./components/Documents";
export default function App({
  projectId,
  legacy,
  onBack,
}: { projectId?: string; legacy?: boolean; onBack?: () => void } = {}) {
  const {
    founder: s,
    update,
    complete,
    loading,
    saving,
    storageError,
    retry,
    reload,
    pendingDecision,
    reviewDecision,
    confirmPending,
    cancelPending,
  } = useFounder(projectId);
  const props = { founder: s, update, complete, reload, reviewDecision };
  const page: Page =
    s.launchReady && s.page === "task"
      ? "task"
      : s.launchReady && s.page === "documents"
        ? "documents"
        : s.launchReady && s.page === "roadmap"
          ? "roadmap"
          : "discover";
  useEffect(() => {
    const title = document.querySelector<HTMLElement>("h1");
    if (title) {
      title.tabIndex = -1;
      title.focus({ preventScroll: true });
    }
    document.title = "LaunchPilot AI";
  }, [page, s.activeTask, loading]);
  return (
    <div className="app flow-app">
      <aside className="sidebar">
        <div className="brand">
          <span>✦</span> LaunchPilot AI
        </div>
        <nav className="nav" aria-label="Workspace">
          <button
            disabled={loading || saving}
            aria-current={page === "discover" ? "page" : undefined}
            className={page === "discover" ? "active" : ""}
            onClick={() => update({ page: "discover" })}
          >
            {s.journey === "known" ? "My business" : "My business idea"}
          </button>
          {s.launchReady && (
            <button
              disabled={loading || saving}
              aria-current={page !== "discover" ? "page" : undefined}
              className={page !== "discover" ? "active" : ""}
              onClick={() => update({ page: "roadmap" })}
            >
              My roadmap
            </button>
          )}
        </nav>
      </aside>
      <main className="main">
        <div className="content">
          {!loading && page !== "task" && (page !== "discover" || onBack) && (
            <button
              className="text-link flow-back"
              disabled={saving}
              onClick={() => {
                if (page === "discover") {
                  onBack?.();
                  return;
                }
                if (page === "documents") {
                  const index = s.roadmap.findIndex(
                    (t) => t.id === s.documentTaskId,
                  );
                  if (index >= 0) {
                    update({ page: "task", activeTask: index });
                    return;
                  }
                  update({ page: "roadmap" });
                  return;
                }
                update({ page: "discover" });
              }}
            >
              {page === "documents"
                ? "← Back to task"
                : page === "roadmap"
                  ? "← Back to my business"
                  : "← Back to journey selection"}
            </button>
          )}

          {storageError && (
            <p role="alert" className="warn">
              {storageError}{" "}
              <button className="text-link" onClick={retry}>
                Retry
              </button>
            </p>
          )}
          {loading ? (
            <p role="status">Loading your business…</p>
          ) : (
            <fieldset
              disabled={saving}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
            >
              {pendingDecision && (
                <div
                  className="inline-confirmation"
                  role="region"
                  aria-label="Review proposed changes"
                >
                  <p>Confirm these business details before saving:</p>
                  <dl>
                    {pendingDecision.differences.map((d) => (
                      <div key={d.field}>
                        <dt>{d.field.replaceAll("_", " ")}</dt>
                        <dd>
                          {typeof d.after === "object"
                            ? Object.entries(d.after || {})
                                .filter(
                                  ([key, v]) =>
                                    key !== "question_status" &&
                                    v !== "" &&
                                    v !== null &&
                                    v !== undefined &&
                                    (Array.isArray(v)
                                      ? v.length > 0
                                      : typeof v !== "object"),
                                )
                                .map(
                                  ([k, v]) =>
                                    `${k.replaceAll("_", " ")}: ${Array.isArray(v) ? v.join(", ") : String(v)}`,
                                )
                                .join("; ")
                            : String(d.after ?? "Not selected")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    className="btn small"
                    onClick={() => void confirmPending()}
                  >
                    Confirm changes
                  </button>{" "}
                  <button
                    className="text-link"
                    onClick={() => void cancelPending()}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {page === "task" ? (
                <Task {...props} />
              ) : page === "documents" ? (
                <Documents
                  business={s.name}
                  businessId={s.businessId}
                  tasks={s.roadmap}
                  initialTaskId={s.documentTaskId}
                  importLegacy={legacy}
                />
              ) : page === "roadmap" ? (
                <Roadmap {...props} />
              ) : s.journey === "known" ? (
                <LaunchForm
                  businessId={s.businessId}
                  onDone={async () => {
                    await reload();
                    update({ page: "roadmap" });
                  }}
                />
              ) : (
                <Onboarding {...props} />
              )}
            </fieldset>
          )}
        </div>
      </main>
    </div>
  );
}
