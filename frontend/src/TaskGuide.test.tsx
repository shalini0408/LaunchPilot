import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Task from "./components/Task";
import Chat from "./components/Chat";
import { DEFAULT, type Founder } from "./state";
import {
  getConversation,
  getResearchedRequirements,
  getRequirement,
  askBusinessAdvisor,
  type RegulatoryRequirement,
} from "./api";
import { taskContent, curatedResources } from "./taskContent";
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  getConversation: vi.fn(),
  getResearchedRequirements: vi.fn(),
  getRequirement: vi.fn(),
  askBusinessAdvisor: vi.fn(),
}));
const founder: Founder = {
  ...DEFAULT,
  businessId: "business",
  name: "Nimbus",
  type: "software",
  model: "saas",
  city: "Richmond",
  state: "Virginia",
  page: "task",
  roadmap: [
    {
      id: "privacy",
      stable_key: "software:privacy",
      title: "Review privacy and data practices",
      guide: {
        goal: "Turn this roadmap item into a concrete deliverable.",
        actions: [],
        prepare: [],
        proof: "",
      },
      position: 0,
      completed: false,
    },
  ],
};
beforeEach(() => {
  vi.mocked(getConversation).mockResolvedValue({
    id: "c",
    scope: "task:privacy",
    messages: [],
    summary: "",
    total_messages: 0,
  });
  vi.mocked(getResearchedRequirements).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("shows exactly four focused sections and only chat in the right column", async () => {
  const update = vi.fn();
  render(<Task founder={founder} update={update} complete={vi.fn()} />);
  await screen.findByRole("heading", { name: "Ask LaunchPilot AI" });
  const main = document.querySelector(".task-guide-main")!;
  expect(
    within(main as HTMLElement)
      .getAllByRole("heading", { level: 2 })
      .map((e) => e.textContent),
  ).toEqual([
    "What Is This Step?",
    "Terms You Should Know",
    "Documents Needed",
    "Helpful Resources",
  ]);
  expect(screen.queryByText(/Turn this roadmap item/)).toBeNull();
  expect(screen.queryByText("Guided planning tips")).toBeNull();
  expect(screen.queryByText("Personalized recommendations")).toBeNull();
  expect(screen.getByText("Personal information")).toBeTruthy();
  expect(screen.queryByText("LLC")).toBeNull();
  expect(document.querySelector(".task-guide-section")!.textContent).toContain(
    "Nimbus",
  );
  expect(document.querySelector(".task-guide-section")!.textContent).toContain(
    "Richmond",
  );
  expect(
    screen.getByText(/No official resources have been verified/),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("link", { name: /Search tutorial videos/ })
      .getAttribute("href"),
  ).toContain("youtube.com/results?search_query=Review%20privacy");
  await userEvent.click(
    screen.getByRole("button", { name: "View all business documents" }),
  );
  expect(update).toHaveBeenCalledWith({
    page: "documents",
    documentTaskId: "privacy",
  });
});
it("keeps terminology specific and never treats a generated preparation list as mandatory", () => {
  const structure = taskContent(founder, "Choose business structure and name");
  const privacy = taskContent(founder, "Review privacy and data practices");
  const labeling = taskContent(
    { ...founder, type: "ecommerce" },
    "Validate product and labeling rules",
  );
  expect(labeling.terms.some(([term]) => term === "Food safety")).toBe(false);
  expect(
    labeling.terms.some(([term]) => term === "Product specification"),
  ).toBe(true);
  expect(
    taskContent(founder, "Review activity-specific obligations").terms.some(
      ([term]) => term === "Registered agent",
    ),
  ).toBe(false);
  expect(structure.terms.some(([t]) => t === "LLC")).toBe(true);
  expect(privacy.terms.some(([t]) => t === "LLC")).toBe(false);
  expect(privacy.docs.every((d) => !d.kind.startsWith("Required"))).toBe(true);
  expect(
    curatedResources(founder, "Register your business with the state"),
  ).toEqual([]);
  expect(
    taskContent(
      founder,
      "Validate customer acquisition assumptions",
    ).docs.every((d) => d.kind === "Information to prepare"),
  ).toBe(true);
});
it("uses verified application links, suppresses unsafe URLs and labels uncertain documents", async () => {
  const finding = {
    id: "r",
    name: "Review privacy and data practices",
    description: "Review the official instructions.",
    reason: "Confirm the data activities.",
    agency: "Official agency",
    jurisdiction: "Virginia",
    source_url: "javascript:alert(1)",
    application_url: "https://agency.gov/apply",
    last_checked: "2026-10-01T00:00:00Z",
    sources: [],
    required_information: ["Business name"],
    evidence: [],
    applicability: "needs_verification",
    needs_revalidation: false,
  } as unknown as RegulatoryRequirement;
  vi.mocked(getRequirement).mockResolvedValue(finding);
  render(
    <Task
      founder={{
        ...founder,
        roadmap: [
          { ...founder.roadmap[0], kind: "regulatory", requirement_id: "r" },
        ],
      }}
      update={vi.fn()}
      complete={vi.fn()}
    />,
  );
  await screen.findByRole("link", {
    name: "Open verified official application page ↗",
  });
  expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  expect(screen.getByText("May be needed — confirm with agency")).toBeTruthy();
});
it("shows the actual chat failure and retries without a fake reply or duplicated user bubble", async () => {
  vi.mocked(askBusinessAdvisor)
    .mockRejectedValueOnce(
      Error("The AI provider is limiting requests (HTTP 429)."),
    )
    .mockResolvedValueOnce({
      answer: "Here is a simpler explanation.",
      mode: "live",
    });
  const u = userEvent.setup();
  render(<Chat founder={founder} title={founder.roadmap[0].title} />);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("textbox", {
          name: "Ask a question",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(false),
  );
  await u.click(
    screen.getByRole("button", {
      name: "Can you explain this in simpler terms?",
    }),
  );
  await u.click(screen.getByRole("button", { name: "Send ↗" }));
  expect((await screen.findByRole("alert")).textContent).toContain("HTTP 429");
  expect(screen.queryByText(/Guided demo/)).toBeNull();
  await u.click(screen.getByRole("button", { name: "Retry message" }));
  await screen.findByText("Here is a simpler explanation.");
  expect(document.querySelectorAll(".bubble.user")).toHaveLength(1);
  expect(vi.mocked(askBusinessAdvisor).mock.calls[1][0].task_id).toBe(
    "privacy",
  );
});
it("prevents history from overwriting a newly submitted message", async () => {
  let finish!: (value: Awaited<ReturnType<typeof getConversation>>) => void;
  vi.mocked(getConversation).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<Chat founder={founder} title={founder.roadmap[0].title} />);
  expect(
    (
      screen.getByRole("textbox", {
        name: "Ask a question",
      }) as HTMLInputElement
    ).disabled,
  ).toBe(true);
  await act(async () =>
    finish({
      id: "c",
      scope: "task:privacy",
      messages: [
        { id: "old", role: "assistant", content: "Previous discussion" },
      ],
      summary: "",
      total_messages: 1,
    }),
  );
  expect(screen.getByText("Previous discussion")).toBeTruthy();
  expect(
    (
      screen.getByRole("textbox", {
        name: "Ask a question",
      }) as HTMLInputElement
    ).disabled,
  ).toBe(false);
});
it("does not place a late reply into a different task conversation", async () => {
  let finish!: (value: Awaited<ReturnType<typeof askBusinessAdvisor>>) => void;
  vi.mocked(askBusinessAdvisor).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const u = userEvent.setup();
  const view = render(
    <Chat founder={founder} title={founder.roadmap[0].title} />,
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("textbox", {
          name: "Ask a question",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(false),
  );
  await u.type(
    screen.getByRole("textbox", { name: "Ask a question" }),
    "Explain privacy",
  );
  await u.click(screen.getByRole("button", { name: "Send ↗" }));
  const next = {
    ...founder,
    roadmap: [
      {
        ...founder.roadmap[0],
        id: "contracts",
        title: "Prepare client contracts and IP terms",
      },
    ],
  };
  view.rerender(<Chat founder={next} title={next.roadmap[0].title} />);
  await act(async () => finish({ answer: "Old privacy answer", mode: "live" }));
  expect(screen.queryByText("Old privacy answer")).toBeNull();
  expect(screen.queryByText("Explain privacy")).toBeNull();
  expect(vi.mocked(getConversation)).toHaveBeenLastCalledWith(
    "business",
    "task:contracts",
  );
});
