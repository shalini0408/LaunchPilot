from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from ..schemas import BusinessPatch
from ..research.extraction import Evidence

class Input(BaseModel):
    model_config=ConfigDict(extra='forbid',str_strip_whitespace=True)

class DiscoveryInput(Input):
    message: str = Field(min_length=1,max_length=4000)

class ExtractedProfile(Input):
    company_name: str | None
    industry: str | None
    business_model: str | None
    city: str | None
    state: str | None
    budget: str | None
    ownership_details: str | None
    legal_structure: str | None
    activities: list[str] | None
    products: list[str] | None
    industry_label: str | None
    operating_model_label: str | None
    country: str | None
    currency: str | None
    founder_count: int | None
    existing_legal_structure: str | None
    formation_status: str | None
    target_customers: str | None
    goals: str | None
    constraints: str | None
    investment_plans: str | None
    liability_exposure: str | None
    hire_employees: str | None

class Extraction(Input):
    profile: ExtractedProfile
    explanation: str
    unanswered_questions: list[str]

class FollowupAnswer(Input):
    field: str = Field(max_length=100)
    answer: str = Field(default='',max_length=4000)
    action: Literal['answer','skip','undecided'] = 'answer'

class PlanningAction(Input):
    title: str = Field(min_length=1,max_length=300)
    actions: list[str] = Field(max_length=12)

class ProposalInput(Input):
    changes: BusinessPatch = Field(default_factory=BusinessPatch)
    origin: Literal['profile','discovery','comparison','structure','recommendation'] = 'profile'
    planning_task: PlanningAction | None = None

class Confirmation(Input):
    confirmed: Literal[True]

class ComparisonInput(Input):
    kind: Literal['models','structures'] = 'models'

class ComparisonOption(Input):
    id: str
    name: str
    startup_costs: str
    operational_complexity: str
    customer_acquisition: str
    scalability: str
    location_requirements: str
    regulatory_considerations: str
    risks: list[str]
    advantages: list[str]
    disadvantages: list[str]
    fit: str
    assumptions: list[str]
    missing_information: list[str]
    evidence: list[Evidence]

class ComparisonOutput(Input):
    options: list[ComparisonOption]
    explanation: str

class RecommendationDraft(Input):
    category: Literal['next_actions','alternatives','risks','questions']
    title: str
    action: str
    explanation: str
    fit: str
    advantages: list[str]
    tradeoffs: list[str]
    assumptions: list[str]
    missing_information: list[str]
    evidence: list[Evidence]
    proposed_changes: ExtractedProfile | None
    planning_task: PlanningAction | None

class RecommendationOutput(Input):
    recommendations: list[RecommendationDraft]

class Feedback(Input):
    action: Literal['save','dismiss','accept']

class AdvisorChatInput(Input):
    question: str = Field(min_length=1,max_length=1000)
    task_id: str | None = Field(default=None,max_length=36)
    requirement_id: str | None = Field(default=None,max_length=36)
    research: bool = True

class StrategyParagraph(Input):
    text: str
    basis: Literal['planning_assumption','clarification','regulatory']
    evidence: list[Evidence]

class StrategyAnswer(Input):
    paragraphs: list[StrategyParagraph]
