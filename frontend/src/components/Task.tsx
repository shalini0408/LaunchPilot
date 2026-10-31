import { getSteps, taskKey, type ScreenProps } from "../state";
import TaskGuide from "./TaskGuide";
export default function Task(
  props: ScreenProps & { complete: (index: number, value: boolean) => void },
) {
  const s = props.founder,
    steps = getSteps(s),
    index = Math.min(s.activeTask, steps.length - 1),
    task = s.roadmap[index];
  if (!task)
    return (
      <p className="empty">
        This task is no longer available. Return to your roadmap to choose a
        current step.
      </p>
    );
  const done = !!s.done[taskKey(s, index)],
    blocked = task.kind === "regulatory" && task.needs_revalidation && !done;
  return (
    <div className="task-page">
      <div className="task-guide-toolbar">
        <button
          className="btn ghost small"
          onClick={() => props.update({ page: "roadmap" })}
        >
          ← Back to roadmap
        </button>
        <span className="tasktag">
          STEP {index + 1} OF {steps.length}
        </span>
        <button
          className="btn small"
          disabled={blocked}
          onClick={() => {
            props.complete(index, !done);
          }}
        >
          {done
            ? "✓ Completed"
            : blocked
              ? "Refresh research before completing"
              : task.needs_revalidation
                ? "Confirm reviewed & complete"
                : "Mark completed ✓"}
        </button>
      </div>
      <h1 className="heading task-page-title">{task.title}</h1>
      <p className="task-page-context">
        {[s.name || "Your business", s.city, s.state]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <TaskGuide
        key={task.id}
        founder={{ ...s, activeTask: index }}
        title={task.title}
        requirementId={task.requirement_id || undefined}
        onReload={props.reload}
        onUpload={() =>
          props.update({ page: "documents", documentTaskId: task.id })
        }
      />
    </div>
  );
}
