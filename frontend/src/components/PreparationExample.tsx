import { useState } from "react";
import type { Founder } from "../state";

export default function PreparationExample({
  founder,
  title,
  items,
}: {
  founder: Founder;
  title: string;
  items: { text: string; kind: string }[];
}) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const fields = [
    ["Business or project", founder.name || "[Your business name]"],
    ["Step", title],
    ...items.map((item) => [
      item.text,
      "[Add your information or mark not applicable]",
    ]),
  ];
  const text =
    "PREPARATION WORKSHEET — NOT AN OFFICIAL FORM\n\n" +
    fields.map(([label, value]) => `${label}: ${value}`).join("\n\n") +
    "\n\nConfirm the agency's current instructions before filing. This worksheet does not establish requirements or replace an application.\n";
  function download() {
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "step-preparation-worksheet.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details
      className="preparation-example"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>See a preparation worksheet example</summary>
      {open && (
        <>
          <p>
            Use this to organize the information listed above. This is a
            planning worksheet, not an official application or proof of
            compliance. Use the agency’s actual form when filing.
          </p>
          <div className="example-paper">
            <span>PREPARATION WORKSHEET</span>
            <h3>{title}</h3>
            <dl>
              {fields.map(([label, value], i) => (
                <div key={i}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <button className="btn small secondary" onClick={download}>
            Download preparation worksheet (.txt)
          </button>
        </>
      )}
    </details>
  );
}
