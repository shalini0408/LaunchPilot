import { useState } from "react";
import { addDocument, validateDocument, DOCUMENT_ACCEPT } from "../documents";
import type { Founder } from "../state";
export default function TaskDocumentUpload({
  founder,
  onViewAll,
}: {
  founder: Founder;
  onViewAll: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const task = founder.roadmap[founder.activeTask];
  if (!task) return null;
  return (
    <div className="task-file-upload">
      <p>
        Upload a filled form or supporting document for this step. Files are
        linked to this step and kept together in your business documents.
        Uploading does not mark the step complete.
      </p>
      <label className="field">
        Upload filled documents
        <input
          type="file"
          accept={DOCUMENT_ACCEPT}
          multiple
          disabled={busy}
          onChange={async (event) => {
            const input = event.currentTarget,
              files = Array.from(input.files || []);
            if (!files.length) return;
            setBusy(true);
            setError("");
            setNotice("");
            const saved: string[] = [],
              errors: string[] = [];
            try {
              for (const file of files) {
                try {
                  const type = await validateDocument(file);
                  await addDocument({
                    name: file.name,
                    type,
                    size: file.size,
                    created: new Date().toISOString(),
                    business: founder.name,
                    businessId: founder.businessId,
                    category: "Other",
                    taskId: task.id,
                    taskTitle: task.title,
                    blob: file,
                  });
                  saved.push(file.name);
                } catch (error) {
                  errors.push(
                    `${file.name}: ${error instanceof Error ? error.message : "Could not upload. Please try again."}`,
                  );
                }
              }
              if (saved.length)
                setNotice(
                  `Saved for this step: ${saved.join(", ")}. Find them in all business documents.`,
                );
              setError(errors.join(" "));
            } finally {
              setBusy(false);
              input.value = "";
            }
          }}
        />
      </label>
      <p className="mini muted">
        PDF, images, Word, Excel, text or CSV · up to 12 MB per file.
      </p>
      {busy && <p role="status">Uploading documents…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <button
        className="btn small secondary"
        disabled={busy}
        onClick={onViewAll}
      >
        View all business documents
      </button>
    </div>
  );
}
