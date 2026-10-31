import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import AnswerContent from "./components/AnswerContent";
import PreparationExample from "./components/PreparationExample";
import userEvent from "@testing-library/user-event";
import { DEFAULT } from "./state";
afterEach(cleanup);
it("renders the screenshot-style inline numbered answer as boxed options", () => {
  const { container } = render(
    <AnswerContent
      text={
        "Consider these choices. 1. **Location**: Check access and parking. 2. **Suppliers**: Compare product availability."
      }
    />,
  );
  expect(container.querySelectorAll(".answer-option")).toHaveLength(2);
  expect(screen.getByRole("heading", { name: "Location" })).toBeTruthy();
  expect(container.textContent).not.toContain("**");
});
it("keeps model HTML inert", () => {
  const { container } = render(
    <AnswerContent
      text={"<script>alert(1)</script> **Prepare** your questions."}
    />,
  );
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("strong")?.textContent).toBe("Prepare");
});
it("shows a preparation example without pretending it is an official form", async () => {
  render(
    <PreparationExample
      founder={{ ...DEFAULT, name: "My grocery" }}
      title="Review registration"
      items={[{ text: "Business name", kind: "Information to prepare" }]}
    />,
  );
  await userEvent.click(
    screen.getByText("See a preparation worksheet example"),
  );
  expect(await screen.findByText(/not an official application/)).toBeTruthy();
  expect(
    screen.getByRole("button", { name: /Download preparation/ }),
  ).toBeTruthy();
});
