import type { ScreenProps } from "../state";
export default function Journey({ founder: s, update }: ScreenProps) {
  const steps = [
    { label: "Idea", done: !!(s.idea || s.type), page: "discover" as const },
    { label: "Model", done: !!s.model, page: "discover" as const },
    {
      label: "Structure",
      done: !!s.legalStructure && s.legalStructure !== "undecided",
      page: "roadmap" as const,
    },
    {
      label: "Roadmap",
      done: s.roadmap.some((t) => t.completed),
      page: "roadmap" as const,
    },
    {
      label: "Regulations",
      done: s.roadmap.some((t) => t.kind === "regulatory"),
      page: "legal" as const,
    },
    { label: "Documents", done: false, page: "documents" as const },
  ];
  return (
    <nav className="journey" aria-label="Launch journey">
      {steps.map((step, i) => (
        <button
          key={step.label}
          className={step.done ? "journey-step ready" : "journey-step"}
          onClick={() => {
            const structure = s.roadmap.findIndex(
              (t) => t.stable_key === "common:structure",
            );
            update(
              step.label === "Structure" && structure >= 0
                ? { page: "task", activeTask: structure }
                : { page: step.page },
            );
          }}
        >
          <span aria-hidden="true">{step.done ? "✓" : i + 1}</span>
          {step.label}
        </button>
      ))}
    </nav>
  );
}
