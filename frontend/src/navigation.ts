import type { Founder, Page } from "./state";
export function readNavigation(
  s: Founder,
  hash = window.location.hash,
): Partial<Founder> {
  const [path, query = ""] = hash.replace(/^#/, "").split("?"),
    [page, id] = path.split("/");
  if (["overview", "legal"].includes(page))
    return { page: s.launchReady ? "roadmap" : "discover" };
  if (page === "assistant") return { page: "discover" };
  if (!s.launchReady && ["task", "roadmap", "documents"].includes(page))
    return { page: "discover" };
  if (page === "task") {
    let taskId = id || "";
    try {
      taskId = decodeURIComponent(taskId);
    } catch {
      return { page: "roadmap", activeTask: 0 };
    }
    const index = s.roadmap.findIndex((t) => t.id === taskId);
    return index >= 0
      ? { page: "task", activeTask: index }
      : { page: "roadmap", activeTask: 0 };
  }
  if (
    [
      "overview",
      "discover",
      "roadmap",
      "legal",
      "documents",
      "assistant",
    ].includes(page)
  )
    return {
      page: page as Page,
      documentTaskId: new URLSearchParams(query).get("task") || "",
    };
  return { page: "discover" };
}
export function writeNavigation(s: Founder) {
  const task = s.roadmap[Math.min(s.activeTask, s.roadmap.length - 1)];
  const hash =
    s.page === "task" && task
      ? `#task/${encodeURIComponent(task.id)}`
      : s.page === "documents" && s.documentTaskId
        ? `#documents?task=${encodeURIComponent(s.documentTaskId)}`
        : `#${s.page}`;
  if (window.location.hash !== hash) window.history.pushState(null, "", hash);
}
