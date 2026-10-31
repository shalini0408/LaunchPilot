import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Portal from "./Portal";
vi.mock("./App", () => ({
  default: ({ projectId }: { projectId: string }) => (
    <div data-testid="workspace">Business {projectId}</div>
  ),
}));
let signed = false;
let projects: Record<string, unknown>[] = [];
let saved: Record<string, unknown>;
beforeEach(() => {
  signed = false;
  projects = [];
  saved = {
    id: "b",
    founder_id: "f",
    company_name: "",
    idea: "",
    industry: "",
    city: "",
    state: "",
    ownership_details: "",
    legal_structure: "",
    details: {},
    roadmap: [],
  };
  history.replaceState(null, "", "#signup");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url === "/api/auth/me")
        return Response.json(
          signed
            ? { id: "u", email: "founder@example.com" }
            : { detail: "Sign in" },
          { status: signed ? 200 : 401 },
        );
      if (url === "/api/auth/signup" || url === "/api/auth/signin") {
        signed = true;
        return Response.json({ id: "u", email: "founder@example.com" });
      }
      if (url === "/api/auth/logout") {
        signed = false;
        return Response.json({ ok: true });
      }
      if (url === "/api/projects" && init?.method === "POST") {
        if (projects.length)
          return Response.json(
            { detail: "One business per account" },
            { status: 409 },
          );
        const p = {
          id: "b",
          founder_id: "f",
          journey: "",
          onboarded: false,
          last_path: "",
        };
        projects.push(p);
        return Response.json(p, { status: 201 });
      }
      if (url === "/api/projects") return Response.json(projects);
      if (url === "/api/projects/f") {
        Object.assign(projects[0], body);
        return Response.json(projects[0]);
      }
      if (url === "/api/businesses/b/launch") {
        Object.assign(saved, body.changes);
        projects[0].onboarded = true;
        projects[0].last_path = "#roadmap";
        return Response.json({ ...saved, launch_ready: true });
      }
      if (url === "/api/businesses/b") return Response.json(saved);
      throw Error("Unexpected " + url);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function register() {
  const u = userEvent.setup();
  await screen.findByRole("heading", { name: "Create your account" });
  await u.type(screen.getByLabelText("Email address"), "founder@example.com");
  await u.type(screen.getByLabelText("Password"), "Test-password-6349!");
  await u.click(screen.getByRole("button", { name: "Sign Up →" }));
  await screen.findByRole("heading", {
    name: "Where are you in your business journey?",
  });
  return u;
}
it("offers exactly the two requested journeys with a visible logout", async () => {
  render(<Portal />);
  await register();
  expect(document.querySelectorAll(".journey-options>button")).toHaveLength(2);
  expect(
    screen.getByRole("heading", { name: "I'm Ready to Launch My Business" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("heading", {
      name: "I'm Still Exploring My Business Idea",
    }),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Log Out" })).toBeTruthy();
  expect(screen.queryByText("Business projects")).toBeNull();
});
it("collects ready-to-launch details without requiring a legal structure", async () => {
  render(<Portal />);
  const u = await register();
  await u.click(document.querySelector(".journey-option.known")!);
  await screen.findByRole("heading", { name: "Your business details" });
  await u.type(
    screen.getByLabelText("Description of the business"),
    "A booking app",
  );
  await u.type(screen.getByLabelText("Industry or business category"), "Dental clinic");
  await u.type(screen.getByLabelText("Operating city"), "Richmond");
  await u.type(screen.getByLabelText("Operating state"), "Virginia");
  await u.click(
    screen.getByRole("button", { name: "Save and open my roadmap →" }),
  );
  await screen.findByTestId("workspace");
  expect(projects).toHaveLength(1);
  expect(saved.legal_structure).toBe("");
  expect(saved.city).toBe("Richmond");
  expect(location.hash).toBe("#roadmap");
});
it("enters exploration without creating another project or marking launch complete", async () => {
  render(<Portal />);
  const u = await register();
  await u.click(document.querySelector(".journey-option.exploring")!);
  await screen.findByTestId("workspace");
  expect(projects).toHaveLength(1);
  expect(projects[0]).toMatchObject({ journey: "exploring", onboarded: false });
  expect(location.hash).toBe("#discover");
  expect(screen.queryByText(/Start another/)).toBeNull();
  await u.click(screen.getByRole("button", { name: "Log Out" }));
  await screen.findByRole("heading", {
    name: "From Business Idea to Business Launch.",
  });
});
it("resumes the server-saved task instead of opening a dashboard", async () => {
  signed = true;
  projects = [
    {
      id: "b",
      founder_id: "f",
      journey: "known",
      onboarded: true,
      last_path: "#task/registration",
    },
  ];
  history.replaceState(null, "", "#resume");
  render(<Portal />);
  await screen.findByTestId("workspace");
  expect(location.hash).toBe("#task/registration");
  expect(
    screen.queryByRole("heading", {
      name: "Where are you in your business journey?",
    }),
  ).toBeNull();
});
it("protects a signed-out deep link", async () => {
  history.replaceState(null, "", "#task/private");
  render(<Portal />);
  await screen.findByRole("heading", {
    name: "From Business Idea to Business Launch.",
  });
  expect(screen.queryByTestId("workspace")).toBeNull();
});
