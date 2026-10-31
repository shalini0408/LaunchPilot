import { useEffect, useState } from "react";
import {
  addDocument,
  downloadDocument,
  listDocuments,
  removeDocument,
  updateDocument,
  validateDocument,
  documentExtension,
  DOCUMENT_ACCEPT,
  type StoredDocument,
} from "../documents";
import type { RoadmapRecord } from "../api";
import { Heading, Panel } from "./Common";
function DocumentPreview({
  doc,
  onClose,
}: {
  doc: StoredDocument;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState("");
  const ext = documentExtension(doc.name),
    image = ["png", "jpg", "jpeg", "webp"].includes(ext),
    pdf = ext === "pdf",
    plain = ["txt", "csv"].includes(ext);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    async function prepare() {
      try {
        if (image || pdf || plain) {
          const type = await validateDocument(
            new File([doc.blob], doc.name, { type: doc.type }),
          );
          if (!active) return;
          if (image || pdf) {
            objectUrl = URL.createObjectURL(new Blob([doc.blob], { type }));
            setUrl(objectUrl);
          } else setText((await doc.blob.text()).slice(0, 100000));
        }
      } catch {
        if (active)
          setError(
            "This file could not be safely previewed. Download a copy instead.",
          );
      }
    }
    void prepare();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id, image, pdf, plain, doc.blob]);
  return (
    <div
      className="document-preview"
      role="region"
      aria-label={`Preview ${doc.name}`}
    >
      <div className="row">
        <h3>{doc.name}</h3>
        <button className="btn small ghost" onClick={onClose}>
          Close preview
        </button>
      </div>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      {image && url && <img src={url} alt={`Uploaded document: ${doc.name}`} />}{" "}
      {pdf && url && (
        <>
          <iframe title={`Preview ${doc.name}`} src={url} sandbox="" />
          <p className="mini muted">
            PDF preview depends on browser support. Use Download if it does not
            display.
          </p>
        </>
      )}
      {plain && <pre>{text}</pre>}
      {!image && !pdf && !plain && (
        <p className="muted">
          This document is stored safely for download. Office files are not
          executed or rendered inside LaunchPilot.
        </p>
      )}
      <button
        className="btn small secondary"
        onClick={() => downloadDocument(doc)}
      >
        Download previewed file
      </button>
      <p className="mini muted">
        Local preview only. This file is not sent to the advisor.
      </p>
    </div>
  );
}
export default function Documents({
  importLegacy = false,
  business,
  businessId = "",
  tasks = [],
  initialTaskId = "",
}: {
  importLegacy?: boolean;
  business: string;
  businessId?: string;
  tasks?: RoadmapRecord[];
  initialTaskId?: string;
}) {
  const [docs, setDocs] = useState<StoredDocument[]>([]),
    [category, setCategory] = useState("Business formation"),
    [taskId, setTaskId] = useState(initialTaskId),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<StoredDocument | null>(null);
  async function refresh() {
    try {
      setDocs(await listDocuments(businessId));
    } catch {
      setError(
        "Could not load your documents. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, [businessId]);
  useEffect(() => setTaskId(initialTaskId), [initialTaskId]);
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget,
      files = Array.from(input.files || []);
    if (!files.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    let saved = 0;
    const errors: string[] = [];
    try {
      for (const file of files) {
        try {
          const type = await validateDocument(file),
            task = tasks.find((t) => t.id === taskId);
          await addDocument({
            name: file.name,
            type,
            size: file.size,
            created: new Date().toISOString(),
            business: business || "My business",
            businessId,
            category,
            taskId: task?.id,
            taskTitle: task?.title,
            blob: file,
          });
          saved++;
        } catch (e) {
          errors.push(
            e instanceof Error ? e.message : `${file.name} could not be saved.`,
          );
        }
      }
    } finally {
      setError(errors.join("\n"));
      setNotice(
        saved
          ? `${saved} document${saved === 1 ? "" : "s"} saved in this project.`
          : "",
      );
      setBusy(false);
      input.value = "";
      await refresh();
    }
  }
  async function associate(doc: StoredDocument, id: string) {
    setError("");
    const task = tasks.find((t) => t.id === id);
    try {
      await updateDocument({
        ...doc,
        businessId: businessId || doc.businessId,
        taskId: id || undefined,
        taskTitle: task?.title,
      });
      await refresh();
    } catch {
      setError("Could not save the task association. Try again.");
    }
  }
  async function deleteDoc(id: number) {
    if (!confirm("Delete this document from this project?")) return;
    setError("");
    try {
      await removeDocument(id, businessId);
      if (preview?.id === id) setPreview(null);
      await refresh();
      setNotice("Document removed from this project.");
    } catch {
      setError("Could not delete this document. Please try again.");
    }
  }
  async function importPrevious() {
    if (
      !confirm(
        "Copy documents from the previous development workspace into this project? Only do this for files you own. Originals will remain in browser storage.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const previous = (await listDocuments()).filter(
        (d) => !d.businessId || d.businessId === businessId,
      );
      let count = 0;
      for (const doc of previous) {
        if (docs.some((d) => d.name === doc.name && d.size === doc.size))
          continue;
        const type = await validateDocument(
          new File([doc.blob], doc.name, { type: doc.type }),
        );
        await addDocument({
          ...doc,
          type,
          businessId,
          taskId: doc.businessId === businessId ? doc.taskId : undefined,
        });
        count++;
      }
      setNotice(
        `${count} previous documents copied. Originals remain in browser storage.`,
      );
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not import previous documents.",
      );
    } finally {
      setBusy(false);
    }
  }
  const visible = docs;
  return (
    <>
      <Heading tag="Document vault" title="Your business documents">
        Keep existing records together and link them to your launch tasks.
      </Heading>
      {importLegacy && (
        <p className="callout">
          Your previous browser files remain available for import.{" "}
          <button
            className="btn small secondary"
            disabled={busy}
            onClick={() => void importPrevious()}
          >
            Import previous browser documents
          </button>
        </p>
      )}
      <div className="resource-grid">
        <Panel>
          <span className="badge">PRIVATE PROJECT STORAGE</span>
          <h2>Upload a document</h2>
          <p className="muted">
            Files are stored privately with this business project. Linking a
            document helps you track a task; it does not mark that task
            complete.
          </p>
          <label className="field" htmlFor="docCategory">
            Document category
          </label>
          <select
            id="docCategory"
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {[
              "Business formation",
              "EIN confirmation",
              "Licenses and permits",
              "Tax registration",
              "Insurance",
              "Other",
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="field" htmlFor="docTask">
            Related roadmap task (optional)
          </label>
          <select
            id="docTask"
            className="input"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          >
            <option value="">Not linked to a task</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <label
            className="uploadbox"
            style={{ display: "block", marginTop: 20 }}
          >
            <strong>📁 Choose files to upload</strong>
            <p className="muted">
              PDF, PNG, JPEG, WebP, text, CSV, Word or Excel · Max 12 MB per
              file
            </p>
            <input
              type="file"
              aria-label="Choose business documents"
              accept={DOCUMENT_ACCEPT}
              multiple
              disabled={busy}
              onChange={upload}
              style={{ marginTop: 10, maxWidth: "100%" }}
            />
          </label>
          {busy && <p role="status">Checking and saving documents…</p>}
          {notice && (
            <p className="callout" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="warn" role="alert">
              {error}
            </p>
          )}
          <p className="assistant-note">
            Files are stored in your private project, never sent to the LLM.
            Keep your own backup. File checks do not constitute malware
            scanning.
          </p>
        </Panel>
        <Panel>
          <h2>Saved documents</h2>
          <p className="muted">
            View a record, link it to a task, or download your original file.
          </p>
          {loading ? (
            <p className="muted" role="status">
              Loading documents…
            </p>
          ) : visible.length ? (
            visible.map((d) => (
              <article className="docrow" key={d.id}>
                <span aria-hidden="true" style={{ fontSize: 26 }}>
                  📄
                </span>
                <div className="grow">
                  <strong>{d.name}</strong>
                  <small>
                    {d.category} · {Math.ceil(d.size / 1024)} KB ·{" "}
                    {new Date(d.created).toLocaleDateString()}
                  </small>
                  {d.taskTitle && (
                    <small>
                      Linked task: {d.taskTitle}
                      {!tasks.some((t) => t.id === d.taskId)
                        ? " (previous roadmap)"
                        : ""}
                    </small>
                  )}
                  <label className="field" htmlFor={`document-task-${d.id}`}>
                    Link this document to a task
                  </label>
                  <select
                    className="input"
                    id={`document-task-${d.id}`}
                    value={d.taskId || ""}
                    onChange={(e) => void associate(d, e.target.value)}
                  >
                    <option value="">Not linked to a task</option>
                    {d.taskId && !tasks.some((t) => t.id === d.taskId) && (
                      <option value={d.taskId}>
                        {d.taskTitle || "Archived task"}
                      </option>
                    )}
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                  <div className="row doc-actions">
                    <button
                      className="btn small secondary"
                      onClick={() => setPreview(d)}
                    >
                      View
                    </button>
                    <button
                      className="btn small secondary"
                      onClick={() => downloadDocument(d)}
                    >
                      Download
                    </button>
                    <button
                      className="btn small ghost"
                      onClick={() => void deleteDoc(d.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="empty">
              No documents yet. Upload an existing registration, permit or other
              business record. You can continue your roadmap without uploading
              anything.
            </div>
          )}
          {preview && (
            <DocumentPreview doc={preview} onClose={() => setPreview(null)} />
          )}
        </Panel>
      </div>
    </>
  );
}
