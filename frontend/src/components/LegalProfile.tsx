import { useEffect, useState } from "react";
import type { ScreenProps } from "../state";
export default function LegalProfile({ founder: s, update }: ScreenProps) {
  const defaults = (): {
    name: string;
    city: string;
    state: string;
    legalStructure: typeof s.legalStructure;
    formation: NonNullable<typeof s.details.formation_status>;
  } => ({
    name: s.name,
    city: s.city,
    state: s.state,
    legalStructure: s.legalStructure,
    formation: s.details.formation_status || "",
  });
  const [value, setValue] = useState(defaults),
    [open, setOpen] = useState(!s.city || !s.state);
  const key = JSON.stringify([
    s.name,
    s.city,
    s.state,
    s.legalStructure,
    s.details.formation_status,
  ]);
  useEffect(() => setValue(defaults()), [key]);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="link">Business details for legal guidance</summary>
      <p className="mini muted">
        Optional details can be added later. Activity and location are enough to
        start finding the relevant agencies.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({
            name: value.name,
            city: value.city,
            state: value.state,
            legalStructure: value.legalStructure,
            details: {
              ...s.details,
              formation_status: value.formation,
              existing_legal_structure:
                value.formation === "formed"
                  ? value.legalStructure
                  : s.details.existing_legal_structure,
            },
          });
        }}
      >
        <label className="field" htmlFor="legal-name">
          Legal business name (optional)
        </label>
        <input
          id="legal-name"
          className="input"
          maxLength={300}
          value={value.name}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
        />
        <div className="cards">
          <div>
            <label className="field" htmlFor="legal-city">
              Operating city
            </label>
            <input
              id="legal-city"
              className="input"
              maxLength={200}
              value={value.city}
              onChange={(e) => setValue({ ...value, city: e.target.value })}
            />
          </div>
          <div>
            <label className="field" htmlFor="legal-state">
              Operating state
            </label>
            <input
              id="legal-state"
              className="input"
              maxLength={200}
              value={value.state}
              onChange={(e) => setValue({ ...value, state: e.target.value })}
            />
          </div>
        </div>
        <label className="field" htmlFor="legal-formation">
          Existing registration status
        </label>
        <select
          id="legal-formation"
          className="input"
          value={value.formation}
          onChange={(e) =>
            setValue({
              ...value,
              formation: e.target.value as typeof value.formation,
            })
          }
        >
          <option value="">Not confirmed</option>
          <option value="formed">Already registered / formed</option>
          <option value="not_formed">Not formed yet</option>
          <option value="in_progress">In progress</option>
          <option value="undecided">Undecided</option>
        </select>
        <label className="field" htmlFor="legal-structure">
          Legal structure, if known
        </label>
        <select
          id="legal-structure"
          className="input"
          value={value.legalStructure}
          onChange={(e) =>
            setValue({
              ...value,
              legalStructure: e.target.value as typeof value.legalStructure,
            })
          }
        >
          <option value="">Not selected</option>
          {[
            "sole_proprietorship",
            "llc",
            "corporation",
            "partnership",
            "undecided",
          ].map((v) => (
            <option key={v} value={v}>
              {v === "llc"
                ? "LLC"
                : v.charAt(0).toUpperCase() + v.slice(1).replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <button className="btn small secondary" style={{ marginTop: 14 }}>
          Save legal profile
        </button>
      </form>
    </details>
  );
}
