import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { BusinessRecord } from "./api";
let business: BusinessRecord;
let history: { id: string; role: string; content: string }[];
let fail = false;
let pendingIdea = false;
let launched = 0;
const task = {
  id: "registration",
  stable_key: "common:formation",
  title: "Review entity registration, if appropriate",
  position: 0,
  completed: false,
  guide: {
    goal: "Review the process for Virginia software.",
    actions: ["Check the relevant instructions"],
    prepare: ["Business name"],
    proof: "Reviewed",
  },
};
beforeEach(() => {
  history = [];
  fail = false;
  pendingIdea = false;
  launched = 0;
  window.history.replaceState(null, "", "#discover");
  business = {
    id: "b",
    founder_id: "f",
    company_name: "Coffee Corner",
    idea: "Coffee for commuters",
    industry: "coffee",
    business_model: "mobile_cart",
    city: "Richmond",
    state: "Virginia",
    budget: "20000",
    ownership_details: "",
    legal_structure: "",
    details: { activities: ["coffee service"] },
    journey: "exploring",
    launch_ready: false,
    roadmap: [],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url),
        body = init?.body ? JSON.parse(String(init.body)) : {};
      if (path.endsWith("/navigation")) return Response.json({ ok: true });
      if (path.endsWith("/launch")) {
        launched++;
        business = { ...business, ...body.changes, launch_ready: true, roadmap: [task] };
        return Response.json(business);
      }
      if (path.endsWith("/discovery/messages")) {
        if (fail)
          return Response.json(
            { detail: "The AI provider is limiting requests (HTTP 429)." },
            { status: 503 },
          );
        history.push(
          { id: "u", role: "user", content: body.message },
          {
            id: "a",
            role: "assistant",
            content:
              "Compare a storefront, kiosk and mobile cart. Validate costs and location assumptions.",
          },
        );
        return Response.json({
          conversation: { id: "c", messages: history },
          questions: [],
          proposal: pendingIdea ? {id: "new-idea", status: "pending"} : null,
        });
      }
      if (path.endsWith("/discovery"))
        return Response.json({
          conversation: { id: "c", messages: history },
          questions: [],
          proposal: pendingIdea ? {id: "new-idea", status: "pending"} : null,
        });
      if (path.includes("/comparisons"))
        return Response.json({
          kind: "models",
          mode: init?.method === "POST" ? "live" : "guided",
          options: [
            {
              id: "mobile_cart",
              name: "Mobile coffee cart",
              fit: "For commuter service",
              advantages: ["Movable service setup"],
              disadvantages: ["Verify equipment and location access"],
              startup_costs: "Validate supplier quotes; no costs verified.",
              location_requirements: "Verify intended operating locations.",
              assumptions: ["Demand is unverified."],
            },
          ],
        });
      if (path.includes("/advisor/conversation"))
        return Response.json({
          id: "c",
          messages: history,
          scope: "task:registration",
          total_messages: history.length,
          summary: "",
        });
      if (path.endsWith("/advisor/chat")) {
        if (fail)
          return Response.json(
            { detail: "The AI provider is unavailable." },
            { status: 503 },
          );
        history.push({
          id: "reply",
          role: "assistant",
          content:
            "Review your saved structure and Virginia agency instructions.",
        });
        return Response.json({ answer: history.at(-1)!.content, mode: "live" });
      }
      if (path.endsWith("/requirements")) return Response.json([]);
      if (path.endsWith("/progress")) {
        business = {
          ...business,
          roadmap: [{ ...task, completed: body.completed }],
        };
        return Response.json(business);
      }
      if (path === "/api/businesses/b") return Response.json(business);
      return Response.json({});
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows only the current idea while exploring, without dashboards or project tools", async () => {
  render(<App projectId="b" />);
  await screen.findByRole("heading", { name: "Explore your business idea" });
  expect(screen.getAllByRole("navigation")[0].textContent).toBe(
    "My business idea",
  );
  expect(screen.queryByText("Dashboard")).toBeNull();
  expect(screen.queryByText("Business projects")).toBeNull();
  expect(screen.queryByRole("button", { name: "My roadmap" })).toBeNull();
  expect(screen.queryByText("Personalized suggestions")).toBeNull();
});
it("keeps exploring without generating a roadmap, then launches explicitly", async () => {
  const u = userEvent.setup();
  render(<App projectId="b" />);
  await screen.findByRole("heading", { name: "Explore your business idea" });
  await u.type(
    screen.getByRole("textbox", { name: "Describe your business idea" }),
    "I want to compare coffee shop options",
  );
  await u.click(screen.getByRole("button", { name: "Send →" }));
  await screen.findByRole("button", { name: "Keep Exploring" });
  expect(screen.queryByText("Mobile coffee cart")).toBeNull();
  await u.click(
    screen.getByRole("button", { name: "Compare business models with AI" }),
  );
  expect(await screen.findByText("Mobile coffee cart")).toBeTruthy();
  await u.click(screen.getByRole("button", { name: "Keep Exploring" }));
  expect(launched).toBe(0);
  expect(screen.queryByRole("button", { name: "My roadmap" })).toBeNull();
  await u.click(screen.getByRole("button", { name: "Continue to Launch" }));
  await screen.findByRole("heading", { name: "Your launch roadmap" });
  expect(launched).toBe(1);
  expect(screen.getByRole("button", { name: "My roadmap" })).toBeTruthy();
});
it("opens the four-section task guide and sends the actual task identity", async () => {
  business = {
    ...business,
    journey: "known",
    launch_ready: true,
    roadmap: [task],
  };
  window.history.replaceState(null, "", "#roadmap");
  const u = userEvent.setup();
  render(<App projectId="b" />);
  await screen.findByRole("heading", { name: "Your launch roadmap" });
  await u.click(screen.getByRole("button", { name: "Open step 1" }));
  await screen.findByRole("heading", { name: "Ask LaunchPilot AI" });
  expect(document.querySelectorAll(".task-guide-main>section")).toHaveLength(4);
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
    "Explain this simply",
  );
  await u.click(screen.getByRole("button", { name: "Send ↗" }));
  await screen.findByText(
    "Review your saved structure and Virginia agency instructions.",
  );
  const calls = vi.mocked(fetch).mock.calls;
  expect(
    JSON.parse(
      String(
        calls.find(([url]) => String(url).endsWith("/advisor/chat"))![1]!.body,
      ),
    ),
  ).toMatchObject({ task_id: "registration", question: "Explain this simply" });
});
it("shows an actual discovery failure and retains the question for retry", async () => {
  fail = true;
  const u = userEvent.setup();
  render(<App projectId="b" />);
  await screen.findByRole("heading", { name: "Explore your business idea" });
  await u.type(
    screen.getByRole("textbox", { name: "Describe your business idea" }),
    "A coffee shop",
  );
  await u.click(screen.getByRole("button", { name: "Send →" }));
  expect((await screen.findByRole("alert")).textContent).toContain("429");
  expect(
    (
      screen.getByRole("textbox", {
        name: "Describe your business idea",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("A coffee shop");
  expect(screen.queryByText(/Guided demo/)).toBeNull();
  expect(launched).toBe(0);
});
it("restores saved task conversations on refresh", async () => {
  business = { ...business, launch_ready: true, roadmap: [task] };
  history = [
    {
      id: "old",
      role: "assistant",
      content: "A previous discussion about this registration step.",
    },
  ];
  window.history.replaceState(null, "", "#task/registration");
  render(<App projectId="b" />);
  await screen.findByText(
    "A previous discussion about this registration step.",
  );
  expect(
    screen.getByRole("heading", { name: "Terms You Should Know" }),
  ).toBeTruthy();
});

it("returns to journey selection without changing the saved business", async () => {
  const onBack = vi.fn();
  render(<App projectId="b" onBack={onBack} />);
  await screen.findByRole("heading", { name: "Explore your business idea" });
  await userEvent.click(
    screen.getByRole("button", { name: "← Back to journey selection" }),
  );
  expect(onBack).toHaveBeenCalledOnce();
  expect(business.company_name).toBe("Coffee Corner");
});

it("does not show a previous business comparison while a new idea awaits review", async () => {
  business={...business,company_name:"LaunchPilot",industry:"software",business_model:"saas"};
  pendingIdea=true;
  const user=userEvent.setup();
  render(<App projectId="b"/>);
  await screen.findByRole("heading",{name:"Explore your business idea"});
  await user.type(screen.getByRole("textbox",{name:"Describe your business idea"}),"An Indian grocery store in Arizona");
  await user.click(screen.getByRole("button",{name:"Send →"}));
  await screen.findByText("Your new idea is ready to review");
  expect(screen.queryByRole("heading",{name:"Compare your business options"})).toBeNull();
  expect(screen.getByRole("button",{name:"Continue to Launch"}).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button",{name:"Review business details"})).toBeTruthy();
});

it("edits missing location details directly from exploration and opens the saved roadmap", async () => {
  business={...business,city:""};
  const user=userEvent.setup();
  render(<App projectId="b"/>);
  await screen.findByRole("heading",{name:"Explore your business idea"});
  await user.click(screen.getByRole("button",{name:"Edit business details"}));
  await screen.findByRole("heading",{name:"Your business details"});
  expect((screen.getByLabelText("Operating state") as HTMLInputElement).value).toBe("Virginia");
  await user.type(screen.getByLabelText("Operating city"),"Richmond");
  await user.click(screen.getByRole("button",{name:"Save and open my roadmap →"}));
  await screen.findByRole("heading",{name:"Your launch roadmap"});
  expect(business.city).toBe("Richmond");
  expect(launched).toBe(1);
});
it("opens the details form instead of a dead-end launch error when a city is missing", async () => {
  business={...business,city:""};
  const user=userEvent.setup();
  render(<App projectId="b"/>);
  await screen.findByRole("heading",{name:"Explore your business idea"});
  await user.type(screen.getByRole("textbox",{name:"Describe your business idea"}),"Compare my coffee options");
  await user.click(screen.getByRole("button",{name:"Send →"}));
  await user.click(await screen.findByRole("button",{name:"Continue to Launch"}));
  await screen.findByRole("heading",{name:"Your business details"});
  expect(launched).toBe(0);
});
