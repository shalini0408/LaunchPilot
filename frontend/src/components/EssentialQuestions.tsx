import { useEffect, useState } from "react";
import { getDiscovery, answerDiscovery, type Followup } from "../api";
import type { ScreenProps } from "../state";
import { FollowupQuestions } from "./DiscoveryAdvisor";
export default function EssentialQuestions({
  founder: s,
  reviewDecision,
}: ScreenProps) {
  const [questions, setQuestions] = useState<Followup[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = JSON.stringify([s.type, s.model, s.city, s.state, s.details]);
  useEffect(() => {
    let active = true;
    void getDiscovery(s.businessId, true)
      .then((r) => {
        if (active) setQuestions(r.questions || []);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [s.businessId, key]);
  async function answer(field: string, value: string, action: string) {
    setBusy(true);
    try {
      const r = await answerDiscovery(s.businessId, field, value, action);
      reviewDecision?.(r.proposal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not review answer.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {questions.length > 0 && (
        <>
          <h3>Only the essentials for legal guidance</h3>
          <p className="mini muted">
            You can skip Discovery. Confirm your activity and location so
            official research can be targeted.
          </p>
          <FollowupQuestions
            questions={questions}
            onAnswer={(...args) => void answer(...args)}
            busy={busy}
          />
        </>
      )}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
