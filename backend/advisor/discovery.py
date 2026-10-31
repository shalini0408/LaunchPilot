from fastapi import HTTPException
from sqlalchemy import select
from .models import FounderDecision
from ..research.service import fingerprint
from ..catalog import INDUSTRIES
from ..schemas import BusinessFields, ProfileDetails
from ..research.service import profile_snapshot
from .schemas import Extraction
from .llm import structured
from .prompts import DISCOVERY
from .decisions import preview
from .conversations import conversation, append_exchange, history, response

QUESTION_BANK=[
 ('industry','Which industry best describes your business?',False),('activities','What products or services will you offer?',True),
 ('city','Which city will you operate from?',False),('state','Which state or region will you operate in?',False),('country','Which country will you operate in?',False),
 ('formation_status','Have you already formed a business entity?',False),('founder_count','How many owners or founders are involved?',False),
 ('investment_plans','Do you expect to seek outside equity investment?',False),('liability_exposure','How would you describe customer, premises, or product liability exposure?',False),
 ('hire_employees','Do you plan to hire employees?',False),('budget','What launch budget would you like to plan around?',True),('currency','Which currency is your budget in?',True),
 ('goals','What are your growth or launch goals?',True),('target_customers','Who are your target customers?',True),('business_model','Which business model would you like to explore?',False),
]
def questions(business,essential=False,structure=False):
    profile=profile_snapshot(business);details=profile['details'];result=[]
    exploration_order=['industry','activities','budget','city','state','target_customers','business_model','currency','country','goals','constraints','formation_status','founder_count','investment_plans','liability_exposure','hire_employees']
    bank=sorted(QUESTION_BANK,key=lambda q: ['founder_count','investment_plans','liability_exposure','hire_employees','goals','formation_status'].index(q[0]) if q[0] in ['founder_count','investment_plans','liability_exposure','hire_employees','goals','formation_status'] else 20) if structure else sorted(QUESTION_BANK,key=lambda q:exploration_order.index(q[0]) if q[0] in exploration_order else 99)
    for field,text,optional in bank:
        if essential and field not in ('industry','activities','city','state','country','business_model'):continue
        if details.get('question_status',{}).get(field) in ('skipped','undecided'):continue
        value=profile.get(field,details.get(field))
        if value not in ('',None,[]):continue
        if field=='activities':text={'bakery':'What will you bake and how will you sell it?','software':'What software or services will you build, and for whom?','ecommerce':'What products will you sell, and who will fulfill orders?'}.get(business.industry,text)
        result.append({'field':field,'text':text,'optional':optional,'choices':['I haven’t decided yet','Skip']})
        if len(result)==2:break
    return result

def extracted_changes(business,extracted):
    raw=extracted.model_dump(exclude_none=True)
    changes={};details={}
    for key,value in raw.items():
        if value in ('',[]):continue
        if key in BusinessFields.model_fields:changes[key]=value
        elif key in ProfileDetails.model_fields:details[key]=value
    industry=changes.get('industry',business.industry)
    if industry and industry not in INDUSTRIES:
        details.setdefault('industry_label',industry)
        changes['industry']='other'
        industry='other'
    model=changes.get('business_model')
    if model and model not in INDUSTRIES.get(industry,{}).get('steps',{}):
        if any(model in item.get('steps',{}) for item in INDUSTRIES.values()):
            raise HTTPException(422,'Business model must belong to the selected industry')
        details.setdefault('operating_model_label',model.replace('_',' '))
        changes['business_model']=''
    previous_label=(business.details or {}).get('industry_label','')
    different_industry=('industry' in changes and changes['industry']!=business.industry) or bool(details.get('industry_label') and details['industry_label'].casefold()!=previous_label.casefold())
    if different_industry:
        # These are proposed changes only. Do not silently carry a previous idea's identity/model into an alternative.
        changes.setdefault('company_name','')
        changes.setdefault('business_model','')
        for key,empty in (('operating_model_label',''),('industry_label',''),('activities',[]),('products',[])):
            details.setdefault(key,empty)
    if changes.get('state') and changes['state'].casefold()!=business.state.casefold() and 'city' not in changes:
        changes['city']=''
    if raw.get('formation_status')=='formed' and raw.get('legal_structure') and not details.get('existing_legal_structure'):
        details['existing_legal_structure']=raw['legal_structure']
    if details:changes['details']=details
    from ..profiles import validated_changes
    validated_changes(business,changes)
    return changes

async def discover(db,business,message):
    row=conversation(db,business.id,'discovery')
    pending=db.scalar(select(FounderDecision).where(FounderDecision.business_id==business.id,FounderDecision.origin=='discovery',FounderDecision.status=='pending',FounderDecision.before_hash==fingerprint(profile_snapshot(business))).order_by(FounderDecision.created_at.desc()))
    proposed=pending.data['changes'] if pending else {}
    parsed=await structured(Extraction,'business_discovery',DISCOVERY,{'confirmed_profile':profile_snapshot(business),'unconfirmed_idea_changes':proposed,'catalog':{k:[{'id':m['id'],'name':m['name'],'description':m['description']} for m in b['models']] for k,b in INDUSTRIES.items()},'conversation':history(row),'new_message':message})
    from .comparisons import check_strategy,reject_unsupported_law
    changes=extracted_changes(business,parsed.profile)
    from types import SimpleNamespace
    from decimal import Decimal
    check_strategy(parsed.explanation,SimpleNamespace(budget=Decimal(parsed.profile.budget) if parsed.profile.budget else business.budget))
    reject_unsupported_law(parsed.explanation,[])
    # Saving the original idea is a proposal too; no silent profile mutation.
    if not business.idea or ('industry' in changes and (changes['industry']!=business.industry or changes.get('details',{}).get('industry_label')!=(business.details or {}).get('industry_label',''))):changes['idea']=message
    if proposed:
        changes={**proposed,**changes,'details':{**proposed.get('details',{}),**changes.get('details',{})}}
    proposal=preview(db,business,changes,'discovery') if changes else None
    append_exchange(db,row,message,parsed.explanation)
    return {'conversation':response(row),'proposal':proposal,'questions':questions(business),'unanswered_questions':parsed.unanswered_questions[:2]}

def followup(db,business,data):
    allowed={f for f,_,_ in QUESTION_BANK}
    allowed.update({'legal_structure','ownership_details','products','constraints'})
    if data.field not in allowed:raise HTTPException(422,'Unknown discovery question field.')
    status={'answer':'answered','skip':'skipped','undecided':'undecided'}[data.action]
    changes={'details':{'question_status':{data.field:status}}}
    if data.action=='answer':
        if not data.answer.strip():raise HTTPException(422,'Enter an answer or skip this question.')
        value=data.answer
        if data.field=='industry':
            value=next((key for key,item in INDUSTRIES.items() if value.casefold() in (key,item['name'].casefold())),value.lower())
        if data.field=='budget':value=value.replace(',','').lstrip('$').strip()
        if data.field=='business_model':
            value=next((item['id'] for item in INDUSTRIES.get(business.industry,{}).get('models',[]) if value.casefold() in (item['id'],item['name'].casefold())),value)
        if data.field=='legal_structure':value=value.lower().replace(' ','_')
        if data.field=='founder_count':
            try:value=int(value)
            except ValueError:raise HTTPException(422,'Founder count must be a whole number.') from None
        if data.field in ('activities','products'):value=[v.strip() for v in value.split(',') if v.strip()]
        if data.field in BusinessFields.model_fields:changes[data.field]=value
        else:changes['details'][data.field]=value
    elif data.action=='undecided':
        from ..schemas import ProfileDetails
        if data.field in ('formation_status','investment_plans','liability_exposure','hire_employees'):changes['details'][data.field]='undecided'
    proposal=preview(db,business,changes,'discovery')
    return {'proposal':proposal,'questions':questions(business)}
