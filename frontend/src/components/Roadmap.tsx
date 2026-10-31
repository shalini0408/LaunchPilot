import type { ScreenProps } from "../state";
export default function Roadmap({
  founder: s,
  update,
  complete,
}: ScreenProps & { complete: (index: number, value: boolean) => void }) {
  const count = s.roadmap.filter((t) => t.completed).length;
  return (
    <div className="flow-roadmap">
      <h1>Your launch roadmap</h1>
      <p>
        {[s.name || "Your business", s.city, s.state]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="mini muted">
        {count} of {s.roadmap.length} steps complete. Review applicability
        before taking legal or regulatory action.
      </p>
      {!s.roadmap.length ? (
        <p>
          No roadmap steps are available yet. Return to your business idea and
          confirm your launch details.
        </p>
      ) : (
        <div className="steps">
          {s.roadmap.map((task, i) => (
            <div className="step" key={task.id}>
              <span className="num">{i + 1}</span>
              <div className="grow">
                <strong>{task.title}</strong>
                {task.needs_revalidation && (
                  <small>
                    Review needed after a business change or expired research.
                  </small>
                )}
              </div>
              <button
                className="stepopen"
                aria-label={"Open step " + (i + 1)}
                onClick={() => update({ page: "task", activeTask: i })}
              >
                View guide →
              </button>
              <input
                className="check"
                type="checkbox"
                aria-label={"Mark " + task.title + " complete"}
                checked={task.completed}
                disabled={
                  task.kind === "regulatory" &&
                  task.needs_revalidation &&
                  !task.completed
                }
                onChange={(e) => complete(i, e.target.checked)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
