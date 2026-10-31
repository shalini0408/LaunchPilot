import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TaskDocumentUpload from "./components/TaskDocumentUpload";
import { DEFAULT } from "./state";
const founder = {
  ...DEFAULT,
  businessId: "my-business",
  name: "My grocery",
  activeTask: 0,
  roadmap: [
    {
      id: "registration",
      stable_key: "common:formation",
      title: "Review registration",
      position: 0,
      completed: false,
      guide: { goal: "", actions: [], prepare: [], proof: "" },
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("uploads a filled document to the current business and step and opens the shared vault", async () => {
  const fetcher = vi.fn(async () => Response.json({ id: 1 }, { status: 201 }));
  vi.stubGlobal("fetch", fetcher);
  const open = vi.fn(),
    user = userEvent.setup();
  render(<TaskDocumentUpload founder={founder} onViewAll={open} />);
  await user.upload(
    screen.getByLabelText("Upload filled documents"),
    new File(["%PDF-1.7\nCompleted record"], "filled.pdf", {
      type: "application/pdf",
    }),
  );
  await screen.findByText(/Saved for this step: filled.pdf/);
  const [url, options] = fetcher.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("/api/businesses/my-business/documents");
  expect((options.body as FormData).get("task_id")).toBe("registration");
  expect(founder.roadmap[0].completed).toBe(false);
  await user.click(
    screen.getByRole("button", { name: "View all business documents" }),
  );
  expect(open).toHaveBeenCalledOnce();
});
it("reports a failed upload without claiming it was saved and allows retry", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { status: 500 }))
    .mockResolvedValueOnce(Response.json({ id: 2 }, { status: 201 }));
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup(),
    file = new File(["Completed worksheet"], "worksheet.txt", {
      type: "text/plain",
    });
  render(<TaskDocumentUpload founder={founder} onViewAll={vi.fn()} />);
  await user.upload(screen.getByLabelText("Upload filled documents"), file);
  await screen.findByRole("alert");
  expect(screen.queryByText(/Saved for this step:/)).toBeNull();
  await user.upload(screen.getByLabelText("Upload filled documents"), file);
  await screen.findByText(/Saved for this step: worksheet.txt/);
});
