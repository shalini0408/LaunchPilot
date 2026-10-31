import { useEffect, useState } from "react";
import { DATA } from "../data";
import {
  getBusiness,
  launchBusiness,
  type BusinessRecord,
  type BusinessFields,
} from "../api";
export default function LaunchForm({
  businessId,
  onDone,
  onBack,
}: {
  businessId: string;
  onDone: () => void | Promise<void>;
  onBack?: () => void;
}) {
  const [profile, setProfile] = useState<BusinessRecord | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void getBusiness(businessId)
      .then((b) => {
        if (active) setProfile(b);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [businessId, retry]);
  if (loading) return <p role="status">Loading your business details…</p>;
  if (!profile)
    return (
      <p role="alert">
        {error || "Could not load your business details."}{" "}
        <button className="text-link" onClick={() => setRetry((n) => n + 1)}>
          Retry
        </button>
      </p>
    );
  return (
    <section className="known-details launch-form">
      {onBack && (
        <button className="text-link" onClick={onBack}>
          ← Back
        </button>
      )}
      <h1>Your business details</h1>
      <p>
        These details shape your roadmap. Legal structure and ownership details
        can be added later.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const f = new FormData(e.currentTarget),
            v = (key: string) => String(f.get(key) || "").trim();
          try {
            const count = v("founders");
            await launchBusiness(businessId, {
              company_name: v("name"),
              idea: v("idea"),
              industry: v("industry"),
              city: v("city"),
              state: v("state"),
              ownership_details: v("owners"),
              legal_structure: v(
                "structure",
              ) as BusinessFields["legal_structure"],
              details: {
                ...profile.details,
                activities: [v("idea").slice(0, 500)],
                founder_count: count ? Number(count) : null,
                formation_status: v("registered") as
                  "formed" | "not_formed" | "in_progress" | "undecided" | "",
                existing_legal_structure:
                  v("registered") === "formed"
                    ? (v("structure") as BusinessFields["legal_structure"])
                    : "",
              },
            });
            await onDone();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Business or product name (optional)
          <input
            name="name"
            maxLength={300}
            defaultValue={profile.company_name}
          />
        </label>
        <label>
          Description of the business
          <textarea
            name="idea"
            maxLength={4000}
            required
            defaultValue={profile.idea}
          />
        </label>
        <label>
          Industry or business category
          <input
            name="industry"
            required
            maxLength={200}
            list="industry-examples"
            defaultValue={
              profile.details?.industry_label ||
              DATA[profile.industry]?.name ||
              profile.industry
            }
            placeholder="e.g. Dental clinic, logistics, education…"
          />
          <datalist id="industry-examples">
            {Object.values(DATA).map((b) => (
              <option key={b.name} value={b.name} />
            ))}
          </datalist>
        </label>
        <div className="launch-form-row">
          <label>
            Operating city
            <input
              name="city"
              required
              maxLength={200}
              defaultValue={profile.city}
            />
          </label>
          <label>
            Operating state
            <input
              name="state"
              required
              maxLength={200}
              defaultValue={profile.state}
            />
          </label>
        </div>
        <label>
          Number of founders (optional)
          <input
            name="founders"
            type="number"
            min={1}
            max={1000}
            defaultValue={profile.details?.founder_count ?? ""}
          />
        </label>
        <label>
          Founder or cofounder details (optional)
          <textarea
            name="owners"
            maxLength={4000}
            defaultValue={profile.ownership_details}
            placeholder="Names, roles or ownership shares, if known"
          />
        </label>
        <label>
          Is the business legally registered?
          <select
            name="registered"
            defaultValue={profile.details?.formation_status || ""}
          >
            <option value="">Not sure / decide later</option>
            <option value="not_formed">No</option>
            <option value="in_progress">In progress</option>
            <option value="formed">Yes</option>
          </select>
        </label>
        <label>
          Existing legal structure, if known
          <select name="structure" defaultValue={profile.legal_structure}>
            <option value="">Not selected / decide later</option>
            <option value="sole_proprietorship">Sole proprietorship</option>
            <option value="llc">LLC</option>
            <option value="corporation">Corporation</option>
            <option value="partnership">Partnership</option>
            <option value="undecided">Undecided</option>
          </select>
        </label>
        {error && (
          <p role="alert" className="warn">
            {error}
          </p>
        )}
        <button className="btn" disabled={busy}>
          {busy ? "Saving…" : "Save and open my roadmap →"}
        </button>
      </form>
    </section>
  );
}
