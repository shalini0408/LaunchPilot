import os
import re
from fastapi import HTTPException
from sqlalchemy import select
from ..catalog import INDUSTRIES
from ..research.service import profile_snapshot, fingerprint
from .models import BusinessModelComparison
from .schemas import ComparisonOutput
from .llm import structured
from .prompts import COMPARISON
from .context import build_context, citations
from .discovery import questions

STRUCTURES=[('sole_proprietorship','Sole proprietorship','An operating approach to compare for a solo founder.'),('llc','Limited Liability Company (LLC)','An entity option to review against your ownership, risk and funding goals.'),('corporation','Corporation','An entity option to discuss when share ownership and outside investment are important.'),('partnership','Partnership','An ownership approach to discuss when more than one owner is involved.')]

def candidates(business,kind):
    if kind=='models':return INDUSTRIES.get(business.industry,{}).get('models',[])
    return [{'id':id,'name':name,'description':desc} for id,name,desc in STRUCTURES if id!='partnership' or (business.details or {}).get('founder_count',0) not in (None,0,1)]

def baseline(business,kind):
    options=[]
    for candidate in candidates(business,kind):
        options.append({'id':candidate['id'],'name':candidate['name'],
            'startup_costs':'Qualitative planning only: compare equipment, premises, suppliers and ongoing commitments; affordability is not established.',
            'operational_complexity':candidate.get('description','Review operating and governance responsibilities.'),
            'customer_acquisition':'Test how you will reach your stated customers; demand has not been verified.',
            'scalability':'Compare delivery capacity and your growth goals before committing.',
            'location_requirements':'Confirm suitability of your actual address and operating activities.',
            'regulatory_considerations':'Verify current formation, tax and activity-specific rules with official agencies.',
            'risks':['Unverified costs and assumptions','Legal/tax consequences require appropriate professional review'],
            'advantages':candidate.get('points',[]) or ['Explore fit with your ownership and funding preferences.'],
            'disadvantages':['Further information is required to assess suitability.'],
            'fit':f"Compare for {business.company_name or 'your business'} in {business.city or 'your undecided city'}, {business.state or 'your undecided state'}; goals: {(business.details or {}).get('goals') or 'not yet confirmed'}.",
            'assumptions':['Educational planning comparison, not verified costs or legal advice.'],
            'missing_information':[q['text'] for q in questions(business)],'sources':[]})
    return {'kind':kind,'options':options,'explanation':'Compare alternatives; no option is universally best. An LLC does not imply a particular tax treatment or complete liability protection.','mode':'guided','questions':questions(business,structure=kind=='structures')}

def check_strategy(value,business):
    # No invented precise currency amounts, percentages of returns, or guarantees.
    from decimal import Decimal, InvalidOperation
    allowed=business.budget
    for amount in re.findall(r'[$£€]\s*([\d,]+(?:\.\d+)?)',value):
        try:
            if allowed is None or Decimal(amount.replace(',',''))!=allowed:raise HTTPException(502,'The advisor supplied an unsupported precise cost. Retry with qualitative estimates.')
        except InvalidOperation:raise HTTPException(502,'Invalid cost estimate.') from None
    if re.search(r'guaranteed (?:profit|success|return)|will definitely succeed|complete liability protection is guaranteed',value,re.I):
        raise HTTPException(502,'An unsupported guarantee was rejected.')

async def generate(db,business,kind):
    if kind=='models' and not business.industry:raise HTTPException(422,'Confirm an industry before comparing business models.')
    context,sources=build_context(db,business)
    if os.getenv('OPENAI_API_KEY','').strip():
        options=candidates(business,kind)
        parsed=await structured(ComparisonOutput,'business_comparison',COMPARISON,{**context,'kind':kind,'allowed_options':options})
        check_strategy(parsed.explanation,business)
        expected={o['id'] for o in options}
        if {o.id for o in parsed.options}!=expected or len(parsed.options)!=len(expected):raise HTTPException(502,'The advisor returned unsupported comparison options; no profile changes were made.')
        result={'kind':kind,'options':[],'explanation':parsed.explanation,'mode':'live','questions':questions(business,structure=kind=='structures')}
        for option in parsed.options:
            data=option.model_dump(exclude={'evidence'});check_strategy(str(data),business)
            data['sources']=citations(option.evidence,sources)
            reject_unsupported_law(str({k:v for k,v in data.items() if k not in ('sources','regulatory_considerations','missing_information')}),data['sources'])
            if not data['sources']:data['regulatory_considerations']='Current regulatory requirements are not verified for this option. Use government research and confirm with the agency.'
            result['options'].append(data)
    else:result=baseline(business,kind)
    row=BusinessModelComparison(business_id=business.id,kind=kind,profile_hash=fingerprint(profile_snapshot(business)),data=result)
    db.add(row);db.commit()
    return {'id':row.id,**result}


def has_regulatory_claim(value):
    # Ordinary business instructions (e.g. "this requires scheduling") are not legal claims.
    return bool(re.search(r'legally (?:required|obligated)|the law requires|filing fee|tax rate|deadline is|liability shield|tax treatment|(?:must|required|requires).{0,80}(?:register|registration|licen[cs]e|permit|filing|tax|\bein\b|\bllc\b|corporation)|(?:without|no).{0,25}(?:permit|licen[cs]e|registration)',value,re.I))

def reject_unsupported_law(value,refs):
    if not refs and has_regulatory_claim(value):
        raise HTTPException(502,'A regulatory claim lacked official evidence and was withheld. Research current requirements before retrying.')
