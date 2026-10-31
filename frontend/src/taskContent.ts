import { DATA, LINKS } from "./data";
import type { Founder } from "./state";
import type { RegulatoryRequirement } from "./api";
export type Term = [string, string];
export type Topic =
  | "structure"
  | "registration"
  | "ein"
  | "location"
  | "product_rules"
  | "compliance"
  | "food"
  | "privacy"
  | "contracts"
  | "finance"
  | "suppliers"
  | "marketplace"
  | "products"
  | "customers"
  | "security"
  | "operations";
export function taskTopic(title: string): Topic {
  if (/\bein\b|employer identification/i.test(title)) return "ein";
  if (/structure|choose business.*name/i.test(title)) return "structure";
  if (
    /premises|zoning|location|leasing|kitchen access|host agreement/i.test(
      title,
    )
  )
    return "location";
  if (/cottage|food|beverage|inspections/i.test(title)) return "food";
  if (/labeling|product eligibility|product.*rules/i.test(title))
    return "product_rules";
  if (/activity-specific|legal and compliance|monitor compliance/i.test(title))
    return "compliance";
  if (/privacy|data practices/i.test(title)) return "privacy";
  if (/contract|terms|agreements|\bip\b/i.test(title)) return "contracts";
  if (/tax|billing|invoic|recordkeep|finances/i.test(title)) return "finance";
  if (
    /registration|register|formation|compliance|activity-specific|legal/i.test(
      title,
    )
  )
    return "registration";
  if (/supplier|dropship|inventory|print-on-demand/i.test(title))
    return "suppliers";
  if (/marketplace|listings/i.test(title)) return "marketplace";
  if (/customer|acquisition/i.test(title)) return "customers";
  if (/security/i.test(title)) return "security";
  if (/product|goods|offering|scope|services/i.test(title)) return "products";
  return "operations";
}
const CONTENT: Record<
  Topic,
  {
    meaning: string;
    reason: string;
    outcome: string;
    terms: Term[];
    prepare: string[];
    possible?: string[];
  }
> = {
  product_rules: {
    meaning:
      "Review the product characteristics, packaging and labeling relevant to what you intend to sell.",
    reason:
      "The questions to verify depend on the actual product, its intended use and where it will be sold.",
    outcome:
      "Record your product specifications and the agency instructions that still need verification.",
    terms: [
      ["Labeling", "Information shown on a product or its packaging."],
      [
        "Product specification",
        "A description of a product’s materials, features and intended use.",
      ],
      [
        "Traceability",
        "The ability to follow a product back to its source or production batch.",
      ],
    ],
    prepare: [
      "Product list, composition or materials, and intended uses",
      "Intended customer locations and sales channels",
    ],
    possible: [
      "Draft labels, packaging or supplier specifications, if available",
    ],
  },
  compliance: {
    meaning:
      "Identify the official rules and agency processes that may relate to your particular business activities.",
    reason:
      "Applicability depends on what you do and where you operate, rather than the task title alone.",
    outcome:
      "Record the relevant agencies, supporting evidence and unresolved applicability questions.",
    terms: [
      [
        "Issuing agency",
        "The organization responsible for a particular rule or authorization.",
      ],
      [
        "Applicability",
        "Whether a rule or process covers your particular situation.",
      ],
      ["Compliance", "Meeting the rules that apply to an activity."],
    ],
    prepare: [
      "Business activities, products or services",
      "Operating address and intended customer locations",
    ],
    possible: ["Existing approvals or agency correspondence, if available"],
  },
  structure: {
    meaning:
      "Compare ways to own and organize the business, including operating as an individual or forming an entity.",
    reason:
      "Ownership, personal risk, funding plans and ongoing administration can affect the choice.",
    outcome:
      "Record the options you considered and the questions to verify before choosing a structure and name.",
    terms: [
      ["Legal structure", "The way a business is organized and owned."],
      [
        "Sole proprietorship",
        "A business operated by one individual without a separate incorporated entity.",
      ],
      [
        "LLC",
        "Limited liability company: a business entity whose legal and tax consequences depend on the circumstances.",
      ],
      [
        "Corporation",
        "A business entity with ownership represented by shares.",
      ],
    ],
    prepare: [
      "Proposed business name",
      "Owners and intended ownership shares",
      "Funding goals and activities to discuss",
    ],
  },
  registration: {
    meaning:
      "Review whether a formation or business registration process applies to your activity and chosen structure.",
    reason:
      "The relevant process depends on your location, activities and any existing registration.",
    outcome:
      "Identify the issuing agency and confirm the correct next action before submitting a filing.",
    terms: [
      [
        "Business registration",
        "Recording business information with an agency through its applicable process.",
      ],
      [
        "Registered agent",
        "A designated contact for receiving official legal notices for an entity.",
      ],
      [
        "Formation document",
        "A filing used to create a legal entity; its name varies by entity and jurisdiction.",
      ],
    ],
    prepare: [
      "Business name and operating address",
      "Owner or authorized contact information",
      "Selected structure and current registration status",
    ],
    possible: [
      "Existing formation or registration records, if already registered",
      "Registered-agent details, if the applicable agency asks for them",
    ],
  },
  ein: {
    meaning:
      "Review whether an Employer Identification Number is appropriate for your business and use the IRS instructions if applying.",
    reason:
      "This separates the question of a federal tax identifier from deciding whether to create a legal entity.",
    outcome:
      "Confirm applicability and record your next action using the IRS guidance.",
    terms: [
      [
        "EIN",
        "Employer Identification Number: a federal tax identifier issued by the IRS.",
      ],
      [
        "Responsible party",
        "The person identified as controlling or managing the entity in the IRS application.",
      ],
      ["Form SS-4", "The IRS form used to apply for an EIN."],
    ],
    prepare: [
      "Legal name, address and business activity",
      "Ownership and existing entity information",
    ],
    possible: ["Existing formation records, if applicable"],
  },
  location: {
    meaning:
      "Evaluate whether your proposed premises or shared kitchen can support the work you plan to do.",
    reason:
      "Space, permitted use, access and recurring commitments can change the practicality of a location.",
    outcome:
      "Record the address, operating needs and agency questions to resolve before committing to the space.",
    terms: [
      ["Zoning", "Local rules describing how land and buildings may be used."],
      [
        "Permitted use",
        "An activity a location may be used for under the applicable rules.",
      ],
      [
        "Occupancy costs",
        "Costs associated with using a space, such as rent and utilities.",
      ],
    ],
    prepare: [
      "Candidate address and intended activities",
      "Space, equipment and customer-access needs",
    ],
    possible: [
      "Proposed lease or kitchen agreement, if available",
      "Premises plan or agency correspondence, if available",
    ],
  },
  food: {
    meaning:
      "Check the rules relevant to the products you plan to make, label or sell.",
    reason:
      "Product ingredients, preparation methods, premises and sales channels can affect what needs agency review.",
    outcome:
      "Compare your actual product list with current agency instructions and note unresolved eligibility questions.",
    terms: [
      [
        "Product eligibility",
        "Whether a particular product fits the conditions of a program or rule.",
      ],
      [
        "Food safety",
        "Practices intended to reduce risks during preparation, storage and sale.",
      ],
      ["Labeling", "Information presented on a product or its packaging."],
    ],
    prepare: [
      "Product list, ingredients and preparation methods",
      "Production location and intended sales channels",
    ],
    possible: [
      "Draft labels or packaging, if available",
      "Existing permits or inspection records, if applicable",
    ],
  },
  privacy: {
    meaning:
      "Map the personal information your product collects, uses, shares and keeps.",
    reason:
      "Understanding those data flows helps you identify privacy decisions and questions for legal review.",
    outcome:
      "Create a data inventory and identify gaps between your practices and public statements.",
    terms: [
      [
        "Personal information",
        "Information that identifies, or can be linked to, a person.",
      ],
      [
        "Data processor",
        "A service that handles information for another business.",
      ],
      ["Retention", "How long information is kept before it is removed."],
    ],
    prepare: [
      "Data collected and the purpose of each category",
      "Vendors, sharing practices and retention approach",
    ],
    possible: ["Existing privacy notice or vendor agreements, if available"],
  },
  contracts: {
    meaning:
      "Clarify the expectations between your business and its customers, clients or collaborators.",
    reason:
      "Scope, payment, ownership and responsibilities are easier to discuss when they are written clearly.",
    outcome:
      "List the terms to agree and the questions a qualified professional should review.",
    terms: [
      ["Scope of work", "The work included in an engagement."],
      [
        "Deliverable",
        "A specific result or item the business agrees to provide.",
      ],
      [
        "Intellectual property",
        "Rights associated with creations such as software, designs or branding.",
      ],
    ],
    prepare: [
      "Services or product offered and the parties involved",
      "Payment, delivery and ownership expectations",
    ],
    possible: ["Existing agreements or terms, if available"],
  },
  finance: {
    meaning:
      "Review how your business will record transactions, bill customers and investigate applicable tax obligations.",
    reason:
      "Clear records make it easier to understand cash movement and prepare questions for an accountant or agency.",
    outcome:
      "Choose a recordkeeping process and identify the tax or billing questions that need verification.",
    terms: [
      [
        "Invoice",
        "A request for payment describing the goods or services supplied.",
      ],
      ["Bookkeeping", "Keeping organized records of business transactions."],
      [
        "Reconciliation",
        "Comparing records to check that balances and transactions match.",
      ],
    ],
    prepare: [
      "Sales channels and intended customer locations",
      "Planned billing and recordkeeping method",
    ],
    possible: [
      "Existing transaction records or tax registrations, if available",
    ],
  },
  suppliers: {
    meaning:
      "Evaluate the suppliers, inventory or fulfillment assumptions behind your selected operating model.",
    reason:
      "Quality, delivery reliability and ordering commitments affect what you can promise customers.",
    outcome:
      "Record supplier evidence and outstanding questions before making a purchasing commitment.",
    terms: [
      [
        "Fulfillment",
        "The steps involved in preparing and delivering an order.",
      ],
      ["Lead time", "The time between placing an order and receiving it."],
      ["Inventory", "Goods a business holds for future sale or use."],
    ],
    prepare: [
      "Products, suppliers and delivery expectations",
      "Supplier quotes and sample results, if available",
    ],
  },
  marketplace: {
    meaning:
      "Review how your chosen marketplace handles product listings, selling conditions and order delivery.",
    reason:
      "Platform policies and operating responsibilities can influence which products and processes fit your business.",
    outcome:
      "Check the relevant platform instructions and record the conditions you still need to satisfy.",
    terms: [
      [
        "Marketplace",
        "A platform where multiple businesses offer products or services.",
      ],
      [
        "Listing",
        "The product or service information shown to a potential buyer.",
      ],
      ["Fulfillment", "Preparing and delivering an order to the customer."],
    ],
    prepare: [
      "Chosen marketplace and intended products",
      "Listing details, delivery plan and platform policy links",
    ],
  },
  products: {
    meaning:
      "Define the products or services you intend to offer and how customers will receive them.",
    reason:
      "A clear offering helps you compare the resources, sales channels and operating work involved.",
    outcome:
      "Write a focused offering and a small test that can help validate your assumptions.",
    terms: [
      ["Sales channel", "A way customers discover or buy your offering."],
      ["Value proposition", "The benefit you expect a customer to receive."],
      [
        "Pilot",
        "A small test used to learn before making a larger commitment.",
      ],
    ],
    prepare: [
      "Proposed offering and intended sales channels",
      "Customer problem and assumptions to test",
    ],
  },
  customers: {
    meaning:
      "Identify who you want to serve and how you will test whether your offering meets their needs.",
    reason:
      "Customer conversations and small experiments help distinguish expectations from observed demand.",
    outcome:
      "Record the target customer, your main assumptions and a practical way to test them.",
    terms: [
      ["Target customer", "The person or business you intend to serve."],
      [
        "Customer acquisition",
        "The process of attracting someone who becomes a customer.",
      ],
      [
        "Validation",
        "Collecting evidence to assess whether an assumption holds.",
      ],
    ],
    prepare: [
      "Customer group and problem to investigate",
      "Questions for interviews or a small experiment",
    ],
  },
  security: {
    meaning:
      "Review how your product and operations protect access, information and service availability.",
    reason:
      "Identifying weak points before launch helps you prioritize improvements and response plans.",
    outcome:
      "Record your main risks, controls and unresolved launch-readiness checks.",
    terms: [
      ["Access control", "Deciding who can view or change a resource."],
      ["Backup", "A separate copy used to recover information."],
      [
        "Incident response",
        "The actions taken when a security problem is discovered.",
      ],
    ],
    prepare: [
      "Systems, vendors and access permissions",
      "Backup and recovery approach",
    ],
  },
  operations: {
    meaning:
      "Review the practical work needed to deliver your offering and support customers at launch.",
    reason:
      "Clear responsibilities and tested processes help reveal gaps before you begin operating.",
    outcome:
      "Record who owns the remaining checks and what evidence will show you are ready.",
    terms: [
      ["Operating process", "The steps used to carry out recurring work."],
      [
        "Contingency plan",
        "An alternative approach if an expected step fails.",
      ],
      [
        "Launch readiness",
        "The state of preparation to begin serving customers.",
      ],
    ],
    prepare: [
      "Delivery process, responsibilities and support contacts",
      "Outstanding checks and launch assumptions",
    ],
  },
};
export function taskContent(
  s: Founder,
  title: string,
  finding?: RegulatoryRequirement,
) {
  const topic = taskTopic(title),
    base = CONTENT[topic],
    name = s.name || "your business";
  const model = DATA[s.type]?.models.find((m) => m.id === s.model)?.name;
  const setting = [model, [s.city, s.state].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" in ");
  const context = `For ${name}${setting ? ` (${setting})` : ""},`;
  const brief = (text: string, n: number) =>
    text
      .match(/[^.!?]+[.!?]*/g)
      ?.slice(0, n)
      .join("")
      .trim() || text;
  let explanation = finding
    ? `${context} ${brief(finding.description, 2)} ${brief(finding.reason, 1)}`
    : `${context} ${base.meaning[0].toLowerCase() + base.meaning.slice(1)} ${base.reason} ${s.details.formation_status === "formed" && ["registration", "structure"].includes(topic) ? "Review the existing entity and records; do not file a new entity automatically." : base.outcome}`;
  const task = s.roadmap.find((t) => t.title === title);
  if (
    !finding &&
    task?.stable_key.startsWith("advisor:") &&
    task.guide.actions.length
  ) {
    explanation = `${context} this step focuses on ${title.charAt(0).toLowerCase() + title.slice(1)}. ${task.guide.actions
      .slice(0, 2)
      .map((a) => a.replace(/[.!?]$/, "") + ".")
      .join(" ")} Record what you learn before marking this action complete.`;
  }
  const docs = (finding ? finding.required_information : base.prepare).map(
    (text) => ({ text, kind: "Information to prepare" as string }),
  );
  if (!finding)
    for (const text of base.possible || [])
      docs.push({ text, kind: "May be needed" });
  if (finding)
    for (const doc of docs) {
      // A model-generated list alone does not establish a mandatory document.
      const supported =
        !finding.needs_revalidation &&
        finding.applicability === "applicable" &&
        finding.evidence.some(
          (e) =>
            /\bmust\b|\brequired\b/i.test(e.excerpt) &&
            e.excerpt.toLowerCase().includes(doc.text.toLowerCase()),
        );
      doc.kind = supported
        ? "Required by cited instructions — confirm applicability"
        : "May be needed — confirm with agency";
    }
  return { topic, explanation, terms: base.terms, docs };
}
export function curatedResources(
  s: Founder,
  title: string,
): [string, string][] {
  const topic = taskTopic(title),
    ca = /^(california|ca)$/i.test(s.state.trim()),
    az = /^(arizona|az)$/i.test(s.state.trim()),
    sf = ca && /^san francisco$/i.test(s.city.trim());
  if (topic === "ein") return LINKS.ein;
  if (topic === "structure")
    return [
      [
        "SBA — Choose a business structure",
        "https://www.sba.gov/business-guide/launch-your-business/choose-business-structure",
      ],
    ];
  if (az && (topic === "registration" || topic === "compliance")) return [
    ["Arizona Corporation Commission — Starting a business", "https://www.azcc.gov/corporations/10-steps-to-starting-a-business-in-arizona"],
    ...(topic === "registration" ? [["Arizona Corporation Commission — Formation forms", "https://azcc.gov/Corporations/forms"] as [string,string]] : []),
  ];
  if (az && topic === "finance") return [
    ["Arizona Department of Revenue — Transaction privilege tax", "https://azdor.gov/business/transaction-privilege-tax"],
    ...LINKS.tax.filter(([,url]) => url.includes("irs.gov")),
  ];
  if (topic === "registration") return ca ? LINKS.entity : [];
  if (topic === "finance")
    return LINKS.tax.filter(([, url]) => url.includes("irs.gov") || ca);
  if (topic === "food")
    return ca
      ? LINKS.bakery.filter(([, url]) => !url.includes("sf.gov") || sf)
      : [];
  if (topic === "location") return sf ? LINKS.location : [];
  return [];
}
export function relevantFindings(title: string, rows: RegulatoryRequirement[]) {
  const topic = taskTopic(title);
  return rows.filter(
    (r) =>
      !r.needs_revalidation &&
      r.applicability !== "not_applicable" &&
      taskTopic(r.name) === topic,
  );
}
