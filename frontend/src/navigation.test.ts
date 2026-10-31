import { expect, it } from "vitest";
import { readNavigation, writeNavigation } from "./navigation";
import { DEFAULT } from "./state";
it("resolves stable task links, document associations and malformed links", () => {
  const founder = {
    ...DEFAULT,
    launchReady: true,
    roadmap: [
      {
        id: "stable-task",
        stable_key: "common:formation",
        title: "Formation",
        position: 0,
        guide: { goal: "Review", actions: [], prepare: [], proof: "Reviewed" },
        completed: false,
      },
    ],
  };
  expect(readNavigation(founder, "#task/stable-task")).toMatchObject({
    page: "task",
    activeTask: 0,
  });
  expect(readNavigation(founder, "#task/archived-task").page).toBe("roadmap");
  expect(readNavigation(founder, "#task/%E0%A4%A").page).toBe("roadmap");
  expect(readNavigation(founder, "#documents?task=stable-task")).toMatchObject({
    page: "documents",
    documentTaskId: "stable-task",
  });
  writeNavigation({ ...founder, page: "task", activeTask: 0 });
  expect(location.hash).toBe("#task/stable-task");
  window.history.replaceState(null, "", window.location.pathname);
});
