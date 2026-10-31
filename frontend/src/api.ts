import { sessionGeneration, reportExpired } from "./session";
import type { Guide } from "./data";
export interface Citation {
  url: string;
  title: string;
  excerpt: string;
}
export interface ChatMessage {
  citations?: Citation[];
  role: "user" | "assistant";
  text: string;
}
export interface ChatPayload {
  business_id: string;
  task_id?: string;
  requirement_id?: string;
  question: string;
  business_type: string;
  business_model: string;
  city: string;
  state: string;
  company_name: string;
  task: string;
  task_guide: Guide;
  history: { role: "user" | "assistant"; content: string }[];
}
export async function askAdvisor(
  payload: ChatPayload,
  signal: AbortSignal,
): Promise<{
  answer: string;
  mode: "live" | "demo";
  citations?: Citation[];
  evidence_based?: boolean;
}> {
  const sessionAtStart = sessionGeneration();
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (response.status === 401) reportExpired(sessionAtStart);
  if (!response.ok)
    throw new Error("The AI service is temporarily unavailable.");
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("answer" in data) ||
    typeof data.answer !== "string" ||
    !("mode" in data) ||
    (data.mode !== "live" && data.mode !== "demo")
  )
    throw new Error("Invalid AI response.");
  return {
    answer: data.answer,
    mode: data.mode,
    citations: "citations" in data ? (data.citations as Citation[]) : [],
    evidence_based: "evidence_based" in data && data.evidence_based === true,
  };
}

export interface RoadmapRecord {
  kind?: "planning" | "regulatory";
  requirement_id?: string | null;
  needs_revalidation?: boolean;
  id: string;
  stable_key: string;
  title: string;
  position: number;
  guide: Guide;
  completed: boolean;
}
export interface BusinessFields {
  details?: ProfileDetails;
  company_name: string;
  idea: string;
  industry: string;
  business_model: string;
  city: string;
  state: string;
  budget: string | null;
  ownership_details: string;
  legal_structure:
    | ""
    | "sole_proprietorship"
    | "llc"
    | "corporation"
    | "partnership"
    | "undecided";
}
export interface BusinessRecord extends BusinessFields {
  journey?: "known" | "exploring" | "";
  launch_ready?: boolean;
  last_path?: string;
  id: string;
  founder_id: string;
  roadmap: RoadmapRecord[];
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  timeoutMs = 15000,
): Promise<T> {
  const sessionAtStart = sessionGeneration();
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error(
      "Cannot connect to LaunchPilot. Check that the backend is running, then try again.",
    );
  }
  if (response.status === 401) reportExpired(sessionAtStart);
  if (!response.ok) {
    let message = "Changes could not be saved. Please try again.";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail))
        message = data.detail
          .map(
            (item: { loc: string[]; msg: string }) =>
              `${item.loc.slice(1).join(".")}: ${item.msg}`,
          )
          .join("; ");
    } catch {
      /* Keep a readable fallback for non-JSON errors. */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
export const getLocalFounder = () =>
  request<{ id: string; business_id: string | null }>(
    "/founders/local",
    "POST",
  );
export const getBusiness = (id: string) =>
  request<BusinessRecord>(`/businesses/${id}`);
export const createBusiness = (
  founderId: string,
  fields: BusinessFields,
  legacyProgress: Record<string, boolean> = {},
) =>
  request<BusinessRecord>(`/founders/${founderId}/business`, "POST", {
    ...fields,
    legacy_progress: legacyProgress,
  });
export const patchBusiness = (id: string, fields: Partial<BusinessFields>) =>
  request<BusinessRecord>(`/businesses/${id}`, "PATCH", fields);
export const saveProgress = (
  businessId: string,
  taskId: string,
  completed: boolean,
) =>
  request<BusinessRecord>(
    `/businesses/${businessId}/tasks/${taskId}/progress`,
    "PUT",
    { completed },
  );

export interface GovernmentSource {
  id: string;
  url: string;
  title: string;
  agency: string;
  jurisdiction: string;
  retrieved_at: string;
  published_date: string | null;
  updated_date: string | null;
}
export interface RegulatoryRequirement {
  id: string;
  business_id: string;
  task_id: string | null;
  run_id: string;
  name: string;
  description: string;
  agency: string;
  jurisdiction: string;
  business_activity: string;
  applicability: "applicable" | "not_applicable" | "needs_verification";
  reason: string;
  source_url: string;
  application_url: string | null;
  required_information: string[];
  steps: string[];
  fees: { value: string; url: string; source_id: string; excerpt: string }[];
  deadlines: {
    value: string;
    url: string;
    source_id: string;
    excerpt: string;
  }[];
  evidence: { source_id: string; excerpt: string; url: string }[];
  verification_notes: string[];
  missing_information: string[];
  conflicts: string[];
  needs_revalidation: boolean;
  last_checked: string;
  sources: GovernmentSource[];
}
export interface ResearchStatus {
  id?: string;
  status: "not_started" | "queued" | "running" | "complete" | "failed";
  stage: string;
  message: string;
  warnings: string[];
  stale: boolean;
  cached?: boolean;
  started_at?: string;
  completed_at?: string | null;
  expires_at?: string | null;
}
export const getResearchStatus = (id: string) =>
  request<ResearchStatus>(`/businesses/${id}/research/status`);
export const startResearch = (id: string, refresh = false) =>
  request<ResearchStatus>(
    `/businesses/${id}/research${refresh ? "/refresh" : ""}`,
    "POST",
  );
export const getResearchedRequirements = (id: string) =>
  request<RegulatoryRequirement[]>(`/businesses/${id}/requirements`);
export const getRequirement = (businessId: string, id: string) =>
  request<RegulatoryRequirement>(
    `/businesses/${businessId}/requirements/${id}`,
  );

export interface ProfileDetails {
  operating_location?: string;
  activities?: string[];
  products?: string[];
  industry_label?: string;
  operating_model_label?: string;
  country?: string;
  currency?: string;
  founder_count?: number | null;
  existing_legal_structure?:
    | ""
    | "sole_proprietorship"
    | "llc"
    | "corporation"
    | "partnership"
    | "undecided";
  formation_status?: "" | "not_formed" | "in_progress" | "formed" | "undecided";
  target_customers?: string;
  goals?: string;
  constraints?: string;
  investment_plans?: "" | "yes" | "no" | "undecided";
  liability_exposure?: "" | "low" | "medium" | "high" | "undecided";
  hire_employees?: "" | "yes" | "no" | "undecided";
  question_status?: Record<string, string>;
}
export interface Decision {
  id: string;
  status: string;
  origin: string;
  requires_confirmation: boolean;
  differences: { field: string; before: unknown; after: unknown }[];
  roadmap_changes: {
    added: string[];
    archived: string[];
    preserved_completed: string[];
    review_required?: string[];
    regulatory_revalidation: number;
  };
  planning_task?: { title: string; actions: string[] } | null;
}
export interface Followup {
  field: string;
  text: string;
  optional: boolean;
  choices: string[];
}
export interface Conversation {
  id: string;
  scope: string;
  summary: string;
  total_messages: number;
  messages: {
    id: string;
    role: "user" | "assistant";
    content: string;
    citations?: Citation[];
  }[];
}
export interface DiscoveryResult {
  conversation: Conversation;
  proposal?: Decision | null;
  questions: Followup[];
}
export interface ComparisonOption {
  id: string;
  name: string;
  startup_costs: string;
  operational_complexity: string;
  customer_acquisition: string;
  scalability: string;
  location_requirements: string;
  regulatory_considerations: string;
  risks: string[];
  advantages: string[];
  disadvantages: string[];
  fit: string;
  assumptions: string[];
  missing_information: string[];
  sources: Citation[];
}
export interface Comparison {
  id?: string;
  kind: string;
  options: ComparisonOption[];
  explanation: string;
  mode: string;
  questions: Followup[];
}
export interface Recommendation {
  id: string;
  status: string;
  stale?: boolean;
  category: "next_actions" | "alternatives" | "risks" | "questions";
  title: string;
  action: string;
  explanation: string;
  fit: string;
  advantages: string[];
  tradeoffs: string[];
  assumptions: string[];
  missing_information: string[];
  sources: Citation[];
}
export const proposeDecision = (
  id: string,
  changes: Partial<BusinessFields>,
  origin = "profile",
) =>
  request<Decision>(`/businesses/${id}/decisions`, "POST", { changes, origin });
export const confirmDecision = (id: string, decision: string) =>
  request<{ business: BusinessRecord; decision: Decision }>(
    `/businesses/${id}/decisions/${decision}/confirm`,
    "POST",
    { confirmed: true },
  );
export const dismissDecision = (id: string, decision: string) =>
  request<Decision>(`/businesses/${id}/decisions/${decision}/dismiss`, "POST");
export const getDiscovery = (id: string, essential = false) =>
  request<DiscoveryResult>(
    `/businesses/${id}/discovery?essential=${essential}`,
  );
export const sendDiscovery = (id: string, message: string) =>
  request<DiscoveryResult>(
    `/businesses/${id}/discovery/messages`,
    "POST",
    { message },
    60000,
  );
export const answerDiscovery = (
  id: string,
  field: string,
  answer: string,
  action = "answer",
) =>
  request<{ proposal: Decision; questions: Followup[] }>(
    `/businesses/${id}/discovery/answers`,
    "POST",
    { field, answer, action },
  );
export const getComparison = (id: string, kind: string) =>
  request<Comparison>(`/businesses/${id}/comparisons?kind=${kind}`);
export const generateComparison = (id: string, kind: string) =>
  request<Comparison>(`/businesses/${id}/comparisons`, "POST", { kind }, 60000);
export const getRecommendations = (id: string) =>
  request<Recommendation[]>(`/businesses/${id}/recommendations`);
export const generateRecommendations = (id: string) =>
  request<Recommendation[]>(
    `/businesses/${id}/recommendations`,
    "POST",
    undefined,
    60000,
  );
export const recommendationFeedback = (
  id: string,
  recommendation: string,
  action: string,
) =>
  request<{ proposal?: Decision; status?: string }>(
    `/businesses/${id}/recommendations/${recommendation}/feedback`,
    "POST",
    { action },
  );
export const getConversation = (id: string, scope = "advisor") =>
  request<Conversation>(
    `/businesses/${id}/advisor/conversation?scope=${encodeURIComponent(scope)}`,
  );
export async function askBusinessAdvisor(
  payload: ChatPayload,
  signal: AbortSignal,
): Promise<{
  answer: string;
  mode: "live" | "demo";
  citations?: Citation[];
  evidence_based?: boolean;
}> {
  const sessionAtStart = sessionGeneration();
  const result = await fetch(
    `/api/businesses/${payload.business_id}/advisor/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: payload.question,
        task_id: payload.task_id,
        requirement_id: payload.requirement_id,
        research: true,
      }),
      signal,
    },
  );
  if (result.status === 401) reportExpired(sessionAtStart);
  if (!result.ok) {
    let message = "The assistant is unavailable. Please retry.";
    try {
      const data = await result.json();
      if (typeof data.detail === "string") message = data.detail;
    } catch {
      /* Keep safe fallback. */
    }
    throw Error(message);
  }
  const data = await result.json();
  if (
    typeof data.answer !== "string" ||
    !data.answer.trim() ||
    !["live", "demo"].includes(data.mode)
  )
    throw Error("The assistant returned an incomplete response. Please retry.");
  return data;
}

export const getTaskDraft = (businessId: string, taskId: string) =>
  request<{ text: string | null }>(
    `/businesses/${businessId}/tasks/${taskId}/draft`,
  );
export const saveTaskDraft = (
  businessId: string,
  taskId: string,
  text: string,
) =>
  request(`/businesses/${businessId}/tasks/${taskId}/draft`, "PUT", { text });

export const launchBusiness = (id: string, changes?: Partial<BusinessFields>) =>
  request<BusinessRecord>(`/businesses/${id}/launch`, "POST", {
    confirmed: true,
    ...(changes ? { changes } : {}),
  });
export const saveResumePath = (id: string, path: string) =>
  request(`/businesses/${id}/navigation`, "PATCH", { path });
