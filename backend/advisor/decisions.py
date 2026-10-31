from fastapi import HTTPException
from sqlalchemy import select, update
from ..models import RoadmapTask, TaskProgress
from ..profiles import validated_changes, apply_changes, business_response, major_change, lock_business
from ..research.models import RegulatoryRequirement
from ..research.service import profile_snapshot, fingerprint
from .models import FounderDecision, SavedRecommendation, RecommendationFeedback

MAJOR=('industry','business_model','city','state','legal_structure')
def preview(db,business,changes,origin='profile',planning_task=None,recommendation_id=None):
    changes={k:v for k,v in changes.items() if k!='confirm_changes'}
    validated=validated_changes(business,changes)
    before=profile_snapshot(business);after=validated.model_dump(mode='json')
    differences=[{'field':k,'before':before.get(k),'after':v} for k,v in after.items() if before.get(k)!=v]
    from ..catalog import business_task_definitions
    from ..accounts import Project
    from types import SimpleNamespace
    definitions=business_task_definitions(SimpleNamespace(**validated.model_dump()))
    project=db.get(Project,business.founder_id)
    if project and project.journey=='exploring' and not project.onboarded and origin!='launch':definitions=[]
    expected={t['stable_key'] for t in definitions}
    tasks=list(db.scalars(select(RoadmapTask).where(RoadmapTask.business_id==business.id,RoadmapTask.active.is_(True))))
    completed={t for t in db.scalars(select(TaskProgress.task_id).where(TaskProgress.completed.is_(True)))}
    details={'changes':changes,'differences':differences,'planning_task':planning_task,'recommendation_id':recommendation_id,
        'roadmap_changes':{'archived':[t.title for t in tasks if not t.stable_key.startswith(('regulatory:','advisor:')) and t.stable_key not in expected],
        'review_required':[t.title for t in tasks if t.stable_key in ('common:structure','common:formation','common:ein')] if any(d['field'] in MAJOR for d in differences) else [],
        'added':[t['title'] for t in definitions if t['stable_key'] not in {r.stable_key for r in tasks}],
        'preserved_completed':[t.title for t in tasks if t.id in completed],
        'regulatory_revalidation':len(list(db.scalars(select(RegulatoryRequirement.id).where(RegulatoryRequirement.business_id==business.id)))) if differences else 0},
        'requires_confirmation':origin!='profile' or major_change(business,validated)}
    row=FounderDecision(business_id=business.id,origin=origin,before_hash=fingerprint(before),data=details)
    db.add(row);db.commit()
    return decision_response(row)

def decision_response(row):return {'id':row.id,'origin':row.origin,'status':row.status,**row.data}

def confirm(db,business,row):
    lock_business(db,business)
    db.refresh(row)
    if row.status=='confirmed':return {'business':business_response(db,business),'decision':decision_response(row)}
    if row.status!='pending':raise HTTPException(409,'This decision is no longer pending.')
    if row.before_hash!=fingerprint(profile_snapshot(business)):raise HTTPException(409,'Your profile changed after this preview. Review a new decision before confirming.')
    result=db.execute(update(FounderDecision).where(FounderDecision.id==row.id,FounderDecision.status=='pending').values(status='confirmed'))
    if not result.rowcount:raise HTTPException(409,'This decision was already handled. Reload the profile.')
    apply_changes(db,business,validated_changes(business,row.data['changes']))
    plan=row.data.get('planning_task')
    plan_key='advisor:'+(row.data.get('recommendation_id') or row.id)
    if plan and not db.scalar(select(RoadmapTask.id).where(RoadmapTask.business_id==business.id,RoadmapTask.stable_key==plan_key)):
        db.add(RoadmapTask(business_id=business.id,stable_key=plan_key,title=plan['title'],position=900,active=True,
            guide={'goal':'Founder-confirmed planning action; assumptions require validation.','actions':plan['actions'],'prepare':['Record your assumptions and results.'],'proof':'You have reviewed the outcome and marked this task complete yourself.'}))
    if row.data.get('recommendation_id'):
        rec=db.get(SavedRecommendation,row.data['recommendation_id'])
        if rec.status!='accepted':
            rec.status='accepted';db.add(RecommendationFeedback(recommendation_id=rec.id,action='accept'))
    db.commit();db.refresh(row)
    return {'business':business_response(db,business),'decision':decision_response(row)}
