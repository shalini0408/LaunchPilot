import { Fragment } from "react";

// Render a small, safe Markdown subset as React nodes; never inject model HTML.
function inline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((part, i) =>
      part.startsWith("**") ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("`") ? (
        <code key={i}>{part.slice(1, -1)}</code>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}
export default function AnswerContent({ text }: { text: string }) {
  const normalized = text.replace(/\s+(\d+[.)]\s+\*\*)/g, "\n\n$1");
  const blocks = normalized.split(/\n\s*\n/).filter(Boolean);
  return (
    <div className="answer-content">
      {blocks.map((block, i) => {
        const option = block.match(
          /^\d+[.)]\s+(?:\*\*([^*]+)\*\*:?\s*)?([\s\S]*)/,
        );
        if (option)
          return (
            <article className="answer-option" key={i}>
              {option[1] && <h4>{option[1].replace(/:$/, "")}</h4>}
              <p>{inline(option[2])}</p>
            </article>
          );
        const lines = block.split("\n");
        if (lines.every((line) => /^\s*[-*]\s/.test(line)))
          return (
            <ul key={i}>
              {lines.map((line, n) => (
                <li key={n}>{inline(line.replace(/^\s*[-*]\s/, ""))}</li>
              ))}
            </ul>
          );
        return (
          <div key={i}>
            {lines.map((line, n) =>
              /^#{1,4}\s/.test(line) ? (
                <h4 key={n}>{inline(line.replace(/^#{1,4}\s/, ""))}</h4>
              ) : (
                <p key={n}>{inline(line)}</p>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}
