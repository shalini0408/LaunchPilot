import { useEffect, useState } from "react";
import { getRequirement, type RegulatoryRequirement } from "../api";
import type { Founder } from "../state";
import TaskGuide from "./TaskGuide";
export default function RegulatoryGuide({
  founder,
  requirementId,
  onBack,
  finding,
}: {
  founder: Founder;
  requirementId: string;
  onBack?: () => void;
  finding?: RegulatoryRequirement;
}) {
  const [result, setResult] = useState(finding),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    setResult(finding);
    if (!finding)
      void getRequirement(founder.businessId, requirementId)
        .then((r) => {
          if (active) setResult(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [founder.businessId, requirementId, finding, retry]);
  return (
    <>
      {onBack && (
        <button className="btn ghost small" onClick={onBack}>
          ← Back to requirements
        </button>
      )}
      {error && (
        <p role="alert" className="warn">
          {error} <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </p>
      )}
      {result ? (
        <>
          <h2>{result.name}</h2>
          <TaskGuide
            founder={founder}
            title={result.name}
            requirementId={requirementId}
            finding={result}
            onUpload={() => {
              window.location.hash = `documents${result.task_id ? "?task=" + encodeURIComponent(result.task_id) : ""}`;
            }}
          />
        </>
      ) : (
        !error && (
          <p className="muted" role="status">
            Loading researched guidance…
          </p>
        )
      )}
    </>
  );
}
