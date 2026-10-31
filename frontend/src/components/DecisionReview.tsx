import { useEffect, useRef } from "react";
import type { Decision } from "../api";
import { Panel } from "./Common";
export default function DecisionReview({
  decision: d,
  onConfirm,
  onCancel,
  busy = false,
}: {
  decision: Decision;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    region.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
    region.current
      ?.querySelector<HTMLHeadingElement>("h2")
      ?.focus({ preventScroll: true });
  }, [d.id]);
  const differences = d.differences.flatMap((change) => {
    if (change.field !== "details") return [change];
    const before = (change.before || {}) as Record<string, unknown>,
      after = (change.after || {}) as Record<string, unknown>;
    return Object.entries(after)
      .filter(
        ([key, value]) => JSON.stringify(before[key]) !== JSON.stringify(value),
      )
      .flatMap(([key, value]) =>
        key === "question_status"
          ? Object.entries(value as Record<string, string>)
              .filter(
                ([field, status]) =>
                  (
                    before.question_status as Record<string, string> | undefined
                  )?.[field] !== status,
              )
              .map(([field, status]) => ({
                field: "Question preference: " + field,
                before: (
                  before.question_status as Record<string, string> | undefined
                )?.[field],
                after: status,
              }))
          : [{ field: key, before: before[key], after: value }],
      );
  });
  const display = (value: unknown) =>
    value === null || value === undefined || value === ""
      ? "Not set"
      : Array.isArray(value)
        ? value.join(", ")
        : typeof value === "object"
          ? Object.entries(value)
              .map(([k, v]) => `${k.replaceAll("_", " ")}: ${String(v)}`)
              .join("; ")
          : String(value).replaceAll("_", " ");
  return (
    <div
      ref={region}
      style={{ marginBottom: 20 }}
      role="region"
      aria-label="Review proposed changes"
    >
      <Panel>
        <span className="badge">FOUNDER CONFIRMATION</span>
        <h2 tabIndex={-1}>Review before saving</h2>
        <p className="muted">
          These changes are proposals. Your saved profile and progress stay as
          they are until you confirm.
        </p>
        <div className="compare decision-table">
          <table
            style={{
              width: "100%",
              textAlign: "left",
              overflowWrap: "anywhere",
            }}
          >
            <thead>
              <tr>
                <th>Field</th>
                <th>Current</th>
                <th>Proposed</th>
              </tr>
            </thead>
            <tbody>
              {differences.map((change) => (
                <tr key={change.field}>
                  <th>{change.field.replaceAll("_", " ")}</th>
                  <td>{display(change.before)}</td>
                  <td>{display(change.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.planning_task && <p>New planning task: {d.planning_task.title}</p>}
        <p className="muted">
          Roadmap: {d.roadmap_changes.added.length} tasks added,{" "}
          {d.roadmap_changes.archived.length} archived,{" "}
          {d.roadmap_changes.preserved_completed.length} completed tasks
          retained. {d.roadmap_changes.regulatory_revalidation} regulatory
          findings need revalidation. Documents are retained.
        </p>
        <details>
          <summary className="link">See affected tasks</summary>
          <ul>
            {d.roadmap_changes.added.map((t) => (
              <li key={"add:" + t}>Add: {t}</li>
            ))}
            {d.roadmap_changes.review_required?.map((t) => (
              <li key={"review:" + t}>Review after changes: {t}</li>
            ))}
            {d.roadmap_changes.archived.map((t) => (
              <li key={"archive:" + t}>Archive: {t}</li>
            ))}
          </ul>
        </details>
        <div className="row">
          <button className="btn" disabled={busy} onClick={onConfirm}>
            Confirm changes
          </button>
          <button className="btn ghost" disabled={busy} onClick={onCancel}>
            Keep current profile
          </button>
        </div>
      </Panel>
    </div>
  );
}
