import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResearchPanel from "./components/ResearchPanel";
import Task from "./components/Task";
import { DEFAULT, type Founder } from "./state";
import {
  getResearchStatus,
  getResearchedRequirements,
  startResearch,
  getRequirement,
  getConversation,
  askBusinessAdvisor,
  type RegulatoryRequirement,
  type ResearchStatus,
} from "./api";
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  getResearchStatus: vi.fn(),
  getResearchedRequirements: vi.fn(),
  startResearch: vi.fn(),
  getRequirement: vi.fn(),
  getConversation: vi.fn(),
  askBusinessAdvisor: vi.fn(),
}));
const finding: RegulatoryRequirement = {
  id: "req-1",
  business_id: "business-1",
  task_id: "task-1",
  run_id: "run-1",
  name: "Food registration",
  description: "The page describes registration for food businesses.",
  agency: "Official agency",
  jurisdiction: "San Francisco",
  business_activity: "Home bakery",
  applicability: "needs_verification",
  reason: "Exact product eligibility needs confirmation.",
  source_url: "https://sf.gov/food",
  application_url: "https://sf.gov/apply",
  required_information: ["Legal business name"],
  steps: ["Confirm eligibility", "Apply on the agency site"],
  fees: [
    {
      value: "$25",
      url: "https://sf.gov/food",
      source_id: "source-1",
      excerpt: "The page states a fee of $25.",
    },
  ],
  deadlines: [],
  evidence: [
    {
      source_id: "source-1",
      excerpt: "Businesses must register with the agency before opening.",
      url: "https://sf.gov/food",
    },
  ],
  verification_notes: ["Confirm the specific products."],
  missing_information: ["Products"],
  conflicts: [],
  needs_revalidation: false,
  last_checked: "2026-10-30T15:00:00Z",
  sources: [
    {
      id: "source-1",
      url: "https://sf.gov/food",
      title: "Official food instructions",
      agency: "Official agency",
      jurisdiction: "San Francisco",
      retrieved_at: "2026-10-30T15:00:00Z",
      published_date: null,
      updated_date: "2026-10-01",
    },
  ],
};
const founder: Founder = {
  ...DEFAULT,
  businessId: "business-1",
  name: "My bakery",
  type: "bakery",
  model: "home",
  city: "San Francisco",
  state: "California",
};
const idle: ResearchStatus = {
  status: "not_started",
  stage: "not_started",
  message: "No research has been run.",
  stale: false,
  warnings: [],
};
const complete: ResearchStatus = {
  id: "run-1",
  status: "complete",
  stage: "complete",
  message: "Research finished.",
  warnings: ["Local evidence may be incomplete."],
  stale: false,
  completed_at: "2026-10-30T15:00:00Z",
  expires_at: "2026-10-31T15:00:00Z",
};
beforeEach(() => {
  vi.mocked(getConversation).mockResolvedValue({
    id: "c",
    scope: "advisor",
    messages: [],
    summary: "",
    total_messages: 0,
  });
  vi.mocked(getResearchStatus).mockResolvedValue(idle);
  vi.mocked(getResearchedRequirements).mockResolvedValue([]);
  vi.mocked(getRequirement).mockResolvedValue(finding);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("starts research, polls progress, refreshes the roadmap and displays a cited guide with advisor", async () => {
  let started = false,
    checks = 0;
  vi.mocked(getResearchStatus).mockImplementation(async () =>
    !started
      ? idle
      : ++checks > 1
        ? complete
        : {
            ...idle,
            id: "run-1",
            status: "running",
            stage: "extracting",
            message: "Checking supporting evidence.",
          },
  );
  vi.mocked(startResearch).mockImplementation(async () => {
    started = true;
    return { ...idle, id: "run-1", status: "queued", stage: "queued" };
  });
  vi.mocked(getResearchedRequirements).mockImplementation(async () =>
    checks > 1 ? [finding] : [],
  );
  vi.mocked(askBusinessAdvisor).mockResolvedValue({
    answer: "I cannot verify eligibility from the supplied evidence.",
    mode: "demo",
    evidence_based: true,
    citations: [
      {
        url: "https://sf.gov/food",
        title: "Official food instructions",
        excerpt: "Businesses must register with the agency before opening.",
      },
    ],
  });
  const reload = vi.fn().mockResolvedValue(undefined),
    user = userEvent.setup();
  render(<ResearchPanel founder={founder} update={vi.fn()} reload={reload} />);
  await user.click(
    screen.getByRole("button", { name: "Research Regulations" }),
  );
  await waitFor(
    () => expect(screen.getByText("Food registration")).toBeTruthy(),
    { timeout: 5000 },
  );
  expect(reload).toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "View Guide →" }));
  expect(
    screen.getByRole("heading", { name: "What Is This Step?" }),
  ).toBeTruthy();
  expect(screen.getByText("Legal business name")).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: "Open verified official application page ↗" })
      .getAttribute("href"),
  ).toBe("https://sf.gov/apply");
  expect(
    screen
      .getByRole("link", { name: /Search tutorial videos/ })
      .getAttribute("href"),
  ).toContain("youtube.com");
  expect(screen.getAllByText(/Retrieved/).length).toBeGreaterThan(0);
  expect(screen.getByRole("textbox", { name: "Ask a question" })).toBeTruthy();
  await user.type(
    screen.getByRole("textbox", { name: "Ask a question" }),
    "What applies?",
  );
  await user.click(screen.getByRole("button", { name: "Send ↗" }));
  await screen.findByText(
    "I cannot verify eligibility from the supplied evidence.",
  );
  expect(vi.mocked(askBusinessAdvisor).mock.calls[0][0]).toMatchObject({
    business_id: "business-1",
    requirement_id: "req-1",
  });
  expect(
    screen.getByRole("link", { name: "[1] Official food instructions" }),
  ).toBeTruthy();
});
it("shows missing configuration clearly and allows retry", async () => {
  vi.mocked(startResearch)
    .mockRejectedValueOnce(
      Error("Configure BRAVE_SEARCH_API_KEY in backend/.env."),
    )
    .mockImplementationOnce(async () => {
      vi.mocked(getResearchStatus).mockResolvedValue(complete);
      return complete;
    });
  const user = userEvent.setup();
  render(<ResearchPanel founder={founder} update={vi.fn()} />);
  await user.click(
    screen.getByRole("button", { name: "Research Regulations" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "BRAVE_SEARCH_API_KEY",
  );
  await user.click(
    screen.getByRole("button", { name: "Research Regulations" }),
  );
  await screen.findByText(/Research finished/);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    screen.getByText(/does not mean your business has no obligations/),
  ).toBeTruthy();
});
it("shows stale evidence and sends an explicit refresh request", async () => {
  vi.mocked(getResearchStatus).mockResolvedValue({ ...complete, stale: true });
  vi.mocked(getResearchedRequirements).mockResolvedValue([
    { ...finding, needs_revalidation: true },
  ]);
  vi.mocked(startResearch).mockResolvedValue(complete);
  const user = userEvent.setup();
  render(<ResearchPanel founder={founder} update={vi.fn()} />);
  await screen.findByText(/Your research needs revalidation/);
  await user.click(screen.getByRole("button", { name: "Refresh research ↻" }));
  expect(startResearch).toHaveBeenCalledWith("business-1", true);
});
it("opens a researched roadmap guide while retaining manual completion and document upload", async () => {
  const s = {
    ...founder,
    roadmap: [
      {
        id: "task-1",
        stable_key: "regulatory:one",
        title: finding.name,
        position: 1000,
        guide: {
          goal: finding.description,
          actions: finding.steps,
          prepare: finding.required_information,
          proof: "Agency confirmation",
        },
        completed: false,
        kind: "regulatory" as const,
        requirement_id: "req-1",
      },
    ],
  };
  const finish = vi.fn(),
    update = vi.fn(),
    user = userEvent.setup();
  render(<Task founder={s} complete={finish} update={update} />);
  await screen.findByRole("heading", { name: "Food registration" });
  expect(finish).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "View all business documents" }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Mark completed ✓" }));
  expect(finish).toHaveBeenCalledWith(0, true);
});
it("requires a saved location before research", () => {
  render(<ResearchPanel founder={{ ...founder, city: "" }} update={vi.fn()} />);
  expect(
    (
      screen.getByRole("button", {
        name: "Research Regulations",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
