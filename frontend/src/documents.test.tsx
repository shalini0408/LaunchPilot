import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Documents from "./components/Documents";
import { listDocuments, removeDocument } from "./documents";
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const doc of await listDocuments()) await removeDocument(doc.id);
});
it("uploads, restores, downloads and deletes a document in the original IndexedDB store", async () => {
  const user = userEvent.setup(),
    file = new File(["%PDF-1.7\nPermit record"], "permit.pdf", {
      type: "application/pdf",
    });
  const { unmount } = render(<Documents business="Brightside" />);
  await user.upload(document.querySelector('input[type="file"]')!, file);
  await screen.findByText("permit.pdf");
  const saved = await listDocuments();
  expect(saved[0]).toMatchObject({
    name: "permit.pdf",
    business: "Brightside",
    category: "Business formation",
    size: file.size,
  });
  unmount();
  render(<Documents business="Brightside" />);
  await screen.findByText("permit.pdf");
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:test-document"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  await user.click(screen.getByRole("button", { name: "Download" }));
  expect(click).toHaveBeenCalledOnce();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await user.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.queryByText("permit.pdf")).toBeNull());
  expect(await listDocuments()).toEqual([]);
});
it("rejects files over the original 12 MB limit", async () => {
  const user = userEvent.setup(),
    file = new File(["large"], "large.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "size", { value: 12 * 1024 * 1024 + 1 });
  render(<Documents business="Test" />);
  await user.upload(document.querySelector('input[type="file"]')!, file);
  await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toContain("exceeds 12 MB");
  expect(await listDocuments()).toEqual([]);
});
it("retains stable task links when the roadmap changes", async () => {
  const stored: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const form = init.body as FormData;
        stored.push({
          id: 1,
          name: "formation.pdf",
          type: "application/pdf",
          size: 16,
          created: new Date().toISOString(),
          businessId: "business-1",
          taskId: form.get("task_id"),
          taskTitle: "Review formation",
          category: "Business formation",
        });
        return new Response(JSON.stringify(stored[0]), { status: 201 });
      }
      if (url.endsWith("/content")) return new Response("%PDF-1.7 Record");
      return new Response(JSON.stringify(stored));
    }),
  );
  const user = userEvent.setup(),
    task = {
      id: "task-formation",
      stable_key: "common:formation",
      title: "Review formation",
      position: 0,
      guide: { goal: "Review", actions: [], prepare: [], proof: "Reviewed" },
      completed: false,
    };
  const { unmount } = render(
    <Documents
      business="Brightside"
      businessId="business-1"
      tasks={[task]}
      initialTaskId={task.id}
    />,
  );
  expect(
    (
      screen.getByLabelText(
        "Related roadmap task (optional)",
      ) as HTMLSelectElement
    ).value,
  ).toBe(task.id);
  await user.upload(
    screen.getByLabelText("Choose business documents"),
    new File(["%PDF-1.7\nRecord"], "formation.pdf", {
      type: "application/pdf",
    }),
  );
  await screen.findByText("formation.pdf");
  expect((await listDocuments("business-1"))[0]).toMatchObject({
    businessId: "business-1",
    taskId: task.id,
    taskTitle: task.title,
  });
  unmount();
  render(
    <Documents business="Brightside" businessId="business-1" tasks={[]} />,
  );
  await screen.findByText(/previous roadmap/);
  expect((await listDocuments("business-1"))[0].taskId).toBe(task.id);
});
it("rejects executable formats, MIME mismatches and disguised files", async () => {
  const { validateDocument } = await import("./documents");
  await expect(
    validateDocument(
      new File(["<script>bad</script>"], "unsafe.html", { type: "text/html" }),
    ),
  ).rejects.toThrow("unsupported file type");
  await expect(
    validateDocument(
      new File(["%PDF-1.7"], "wrong.pdf", { type: "text/html" }),
    ),
  ).rejects.toThrow("does not match");
  await expect(
    validateDocument(
      new File(["a script disguised as a PDF"], "fake.pdf", {
        type: "application/pdf",
      }),
    ),
  ).rejects.toThrow("contents do not match");
  await expect(
    validateDocument(new File([], "empty.txt", { type: "text/plain" })),
  ).rejects.toThrow("empty");
  await expect(
    validateDocument(
      new File(["%PDF-1.7\nRecord"], "valid.pdf", { type: "application/pdf" }),
    ),
  ).resolves.toBe("application/pdf");
});
it("does not remove a document when deletion is cancelled", async () => {
  const user = userEvent.setup();
  render(<Documents business="Brightside" />);
  await user.upload(
    screen.getByLabelText("Choose business documents"),
    new File(["Record"], "record.txt", { type: "text/plain" }),
  );
  await screen.findByText("record.txt");
  vi.spyOn(window, "confirm").mockReturnValue(false);
  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(await listDocuments()).toHaveLength(1);
});
