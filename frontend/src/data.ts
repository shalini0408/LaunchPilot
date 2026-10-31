import catalog from "../../shared/business-catalog.json";
export interface Guide {
  goal: string;
  actions: string[];
  prepare: string[];
  proof: string;
}
export type Requirement = [string, string, string, string];
export interface BusinessModel {
  id: string;
  name: string;
  icon: string;
  description: string;
  points: string[];
}
export interface Industry {
  name: string;
  icon: string;
  question: string;
  models: BusinessModel[];
  steps: Record<string, string[]>;
  requirements: Record<string, Requirement[]>;
}
export const DATA: Record<string, Industry> =
  catalog.industries as unknown as Record<string, Industry>;

export const TASK_GUIDES: Record<string, Guide> = catalog.guides;

export const EIN_GUIDE: Guide = catalog.ein_guide;

export const STRUCTURES = [
  {
    title: "Sole proprietorship",
    desc: "Simplest to begin for one owner; no separate legal entity. Personal liability may be a concern.",
    fit: "May suit a small, low-risk solo test",
    trade:
      "No separate liability shield; financing and tax considerations differ.",
  },
  {
    title: "Limited Liability Company (LLC)",
    desc: "A state-created entity that generally separates business obligations from owners, subject to exceptions.",
    fit: "Worth comparing for a bakery, shop, or service business",
    trade: "State fees, ongoing filings, and tax elections can matter.",
  },
  {
    title: "Corporation",
    desc: "A separate legal entity with formal governance and shares.",
    fit: "Worth evaluating if you plan to raise outside equity investment",
    trade:
      "More formalities; tax treatment depends on elections and circumstances.",
  },
];

export const SAMPLES: Record<string, { label: string; body: string }> = {
  entity: {
    label: "Business structure decision worksheet",
    body: `BUSINESS STRUCTURE DECISION WORKSHEET\nBusiness name (proposed): [Business name]\nBusiness activity: [What you sell or provide]\nFormation state: [State]\nOwners and ownership percentages: [Names / shares]\nStructures considered: [Sole proprietorship / LLC / corporation]\nReasons for selected structure: [Liability, taxes, operations]\nName availability checked with: [Official state registry / date]\nRegistered agent (if required): [Name / address]\nQuestions for a qualified professional: [Questions]\nNext official filing step: [Agency / link / status]`,
  },
  permit: {
    label: "Permit and regulatory research tracker",
    body: `REGULATORY REQUIREMENT TRACKER\nBusiness: [Business name]\nActivity and products: [Description]\nLocation: [Street / city / state]\nRequirement / permit: [Official name]\nIssuing agency: [Agency]\nDoes it apply? [Yes / No / Needs confirmation]\nWhy? [Rule or agency explanation]\nOfficial source URL: [Link]\nDate verified: [Date]\nDocuments requested: [List from agency]\nFee and deadline: [Verify with agency]\nApplication status: [Not started / Submitted / Approved]\nConfirmation or permit ID: [If applicable]`,
  },
  location: {
    label: "Location evaluation worksheet",
    body: `LOCATION REVIEW WORKSHEET\nCandidate address: [Address]\nBusiness activity: [Description]\nExpected customer access: [Walk-in / delivery / online]\nLease or ownership status: [Status]\nZoning designation: [Verify with city]\nIs proposed use allowed? [Confirm with agency]\nBuilding / fire / health reviews: [If applicable]\nAccessibility considerations: [Notes]\nEstimated monthly occupancy costs: [Estimate + source]\nDecision: [Proceed / Investigate / Reject]\nSources and verification dates: [Links / dates]`,
  },
  privacy: {
    label: "Privacy and data inventory template",
    body: `DATA AND PRIVACY INVENTORY — WORKING DRAFT\nBusiness: [Name]\nWebsite / app: [URL]\nData collected: [Names / email / payment / analytics / etc.]\nPurpose for each data category: [Purpose]\nData processors or vendors: [List]\nRetention approach: [Draft]\nUser requests contact: [Email / process]\nSecurity controls: [Summary]\nApplicable laws to review: [Jurisdictions / counsel]\nPrivacy policy status: [Draft / Reviewed / Published]`,
  },
  contract: {
    label: "Agreement planning outline",
    body: `AGREEMENT PLANNING OUTLINE — NOT A CONTRACT\nParties: [Names]\nPurpose: [Services / goods / collaboration]\nDeliverables: [Specific outcomes]\nPayment terms: [Amounts / timing]\nTimeline and milestones: [Dates]\nOwnership of work / IP: [To be reviewed]\nConfidentiality expectations: [Notes]\nTermination and disputes: [Questions for counsel]\nLegal review status: [Pending / Reviewed]`,
  },
  finance: {
    label: "Financial and tax setup checklist",
    body: `FINANCIAL SETUP WORKSHEET\nBusiness: [Name]\nEntity type: [Structure]\nFormation state: [State]\nTax identification status: [Not started / Obtained]\nBusiness bank account: [Not started / Open]\nSales channels: [Online / retail / services]\nPotential tax obligations: [Verify with agencies]\nBookkeeping method: [Software / spreadsheet]\nMonthly record reconciliation: [Owner / date]\nQuestions for accountant: [List]`,
  },
  products: {
    label: "Product and supplier planning sheet",
    body: `PRODUCT AND SUPPLIER PLAN\nBusiness: [Name]\nTarget customer: [Who buys]\nProduct or service: [Description]\nProposed price: [Amount / assumptions]\nSupplier / vendor: [Name]\nSupplier contact: [Contact]\nEstimated unit cost: [Amount]\nPackaging and labeling needs: [To verify]\nQuality checks: [Criteria]\nPilot test / validation result: [Evidence]`,
  },
  operations: {
    label: "Launch readiness checklist",
    body: `LAUNCH READINESS RECORD\nBusiness: [Name]\nTarget launch date: [Date]\nRequired approvals verified: [List / status]\nSuppliers / vendors confirmed: [Names]\nCustomer support contact: [Email / phone]\nFulfillment / service process: [Steps]\nInsurance reviewed: [Status]\nWebsite / storefront readiness: [Status]\nContingency plan: [Risks / backup]\nFinal sign-off: [Owner / date]`,
  },
  general: {
    label: "Task completion record",
    body: `TASK COMPLETION RECORD\nBusiness: [Name]\nTask: [Title]\nDesired outcome: [What success looks like]\nActions taken: [Steps]\nEvidence or documents collected: [List]\nSources checked: [Links / dates]\nOpen questions: [Questions]\nNext action: [Action / owner / date]\nCompletion status: [In progress / Complete]`,
  },
};

export const LINKS: Record<string, [string, string][]> = {
  ein: [
    [
      "IRS — Apply for an EIN",
      "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number",
    ],
    [
      "IRS — Form SS-4 and instructions",
      "https://www.irs.gov/forms-pubs/about-form-ss-4",
    ],
  ],
  entity: [
    [
      "California Secretary of State — Business Entities",
      "https://www.sos.ca.gov/business-programs/business-entities",
    ],
    [
      "California Business Search",
      "https://bizfileonline.sos.ca.gov/search/business",
    ],
  ],
  tax: [
    [
      "California Department of Tax and Fee Administration",
      "https://www.cdtfa.ca.gov/",
    ],
    [
      "IRS — Small Businesses and Self-Employed",
      "https://www.irs.gov/businesses/small-businesses-self-employed",
    ],
  ],
  bakery: [
    [
      "California Cottage Food Operations",
      "https://www.cdph.ca.gov/Programs/CEH/DFDCS/Pages/FDBPrograms/FoodSafetyProgram/CottageFoodOperations.aspx",
    ],
    [
      "San Francisco Department of Public Health",
      "https://www.sf.gov/departments/department-public-health",
    ],
  ],
  location: [["San Francisco Planning", "https://sfplanning.org/"]],
};
