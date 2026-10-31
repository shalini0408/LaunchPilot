from fastapi import HTTPException
from ..research.service import fingerprint, profile_snapshot
from .schemas import RecommendationOutput
from .llm import structured
from .prompts import RECOMMENDATIONS
from .context import build_context, citations
from .comparisons import check_strategy, reject_unsupported_law
from .discovery import extracted_changes, questions
from .models import SavedRecommendation

async def generate(db,business):
    context,sources=build_context(db,business)
    missing=questions(business)
    if not business.industry or not (business.details or {}).get('activities'):
        items=[{'category':'questions','title':'Clarify your business activities','action':'Answer the discovery questions before committing resources.',
            'explanation':'Recommendations need confirmed facts.','fit':'Your activities or industry are not yet confirmed.','advantages':[], 'tradeoffs':['Requires a little more information.'],
            'assumptions':[],'missing_information':[q['text'] for q in missing],'sources':[],'proposed_changes':{},'planning_task':None}]
    else:
        parsed=await structured(RecommendationOutput,'business_recommendations',RECOMMENDATIONS,context)
        items=[]
        for item in parsed.recommendations[:12]:
            data=item.model_dump(exclude={'evidence','proposed_changes'})
            check_strategy(str(data),business)
            data['sources']=citations(item.evidence,sources)
            reject_unsupported_law(str(data),data['sources'])
            data['proposed_changes']=extracted_changes(business,item.proposed_changes) if item.proposed_changes else {}
            if not data['sources']:
                data['assumptions']=list(dict.fromkeys(data['assumptions']+['Planning suggestion; current legal requirements and costs are not verified.']))
            items.append(data)
    result=[]
    for data in items:
        row=SavedRecommendation(business_id=business.id,profile_hash=fingerprint(profile_snapshot(business)),data=data)
        db.add(row);db.flush();result.append({'id':row.id,'status':row.status,**data})
    db.commit();return result
