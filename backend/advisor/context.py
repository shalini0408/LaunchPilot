from fastapi import HTTPException
from sqlalchemy import select
from ..models import RoadmapTask
from ..profiles import business_response
from ..research.models import RegulatoryRequirement, GovernmentSource
from ..research.service import requirement_response
from ..research.extraction import valid_quote
from .models import SavedRecommendation, FounderDecision

def build_context(db,business,task_id=None,requirement_id=None):
    profile=business_response(db,business).model_dump(mode='json')
    context={'profile':{k:v for k,v in profile.items() if k!='roadmap'},'completed_tasks':[t['title'] for t in profile['roadmap'] if t['completed']],
        'roadmap':profile['roadmap'],'saved_recommendations':[{'id':r.id,'status':r.status,**r.data} for r in db.scalars(select(SavedRecommendation).where(SavedRecommendation.business_id==business.id,SavedRecommendation.status.in_(['saved','accepted'])).limit(12))],
        'confirmed_decisions':[r.data['differences'] for r in db.scalars(select(FounderDecision).where(FounderDecision.business_id==business.id,FounderDecision.status=='confirmed').order_by(FounderDecision.created_at.desc()).limit(6))]}
    if task_id:
        task=db.get(RoadmapTask,task_id)
        if not task or task.business_id!=business.id:raise HTTPException(404,'Task not found for this business.')
        if not task.active:raise HTTPException(409,'This task is archived; reload your roadmap.')
        context['current_task']={'id':task.id,'title':task.title,'guide':task.guide}
    findings=[]
    for req in db.scalars(select(RegulatoryRequirement).where(RegulatoryRequirement.business_id==business.id)):
        if requirement_id and req.id!=requirement_id:continue
        finding=requirement_response(db,req,business)
        if not finding['needs_revalidation']:findings.append(finding)
    if requirement_id:
        selected=db.scalar(select(RegulatoryRequirement).where(RegulatoryRequirement.id==requirement_id,RegulatoryRequirement.business_id==business.id))
        if not selected:raise HTTPException(404,'Requirement not found for this business.')
        finding=requirement_response(db,selected,business)
        context['current_requirement']={key:finding[key] for key in ('name','description','agency','jurisdiction','needs_revalidation')}
        # A stale description identifies the subject; only fresh sources support current-law claims.
    context['regulatory_evidence']=findings[:12]
    ids={e['source_id'] for r in findings[:12] for key in ('evidence','fees','deadlines') for e in r.get(key,[])}
    sources=[{'id':s.id,'url':s.url,'title':s.title,'text':s.text} for s in db.scalars(select(GovernmentSource).where(GovernmentSource.id.in_(ids)))]
    context['evidence_available']=bool(sources)
    return context,sources

def citations(evidence,sources):
    indexed={s['id']:s for s in sources};result=[]
    for e in evidence:
        source=indexed.get(e.source_id)
        if not source or not valid_quote(e.excerpt,source):raise HTTPException(502,'The advisor supplied unsupported evidence. No changes were applied.')
        result.append({'url':source['url'],'title':source['title'],'excerpt':e.excerpt})
    return result
