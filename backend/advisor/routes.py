from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..profiles import find_business
from ..research.service import fingerprint, profile_snapshot
from . import discovery, comparisons, recommendations, decisions
from .models import FounderDecision, SavedRecommendation, RecommendationFeedback, BusinessModelComparison
from .schemas import DiscoveryInput, FollowupAnswer, ProposalInput, Confirmation, ComparisonInput, Feedback, AdvisorChatInput
from .conversations import conversation, response
from .chat import chat
router=APIRouter(prefix='/api/businesses/{business_id}',tags=['Intelligent advisor'])

def get_decision(db,business_id,id):
    row=db.get(FounderDecision,id)
    if not row or row.business_id!=business_id:raise HTTPException(404,'Decision not found for this business.')
    return row

@router.get('/discovery')
def get_discovery(business_id:str,essential:bool=False,db:Session=Depends(get_db)):
    b=find_business(db,business_id)
    pending=db.scalar(select(FounderDecision).where(FounderDecision.business_id==b.id,FounderDecision.origin=='discovery',FounderDecision.status=='pending',FounderDecision.before_hash==fingerprint(profile_snapshot(b))).order_by(FounderDecision.created_at.desc()))
    return {'conversation':response(conversation(db,b.id,'discovery')),'questions':discovery.questions(b,essential),'proposal':decisions.decision_response(pending) if pending else None}

@router.post('/discovery/messages')
async def discover(business_id:str,data:DiscoveryInput,db:Session=Depends(get_db)):
    return await discovery.discover(db,find_business(db,business_id),data.message)

@router.post('/discovery/answers')
def answer(business_id:str,data:FollowupAnswer,db:Session=Depends(get_db)):
    return discovery.followup(db,find_business(db,business_id),data)

@router.post('/decisions')
def propose(business_id:str,data:ProposalInput,db:Session=Depends(get_db)):
    return decisions.preview(db,find_business(db,business_id),data.changes.model_dump(exclude_unset=True,exclude={'confirm_changes'}),data.origin,data.planning_task.model_dump() if data.planning_task else None)

@router.get('/decisions')
def list_decisions(business_id:str,db:Session=Depends(get_db)):
    find_business(db,business_id)
    return [decisions.decision_response(d) for d in db.scalars(select(FounderDecision).where(FounderDecision.business_id==business_id).order_by(FounderDecision.created_at.desc()).limit(100))]

@router.post('/decisions/{decision_id}/confirm')
def confirm(business_id:str,decision_id:str,data:Confirmation,db:Session=Depends(get_db)):
    return decisions.confirm(db,find_business(db,business_id),get_decision(db,business_id,decision_id))

@router.post('/decisions/{decision_id}/dismiss')
def dismiss(business_id:str,decision_id:str,db:Session=Depends(get_db)):
    find_business(db,business_id);row=get_decision(db,business_id,decision_id)
    if row.status!='pending':raise HTTPException(409,'Only pending decisions can be dismissed.')
    row.status='dismissed';db.commit();return decisions.decision_response(row)

@router.get('/comparisons')
def get_comparisons(business_id:str,kind:str='models',db:Session=Depends(get_db)):
    b=find_business(db,business_id)
    if kind not in ('models','structures'):raise HTTPException(422,'Comparison kind must be models or structures.')
    row=db.scalar(select(BusinessModelComparison).where(BusinessModelComparison.business_id==b.id,BusinessModelComparison.kind==kind,BusinessModelComparison.profile_hash==fingerprint(profile_snapshot(b))).order_by(BusinessModelComparison.created_at.desc()))
    return {'id':row.id,**row.data} if row else comparisons.baseline(b,kind)

@router.post('/comparisons')
async def compare(business_id:str,data:ComparisonInput,db:Session=Depends(get_db)):
    return await comparisons.generate(db,find_business(db,business_id),data.kind)

@router.get('/recommendations')
def list_recommendations(business_id:str,db:Session=Depends(get_db)):
    b=find_business(db,business_id);key=fingerprint(profile_snapshot(b))
    return [{'id':r.id,'status':r.status,'stale':r.profile_hash!=key,**r.data} for r in db.scalars(select(SavedRecommendation).where(SavedRecommendation.business_id==b.id).order_by(SavedRecommendation.created_at.desc()).limit(100))]

@router.post('/recommendations')
async def recommend(business_id:str,db:Session=Depends(get_db)):
    return await recommendations.generate(db,find_business(db,business_id))

@router.post('/recommendations/{recommendation_id}/feedback')
def feedback(business_id:str,recommendation_id:str,data:Feedback,db:Session=Depends(get_db)):
    b=find_business(db,business_id);row=db.get(SavedRecommendation,recommendation_id)
    if not row or row.business_id!=b.id:raise HTTPException(404,'Recommendation not found.')
    if data.action=='accept':
        if row.status=='accepted':return {'id':row.id,'status':'accepted'}
        if row.profile_hash!=fingerprint(profile_snapshot(b)):raise HTTPException(409,'This recommendation is based on an older profile. Generate fresh recommendations first.')
        return {'proposal':decisions.preview(db,b,row.data['proposed_changes'],'recommendation',row.data.get('planning_task'),row.id)}
    row.status='saved' if data.action=='save' else 'dismissed'
    db.add(RecommendationFeedback(recommendation_id=row.id,action=data.action));db.commit()
    return {'id':row.id,'status':row.status}

@router.get('/advisor/conversation')
def advisor_history(business_id:str,scope:str='advisor',db:Session=Depends(get_db)):
    find_business(db,business_id)
    if len(scope)>150:raise HTTPException(422,'Conversation scope is too long.')
    return response(conversation(db,business_id,scope))

@router.post('/advisor/chat')
async def advisor_chat(business_id:str,data:AdvisorChatInput,background:BackgroundTasks,db:Session=Depends(get_db)):
    return await chat(db,find_business(db,business_id),data,background)
