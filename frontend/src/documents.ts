import { sessionGeneration, reportExpired } from "./session";
export interface StoredDocument {
  id: number;
  name: string;
  type: string;
  size: number;
  created: string;
  business: string;
  category: string;
  blob: Blob;
  businessId?: string;
  taskId?: string;
  taskTitle?: string;
}
export const MAX_DOCUMENT_BYTES = 12 * 1024 * 1024;
export const DOCUMENT_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.doc,.docx,.xlsx";
const MIME: Record<string, string[]> = {
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  txt: ["text/plain"],
  csv: ["text/csv", "text/plain", "application/vnd.ms-excel"],
  doc: ["application/msword"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
};
export function documentExtension(name: string) {
  return name.split(".").at(-1)?.toLowerCase() || "";
}
async function bytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function")
    return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(Error("Could not read this file."));
    reader.readAsArrayBuffer(blob);
  });
}
export async function validateDocument(file: File): Promise<string> {
  if (file.size > MAX_DOCUMENT_BYTES)
    throw Error(`${file.name} exceeds 12 MB limit`);
  if (!file.size) throw Error(`${file.name} is empty.`);
  const ext = documentExtension(file.name),
    allowed = MIME[ext];
  if (!allowed)
    throw Error(
      `${file.name}: unsupported file type. Use PDF, PNG, JPEG, WebP, text, CSV or Office documents.`,
    );
  const type = file.type.toLowerCase();
  if (type && type !== "application/octet-stream" && !allowed.includes(type))
    throw Error(`${file.name}: file type does not match its extension.`);
  const head = await bytes(file.slice(0, 512));
  const begins = (signature: number[]) =>
    signature.every((v, i) => head[i] === v);
  const text = new TextDecoder().decode(head);
  const valid =
    ext === "pdf"
      ? text.startsWith("%PDF-")
      : ext === "png"
        ? begins([137, 80, 78, 71, 13, 10, 26, 10])
        : ext === "jpg" || ext === "jpeg"
          ? begins([255, 216, 255])
          : ext === "webp"
            ? text.startsWith("RIFF") && text.slice(8, 12) === "WEBP"
            : ext === "doc"
              ? begins([208, 207, 17, 224, 161, 177, 26, 225])
              : ext === "docx" || ext === "xlsx"
                ? begins([80, 75, 3, 4])
                : !head.includes(0) &&
                  !/^\s*(?:<!doctype html|<html|<script|<svg)/i.test(text);
  if (!valid)
    throw Error(
      `${file.name}: the file contents do not match the selected document format.`,
    );
  return allowed[0];
}
const DB_NAME = "launchpilot-documents-v1";
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("files", {
        keyPath: "id",
        autoIncrement: true,
      });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () =>
      reject(Error("Close other LaunchPilot tabs to access document storage."));
  });
}
async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("files", mode);
      let result: T;
      const r = operation(tx.objectStore("files"));
      r.onsuccess = () => {
        result = r.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function documentRequest(path: string, init?: RequestInit) {
  const sessionAtStart = sessionGeneration();
  const response = await fetch(path, init);
  if (response.status === 401) reportExpired(sessionAtStart);
  if (!response.ok)
    throw Error(
      "Could not access this project's documents. Please sign in and try again.",
    );
  return response;
}
export const listDocuments = async (
  businessId?: string,
): Promise<StoredDocument[]> => {
  if (!businessId)
    return transact<StoredDocument[]>("readonly", (store) => store.getAll());
  const docs: StoredDocument[] = await (
    await documentRequest(`/api/businesses/${businessId}/documents`)
  ).json();
  return Promise.all(
    docs.map(async (doc) => ({
      ...doc,
      blob: await (
        await documentRequest(
          `/api/businesses/${businessId}/documents/${doc.id}/content`,
        )
      ).blob(),
    })),
  );
};
export const addDocument = async (doc: Omit<StoredDocument, "id">) => {
  if (!doc.businessId) return transact("readwrite", (store) => store.add(doc));
  const form = new FormData();
  form.append("file", doc.blob, doc.name);
  form.append("category", doc.category);
  form.append("task_id", doc.taskId || "");
  return (
    await documentRequest(`/api/businesses/${doc.businessId}/documents`, {
      method: "POST",
      body: form,
    })
  ).json();
};
export const removeDocument = async (id: number, businessId?: string) =>
  businessId
    ? documentRequest(`/api/businesses/${businessId}/documents/${id}`, {
        method: "DELETE",
      })
    : transact("readwrite", (store) => store.delete(id));
export const updateDocument = async (doc: StoredDocument) =>
  doc.businessId
    ? documentRequest(`/api/businesses/${doc.businessId}/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: doc.taskId || "" }),
      })
    : transact("readwrite", (store) => store.put(doc));
export function downloadDocument(doc: StoredDocument) {
  const url = URL.createObjectURL(doc.blob),
    a = document.createElement("a");
  a.href = url;
  a.download = doc.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
