import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DiscoveryAdvisor from "./components/DiscoveryAdvisor";
import Comparisons from "./components/Comparisons";
import Recommendations from "./components/Recommendations";
import DecisionReview from "./components/DecisionReview";
import Chat from "./components/Chat";
import { DEFAULT } from "./state";
import {
  getDiscovery,
  sendDiscovery,
  answerDiscovery,
  getComparison,
  generateComparison,
  getRecommendations,
  generateRecommendations,
  recommendationFeedback,
  getConversation,
  askBusinessAdvisor,
  proposeDecision,
  type Decision,
  type Comparison,
} from "./api";
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  getDiscovery: vi.fn(),
  sendDiscovery: vi.fn(),
  answerDiscovery: vi.fn(),
  getComparison: vi.fn(),
  generateComparison: vi.fn(),
  getRecommendations: vi.fn(),
  generateRecommendations: vi.fn(),
  recommendationFeedback: vi.fn(),
  getConversation: vi.fn(),
  askBusinessAdvisor: vi.fn(),
  proposeDecision: vi.fn(),
}));
const founder = {
  ...DEFAULT,
  businessId: "business",
  type: "bakery",
  city: "San Francisco",
  state: "California",
  budget: "40000",
  details: { activities: ["baking"], goals: "Start small" },
};
const decision: Decision = {
  id: "decision",
  status: "pending",
  origin: "discovery",
  requires_confirmation: true,
  differences: [{ field: "business_model", before: "store", after: "home" }],
  roadmap_changes: {
    added: ["Check home kitchen eligibility"],
    archived: ["Review retail premises"],
    preserved_completed: ["Choose business structure"],
    regulatory_revalidation: 2,
  },
};
const comparison: Comparison = {
  kind: "models",
  mode: "guided",
  explanation: "Qualitative planning, not verified cost estimates.",
  questions: [],
  options: ["home", "store", "shared_kitchen"].map((id) => ({
    id,
    name: {
      home: "Home-based bakery",
      store: "Storefront bakery",
      shared_kitchen: "Shared commercial kitchen",
    }[id]!,
    startup_costs: "Validate actual costs.",
    operational_complexity: "Compare production needs.",
    customer_acquisition: "Test channels.",
    scalability: "Compare capacity.",
    location_requirements: "Verify your address.",
    regulatory_considerations: "Needs agency verification.",
    risks: ["Unknown costs"],
    advantages: ["Explore fit"],
    disadvantages: ["Needs validation"],
    fit: "Compare against your 40000 budget.",
    assumptions: ["Demand is not verified."],
    missing_information: ["Product details"],
    sources: [],
  })),
};
beforeEach(() => {
  vi.mocked(getDiscovery).mockResolvedValue({
    conversation: {
      id: "discovery",
      scope: "discovery",
      messages: [],
      summary: "",
      total_messages: 0,
    },
    questions: [
      {
        field: "activities",
        text: "What will you bake?",
        optional: true,
        choices: [],
      },
      {
        field: "country",
        text: "Which country?",
        optional: false,
        choices: [],
      },
    ],
  });
  vi.mocked(getComparison).mockResolvedValue(comparison);
  vi.mocked(generateComparison).mockResolvedValue({
    ...comparison,
    mode: "live",
  });
  vi.mocked(getRecommendations).mockResolvedValue([]);
  vi.mocked(getConversation).mockResolvedValue({
    id: "conversation",
    scope: "advisor",
    messages: [],
    summary: "",
    total_messages: 0,
  });
  vi.mocked(proposeDecision).mockResolvedValue(decision);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("reviews extracted business information and never applies it automatically", async () => {
  const review = vi.fn(),
    update = vi.fn(),
    user = userEvent.setup();
  vi.mocked(sendDiscovery).mockResolvedValue({
    conversation: {
      id: "discovery",
      scope: "discovery",
      summary: "",
      total_messages: 2,
      messages: [
        { id: "1", role: "user", content: "Bakery with 40000 budget" },
        { id: "2", role: "assistant", content: "Review the extracted facts." },
      ],
    },
    proposal: decision,
    questions: [],
  });
  render(
    <DiscoveryAdvisor
      founder={founder}
      update={update}
      reviewDecision={review}
    />,
  );
  await screen.findByLabelText("What will you bake?");
  await user.type(
    screen.getByRole("textbox", { name: "Describe your business idea" }),
    "Bakery with 40000 budget",
  );
  await user.click(screen.getByRole("button", { name: "Explore idea →" }));
  await screen.findByText("Review the extracted facts.");
  expect(review).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Review extracted profile" }),
  );
  expect(review).toHaveBeenCalledWith(decision);
});
it("asks at most two questions and supports skipped or undecided answers", async () => {
  vi.mocked(answerDiscovery).mockResolvedValue({
    proposal: decision,
    questions: [],
  });
  const review = vi.fn(),
    user = userEvent.setup();
  render(
    <DiscoveryAdvisor
      founder={founder}
      update={vi.fn()}
      reviewDecision={review}
    />,
  );
  await screen.findByLabelText("What will you bake?");
  expect(screen.getAllByRole("button", { name: "Skip question" })).toHaveLength(
    2,
  );
  await user.click(
    screen.getAllByRole("button", { name: "I haven't decided yet" })[0],
  );
  expect(answerDiscovery).toHaveBeenCalledWith(
    "business",
    "activities",
    "",
    "undecided",
  );
  expect(review).toHaveBeenCalled();
});
it("compares two or more models side by side and reviews a selected model", async () => {
  const review = vi.fn(),
    user = userEvent.setup();
  render(
    <Comparisons founder={founder} update={vi.fn()} reviewDecision={review} />,
  );
  await screen.findByRole("heading", { name: "Home-based bakery" });
  expect(
    screen.queryByRole("heading", { name: "Shared commercial kitchen" }),
  ).toBeNull();
  await user.click(
    screen.getByRole("checkbox", { name: "Compare Shared commercial kitchen" }),
  );
  expect(
    screen.getByRole("heading", { name: "Shared commercial kitchen" }),
  ).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Review Shared commercial kitchen" }),
  );
  expect(proposeDecision).toHaveBeenCalledWith(
    "business",
    { business_model: "shared_kitchen" },
    "comparison",
  );
  expect(review).toHaveBeenCalledWith(decision);
});
it("shows roadmap effects and requires an explicit confirmation action", async () => {
  const apply = vi.fn(),
    cancel = vi.fn(),
    user = userEvent.setup();
  render(
    <DecisionReview decision={decision} onConfirm={apply} onCancel={cancel} />,
  );
  expect(
    screen.getByText(/2 regulatory findings need revalidation/),
  ).toBeTruthy();
  expect(apply).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Keep current profile" }),
  );
  expect(cancel).toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirm changes" }));
  expect(apply).toHaveBeenCalledOnce();
});
it("saves or dismisses recommendations and previews acceptance before changes", async () => {
  const rec = {
    id: "rec",
    status: "new",
    category: "next_actions" as const,
    title: "Validate your offer",
    action: "Interview customers.",
    explanation: "Learn before spending.",
    fit: "For your baking activities.",
    advantages: ["Learn"],
    tradeoffs: ["Time"],
    assumptions: ["Unverified demand"],
    missing_information: ["Feedback"],
    sources: [],
  };
  vi.mocked(generateRecommendations).mockResolvedValue([rec]);
  vi.mocked(recommendationFeedback)
    .mockResolvedValueOnce({ status: "saved" })
    .mockResolvedValueOnce({ proposal: decision });
  const user = userEvent.setup(),
    review = vi.fn();
  render(
    <Recommendations
      founder={founder}
      update={vi.fn()}
      reviewDecision={review}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Generate recommendations" }),
  );
  await screen.findByText("Validate your offer");
  await user.click(screen.getByRole("button", { name: "Save recommendation" }));
  await screen.findByText("saved");
  await user.click(screen.getByRole("button", { name: "Review & accept" }));
  expect(review).toHaveBeenCalledWith(decision);
  expect(recommendationFeedback).toHaveBeenNthCalledWith(
    2,
    "business",
    "rec",
    "accept",
  );
});
it("restores the advisor conversation and sends workspace questions without a task", async () => {
  vi.mocked(getConversation).mockResolvedValue({
    id: "conversation",
    scope: "advisor",
    messages: [
      { id: "old", role: "assistant", content: "Your previous discussion." },
    ],
    summary: "",
    total_messages: 1,
  });
  vi.mocked(askBusinessAdvisor).mockResolvedValue({
    answer: "Planning assumption: test demand before a lease.",
    mode: "live",
  });
  const user = userEvent.setup();
  render(<Chat founder={founder} title="Your business launch" workspace />);
  await screen.findByText("Your previous discussion.");
  await user.type(
    screen.getByRole("textbox", { name: "Ask a question" }),
    "What should I do before signing a lease?",
  );
  await user.click(screen.getByRole("button", { name: "Send ↗" }));
  await screen.findByText("Planning assumption: test demand before a lease.");
  expect(
    vi.mocked(askBusinessAdvisor).mock.calls[0][0].task_id,
  ).toBeUndefined();
});
