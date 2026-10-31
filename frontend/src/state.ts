import { useCallback, useEffect, useRef, useState } from "react";
import {
  createBusiness,
  proposeDecision,
  confirmDecision,
  dismissDecision,
  type Decision,
  type ProfileDetails,
  getBusiness,
  getLocalFounder,
  patchBusiness,
  saveProgress,
  saveResumePath,
  type BusinessFields,
  type BusinessRecord,
  type RoadmapRecord,
} from "./api";
import { readNavigation, writeNavigation } from "./navigation";
import { DATA, EIN_GUIDE, TASK_GUIDES, type Requirement } from "./data";
export type Page =
  | "overview"
  | "discover"
  | "roadmap"
  | "legal"
  | "documents"
  | "task"
  | "assistant";
export interface Founder {
  journey: "known" | "exploring" | "";
  launchReady: boolean;
  documentTaskId: string;
  details: ProfileDetails;
  businessId: string;
  roadmap: RoadmapRecord[];
  budget: string;
  ownershipDetails: string;
  legalStructure: BusinessFields["legal_structure"];
  name: string;
  idea: string;
  city: string;
  state: string;
  type: string;
  model: string;
  page: Page;
  done: Record<string, boolean>;
  reqIndex: number;
  activeTask: number;
}
export const STORAGE_KEY = "launchpilot_v01";
export const DEFAULT: Founder = {
  journey: "",
  launchReady: false,
  documentTaskId: "",
  details: {},
  businessId: "",
  roadmap: [],
  budget: "",
  ownershipDetails: "",
  legalStructure: "",
  name: "",
  idea: "",
  city: "",
  state: "",
  type: "",
  model: "",
  page: "discover",
  done: {},
  reqIndex: 0,
  activeTask: 0,
};
export function loadFounder(): Founder {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "{}",
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      return { ...DEFAULT, done: {} };
    const raw = value as Record<string, unknown>;
    const result = { ...DEFAULT, done: {} };
    for (const key of [
      "name",
      "idea",
      "city",
      "state",
      "type",
      "model",
    ] as const)
      if (typeof raw[key] === "string")
        result[key] = raw[key].slice(
          0,
          key === "idea" ? 4000 : key === "name" ? 300 : 200,
        );
    if (
      [
        "overview",
        "discover",
        "roadmap",
        "legal",
        "documents",
        "task",
      ].includes(String(raw.page))
    )
      result.page = raw.page as Page;
    if (
      typeof raw.reqIndex === "number" &&
      Number.isInteger(raw.reqIndex) &&
      raw.reqIndex >= 0
    )
      result.reqIndex = raw.reqIndex;
    if (
      typeof raw.activeTask === "number" &&
      Number.isInteger(raw.activeTask) &&
      raw.activeTask >= 0
    )
      result.activeTask = raw.activeTask;
    if (raw.done && typeof raw.done === "object")
      result.done = Object.fromEntries(
        Object.entries(raw.done).filter(([, v]) => typeof v === "boolean"),
      );
    if (!Object.hasOwn(DATA, result.type)) {
      result.type = "";
      result.model = "";
    }
    if (
      result.type &&
      !DATA[result.type].models.some((m) => m.id === result.model)
    )
      result.model = "";
    return result;
  } catch {
    return { ...DEFAULT, done: {} };
  }
}
export function profileFields(s: Founder): BusinessFields {
  return {
    details: s.details,
    company_name: s.name,
    idea: s.idea,
    industry: s.type,
    business_model: s.model,
    city: s.city,
    state: s.state,
    budget: s.budget === "" ? null : s.budget,
    ownership_details: s.ownershipDetails,
    legal_structure: s.legalStructure,
  };
}
function fromBusiness(b: BusinessRecord): Partial<Founder> {
  return {
    journey: b.journey ?? "",
    launchReady: b.launch_ready ?? false,
    details: b.details ?? {},
    businessId: b.id,
    name: b.company_name,
    idea: b.idea,
    type: b.industry,
    model: b.business_model,
    city: b.city,
    state: b.state,
    budget: b.budget ?? "",
    ownershipDetails: b.ownership_details,
    legalStructure: b.legal_structure,
    roadmap: b.roadmap,
    done: Object.fromEntries(b.roadmap.map((t) => [t.stable_key, t.completed])),
  };
}
export function useFounder(projectId?: string) {
  const [founder, setFounder] = useState<Founder>({ ...DEFAULT });
  const [storageError, setStorageError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null);
  const [decisionNotice, setDecisionNotice] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const current = useRef(founder);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    setLoading(true);
    setStorageError("");
    async function load() {
      try {
        const local = projectId ? null : await getLocalFounder();
        const legacy = projectId ? { ...DEFAULT, done: {} } : loadFounder();
        const business = projectId
          ? await getBusiness(projectId)
          : local!.business_id
            ? await getBusiness(local!.business_id)
            : await createBusiness(
                local!.id,
                profileFields(legacy),
                legacy.done,
              );
        if (cancelled) return;
        current.current = { ...DEFAULT, ...fromBusiness(business) };
        Object.assign(current.current, readNavigation(current.current));
        setFounder(current.current);
      } catch (error) {
        if (!cancelled)
          setStorageError(
            error instanceof Error
              ? error.message
              : "Could not load your business profile.",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, [retryCount, projectId]);
  useEffect(() => {
    const handle = () => {
      if (!current.current.businessId) return;
      current.current = {
        ...current.current,
        ...readNavigation(current.current),
      };
      setFounder(current.current);
    };
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
  useEffect(() => {
    if (loading || !founder.businessId) return;
    const task = founder.roadmap[founder.activeTask];
    const path =
      founder.page === "task" && task
        ? "#task/" + task.id
        : founder.page === "documents"
          ? "#documents" +
            (founder.documentTaskId ? "?task=" + founder.documentTaskId : "")
          : founder.page === "roadmap"
            ? "#roadmap"
            : "#discover";
    void saveResumePath(founder.businessId, path).catch(() => {
      /* The next load safely falls back to the saved journey. */
    });
  }, [
    loading,
    founder.businessId,
    founder.page,
    founder.activeTask,
    founder.documentTaskId,
  ]);
  function apply(patch: Partial<Founder>) {
    current.current = { ...current.current, ...patch };
    if (mounted.current) setFounder(current.current);
  }
  function enqueue(operation: () => Promise<BusinessRecord>) {
    pending.current++;
    setSaving(true);
    setStorageError("");
    queue.current = queue.current.then(async () => {
      try {
        const business = await operation();
        apply(fromBusiness(business));
      } catch (error) {
        if (mounted.current)
          setStorageError(
            error instanceof Error
              ? error.message
              : "Changes could not be saved.",
          );
      } finally {
        pending.current--;
        if (mounted.current) setSaving(pending.current > 0);
      }
    });
  }
  function update(patch: Partial<Founder>) {
    const { page, reqIndex, activeTask, documentTaskId, ...profile } = patch;
    const navigation: Partial<Founder> = {};
    if (page !== undefined) {
      navigation.page = page;
      if (page !== current.current.page) setDecisionNotice("");
    }
    if (page === "documents" && documentTaskId === undefined)
      navigation.documentTaskId = "";
    if (documentTaskId !== undefined)
      navigation.documentTaskId = documentTaskId;
    if (reqIndex !== undefined) navigation.reqIndex = reqIndex;
    if (activeTask !== undefined) navigation.activeTask = activeTask;
    apply(navigation);
    if (
      page !== undefined ||
      activeTask !== undefined ||
      documentTaskId !== undefined
    )
      writeNavigation(current.current);
    if (!Object.keys(profile).length) return;
    // Submit only changed fields, so edits in another tab are not overwritten.
    const mapping: Record<string, keyof BusinessFields> = {
      details: "details",
      name: "company_name",
      idea: "idea",
      type: "industry",
      model: "business_model",
      city: "city",
      state: "state",
      budget: "budget",
      ownershipDetails: "ownership_details",
      legalStructure: "legal_structure",
    };
    const fields: Partial<BusinessFields> = {};
    for (const [key, value] of Object.entries(profile))
      if (mapping[key])
        Object.assign(fields, {
          [mapping[key]]: key === "budget" && value === "" ? null : value,
        });
    if (!Object.keys(fields).length) return;
    const majorKeys = [
      "name",
      "type",
      "model",
      "city",
      "state",
      "legalStructure",
    ] as const;
    const isMajor = majorKeys.some(
      (key) =>
        key !== "name" &&
        profile[key] !== undefined &&
        current.current[key] !== "" &&
        current.current[key] !== profile[key],
    );
    const changedDetails =
      profile.details &&
      (["founder_count", "formation_status"] as const).some(
        (key) =>
          current.current.details[key] !== undefined &&
          current.current.details[key] !== "" &&
          profile.details![key] !== current.current.details[key],
      );
    if (isMajor || changedDetails) {
      setSaving(true);
      setStorageError("");
      void proposeDecision(current.current.businessId, fields)
        .then(setPendingDecision)
        .catch((e) => setStorageError(e.message))
        .finally(() => setSaving(false));
    } else enqueue(() => patchBusiness(current.current.businessId, fields));
  }
  function complete(index: number, value: boolean) {
    const businessId = current.current.businessId,
      task = current.current.roadmap[index];
    if (!task) return;
    enqueue(() => saveProgress(businessId, task.id, value));
  }
  const reload = useCallback(async () => {
    if (!current.current.businessId) return;
    const business = await getBusiness(current.current.businessId);
    current.current = { ...current.current, ...fromBusiness(business) };
    if (mounted.current) setFounder(current.current);
  }, []);
  async function confirmPending() {
    if (!pendingDecision) return;
    setSaving(true);
    setStorageError("");
    try {
      const result = await confirmDecision(
        current.current.businessId,
        pendingDecision.id,
      );
      apply(fromBusiness(result.business));
      setDecisionNotice(
        `Changes confirmed. ${pendingDecision.roadmap_changes.added.length} tasks added; ${pendingDecision.roadmap_changes.archived.length} archived; ${pendingDecision.roadmap_changes.preserved_completed.length} completed tasks retained. Regulatory findings needing revalidation: ${pendingDecision.roadmap_changes.regulatory_revalidation}.`,
      );
      setPendingDecision(null);
      window.dispatchEvent(new Event("launchpilot-decision"));
    } catch (e) {
      setStorageError(
        e instanceof Error ? e.message : "Changes could not be confirmed.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function cancelPending() {
    if (!pendingDecision) return;
    try {
      await dismissDecision(current.current.businessId, pendingDecision.id);
      setPendingDecision(null);
    } catch (e) {
      setStorageError(
        e instanceof Error ? e.message : "Could not dismiss decision.",
      );
    }
  }
  const retry = useCallback(() => setRetryCount((value) => value + 1), []);
  return {
    founder,
    update,
    complete,
    storageError,
    loading,
    saving,
    retry,
    reload,
    pendingDecision,
    reviewDecision: setPendingDecision,
    confirmPending,
    cancelPending,
    decisionNotice,
  };
}
export function taskKey(s: Founder, index: number) {
  return s.roadmap[index]?.stable_key ?? `unloaded:${index}`;
}
export function getSteps(s: Founder) {
  return s.roadmap.map((t) => t.title);
}
export function getRequirements(s: Founder): Requirement[] {
  const requirements = [...(DATA[s.type]?.requirements[s.model] || [])];
  if (s.type && s.model)
    requirements.unshift([
      "Employer Identification Number (EIN)",
      "Check whether your business needs an EIN; if so apply free through the IRS after state formation where applicable.",
      "Internal Revenue Service",
      "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number",
    ]);
  return requirements;
}
export function guideKind(title: string) {
  const t = title.toLowerCase();
  if (/zoning|premises|location|leasing/.test(t)) return "location";
  if (/structure|name|formation|register your business/.test(t))
    return "entity";
  if (
    /permit|registration|inspections|food safety|eligibility|labeling|tax and local/.test(
      t,
    )
  )
    return "permit";
  if (/privacy|data/.test(t)) return "privacy";
  if (/contract|terms|ip/.test(t)) return "contract";
  if (/tax|billing|invoic|recordkeep/.test(t)) return "finance";
  if (/launch|operations|support|staffing|security/.test(t))
    return "operations";
  if (/product|supplier|customer|service|offering|sales channel/.test(t))
    return "products";
  return "general";
}
export function taskGuide(title: string) {
  return /ein|employer identification/i.test(title)
    ? EIN_GUIDE
    : TASK_GUIDES[guideKind(title)];
}
export type ScreenProps = {
  reviewDecision?: (decision: Decision) => void;
  reload?: () => Promise<void>;
  founder: Founder;
  update: (patch: Partial<Founder>) => void;
};
