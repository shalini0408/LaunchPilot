import { DATA } from "./data";
import { taskGuide, type Founder } from "./state";
export function guidedAnswer(q: string, s: Founder, title: string) {
  const g = taskGuide(title),
    x = q.toLowerCase(),
    m = DATA[s.type]?.models.find((x) => x.id === s.model);
  if (
    /what is (an? )?llc|llc vs|sole propriet|corporation|best structure|recommend.*structure/.test(
      x,
    )
  )
    return (
      "An LLC is a state-created business entity that can provide a separation between owners and business liabilities, with important exceptions. A sole proprietorship is simpler but generally does not create that separation. A corporation has shares and more formalities and may be considered for equity funding. For " +
      (s.name || "your business") +
      " (" +
      m?.name +
      "), compare risk, state fees, taxes and future funding. Check the SBA structure comparison and seek qualified advice for a final choice."
    );
  if (/document|prepare|information|need/.test(x))
    return (
      "For this task, prepare:\n• " +
      g.prepare.join("\n• ") +
      "\n\nIf a government form is involved, check the issuing agency’s current instructions for the exact documents."
    );
  if (/how|start|next|complete|do/.test(x))
    return (
      "Suggested actions:\n" +
      g.actions.map((a, i) => `${i + 1}. ${a}`).join("\n") +
      "\n\nYou can mark the task complete when: " +
      g.proof
    );
  if (/permit|license|law|legal|regulat|tax|fee|deadline|cost/.test(x))
    return (
      "I cannot verify live legal requirements in offline mode. Open Legal & Compliance for curated agency starting points, then confirm current rules with the responsible agency. Your business is " +
      DATA[s.type]?.name +
      " (" +
      m?.name +
      ") in " +
      s.city +
      ", " +
      s.state +
      "."
    );
  return (
    "For “" +
    title +
    "”, the goal is: " +
    g.goal +
    "\n\nAsk me “What documents do I need?” or “How do I complete this?” for specific guidance."
  );
}
