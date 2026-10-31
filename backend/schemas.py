from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator, field_validator
from .catalog import INDUSTRIES

LegalStructure = Literal['', 'sole_proprietorship', 'llc', 'corporation', 'partnership', 'undecided']

class ProfileDetails(BaseModel):
    model_config = ConfigDict(extra='forbid',str_strip_whitespace=True)
    activities: list[str] = Field(default_factory=list,max_length=30)
    products: list[str] = Field(default_factory=list,max_length=30)
    industry_label: str = Field(default='',max_length=200)
    operating_model_label: str = Field(default='',max_length=300)
    operating_location: str = Field(default='',max_length=1000)
    country: str = Field(default='',max_length=100)
    currency: str = Field(default='',max_length=10)
    founder_count: int | None = Field(default=None,ge=1,le=1000)
    existing_legal_structure: LegalStructure = ''
    formation_status: Literal['','not_formed','in_progress','formed','undecided'] = ''
    target_customers: str = Field(default='',max_length=2000)
    goals: str = Field(default='',max_length=2000)
    constraints: str = Field(default='',max_length=2000)
    investment_plans: Literal['','yes','no','undecided'] = ''
    liability_exposure: Literal['','low','medium','high','undecided'] = ''
    hire_employees: Literal['','yes','no','undecided'] = ''
    @field_validator('activities','products')
    @classmethod
    def clean_activities(cls,values):
        cleaned=list(dict.fromkeys(value.strip() for value in values if value.strip()))
        if any(len(value)>500 for value in cleaned):raise ValueError('Each activity/product must be at most 500 characters')
        return cleaned

    question_status: dict[str, Literal['answered','skipped','undecided']] = Field(default_factory=dict,max_length=50)

class BusinessFields(BaseModel):
    details: ProfileDetails = Field(default_factory=ProfileDetails)
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    company_name: str = Field(default='', max_length=300)
    idea: str = Field(default='', max_length=4000)
    industry: str = Field(default='', max_length=100)
    business_model: str = Field(default='', max_length=100)
    city: str = Field(default='', max_length=200)
    state: str = Field(default='', max_length=200)
    budget: Decimal | None = Field(default=None, ge=0, le=999999999999, decimal_places=2)
    ownership_details: str = Field(default='', max_length=4000)
    legal_structure: LegalStructure = ''

    @model_validator(mode='before')
    @classmethod
    def normalize_industry(cls,value):
        if not isinstance(value,dict):return value
        raw=value.get('industry')
        if not isinstance(raw,str) or not raw.strip():return value
        label=raw.strip()
        canonical=next((key for key,item in INDUSTRIES.items() if label.casefold() in (key.casefold(),item['name'].casefold())),None)
        if canonical:return {**value,'industry':canonical}
        if len(label)>200:raise ValueError('Industry description must be at most 200 characters')
        details=value.get('details',{})
        if isinstance(details,ProfileDetails):details=details.model_dump()
        if details is not None and not isinstance(details,dict):raise ValueError('Business details must be an object')
        return {**value,'industry':'other','details':{**(details or {}),'industry_label':label}}

    @field_validator('budget')
    @classmethod
    def canonical_budget(cls,value):
        return value.quantize(Decimal('0.01')) if value is not None else None

    @model_validator(mode='after')
    def valid_model(self):
        if self.industry and self.industry not in INDUSTRIES:
            raise ValueError('Choose a supported industry')
        if self.business_model and self.business_model not in INDUSTRIES.get(self.industry, {}).get('steps', {}):
            raise ValueError('Business model must belong to the selected industry')
        return self

class BusinessCreate(BusinessFields):
    legacy_progress: dict[str, StrictBool] = Field(default_factory=dict, max_length=200)

class BusinessPatch(BaseModel):
    details: ProfileDetails | None = None
    confirm_changes: bool = False
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    company_name: str | None = Field(default=None, max_length=300)
    idea: str | None = Field(default=None, max_length=4000)
    industry: str | None = Field(default=None, max_length=200)
    business_model: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=200)
    state: str | None = Field(default=None, max_length=200)
    budget: Decimal | None = Field(default=None, ge=0, le=999999999999, decimal_places=2)
    ownership_details: str | None = Field(default=None, max_length=4000)
    legal_structure: LegalStructure | None = None

    @model_validator(mode='after')
    def no_null_strings(self):
        if any(getattr(self, field) is None for field in self.model_fields_set - {'budget','confirm_changes'}):
            raise ValueError('Only budget can be null; use an empty string to clear text fields')
        return self

class GuideRead(BaseModel):
    goal: str
    actions: list[str]
    prepare: list[str]
    proof: str

class TaskRead(BaseModel):
    kind: str = 'planning'
    requirement_id: str | None = None
    needs_revalidation: bool = False
    id: str
    stable_key: str
    title: str
    position: int
    guide: GuideRead
    completed: bool

class BusinessRead(BusinessFields):
    journey: str = ''
    launch_ready: bool = False
    last_path: str = ''
    id: str
    founder_id: str
    roadmap: list[TaskRead]

class FounderRead(BaseModel):
    id: str
    business_id: str | None

class ProgressUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    completed: StrictBool
