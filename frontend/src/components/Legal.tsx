import Comparisons from "./Comparisons";
import LegalProfile from "./LegalProfile";
import EssentialQuestions from "./EssentialQuestions";
import ResearchPanel from "./ResearchPanel";
import { getRequirements, type ScreenProps } from "../state";
import { BusinessSelector } from "./Onboarding";
import { ExternalLink, Heading, Panel } from "./Common";
export default function Legal(props: ScreenProps) {
  const s = props.founder,
    requirements = getRequirements(s),
    r = requirements[s.reqIndex] || requirements[0];
  return (
    <>
      <Heading
        tag="Legal & compliance"
        title="Understand the rules. Launch with confidence."
      >
        Review potential obligations and official starting points. Guidance is
        illustrative, not a legal determination.
      </Heading>
      <div style={{ marginBottom: 20 }}>
        <Panel>
          <BusinessSelector {...props} compact />
          <LegalProfile {...props} />
          <EssentialQuestions {...props} />
          <p className="mini muted">
            Location: {s.city}, {s.state}.{" "}
            {s.state.toLowerCase() !== "california"
              ? "⚠ Regulatory examples below are California-specific and must not be applied to your state."
              : "Confirm all requirements with the relevant agency."}
          </p>
        </Panel>
      </div>
      <Comparisons {...props} kind="structures" />
      <ResearchPanel {...props} />
      {!s.type || !s.model ? (
        <div className="empty">
          Select your business type and model above to see a tailored legal
          checklist. You can begin here without completing Discovery.
        </div>
      ) : (
        <div className="compliance">
          <Panel>
            <h2>Curated starting checklist</h2>
            <p className="muted">
              Select an item for explanations and source links.
            </p>
            {requirements.map((item, i) => (
              <button
                className={`req ${s.reqIndex === i ? "selected" : ""}`}
                key={item[0]}
                onClick={() => props.update({ reqIndex: i })}
              >
                <strong>{item[0]}</strong>
                <small>REVIEW APPLICABILITY →</small>
              </button>
            ))}
          </Panel>
          <Panel>
            {r && (
              <>
                <span className="pill">GUIDED REQUIREMENT</span>
                <h2 style={{ fontSize: 27, lineHeight: 1.3 }}>{r[0]}</h2>
                <h3>Why this matters</h3>
                <p className="muted">{r[1]}</p>
                <h3>What to do next</h3>
                <ol className="muted">
                  <li>
                    Confirm the requirement applies to your business activities
                    and location.
                  </li>
                  <li>
                    Review the agency's current eligibility rules and
                    instructions.
                  </li>
                  <li>Gather the requested business and contact details.</li>
                  <li>
                    Complete the process directly with the responsible agency.
                  </li>
                </ol>
                <div className="callout">
                  <strong>Official starting point:</strong>
                  <br />
                  {r[2]}
                  <br />
                  <ExternalLink href={r[3]}>Open agency website ↗</ExternalLink>
                </div>
                <p className="mini muted">
                  The linked site is an agency starting point, not necessarily a
                  direct application page.
                </p>
                <p>
                  <ExternalLink
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(r[0] + " how to apply tutorial")}`}
                  >
                    ▶ Search YouTube walkthroughs (unverified) ↗
                  </ExternalLink>
                </p>
                <button
                  className="btn secondary"
                  onClick={() => props.update({ page: "roadmap" })}
                >
                  View my launch roadmap →
                </button>
              </>
            )}
          </Panel>
        </div>
      )}
      <div className="warn" style={{ marginTop: 20 }}>
        ⚠ Curated examples are not live-verified. Researched findings above
        include retrieved evidence and verification notes. LaunchPilot does not
        submit forms or make agency eligibility decisions. Confirm current
        requirements with the issuing agency or a qualified professional before
        acting.
      </div>
    </>
  );
}
