from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import now
from ..profiles import find_business
from .config import ResearchError, Settings
from .models import GovernmentSource, RegulatoryRequirement, ResearchRun
from .service import fingerprint, is_stale, profile_snapshot, requirement_response, run_research, source_response, utc

router=APIRouter(prefix='/api',tags=['Government research'])

def run_response(run,business,cached=False):
    return {'id':run.id,'business_id':run.business_id,'status':run.status,'stage':run.stage,'message':run.message,
            'warnings':run.warnings,'started_at':utc(run.started_at),'completed_at':utc(run.completed_at),'expires_at':utc(run.expires_at),
            'stale':is_stale(run,business),'cached':cached}

def start(business_id,background,db,force=False):
    business=find_business(db,business_id)
    if not all((business.industry,business.city,business.state)) or not (business.business_model or business.idea or (business.details or {}).get('activities')):
        raise HTTPException(422,'Save your industry, activity or business model, city and state before researching regulations.')
    country=(business.details or {}).get('country','').strip().casefold()
    if country and country not in ('us','usa','united states','united states of america','u.s.','u.s.a.'):
        raise HTTPException(422,'Government research currently covers United States agencies only.')
    current=db.scalar(select(ResearchRun).where(ResearchRun.business_id==business_id,ResearchRun.status.in_(['queued','running'])))
    if current:return run_response(current,business)
    profile=profile_snapshot(business);key=fingerprint(profile)
    previous=db.scalar(select(ResearchRun).where(ResearchRun.business_id==business_id).order_by(ResearchRun.started_at.desc()))
    if not force:
        cached=previous if previous and previous.status=='complete' and previous.profile_hash==key else None
        if cached and not is_stale(cached,business):return run_response(cached,business,True)
    try:
        settings=Settings.load();settings.validate()
    except ResearchError as error:raise HTTPException(503,str(error)) from None
    if previous and (now()-utc(previous.started_at)).total_seconds()<settings.refresh_seconds:
        raise HTTPException(429,'Please wait before requesting another research refresh.',headers={'Retry-After':str(settings.refresh_seconds)})
    run=ResearchRun(business_id=business_id,profile_hash=key,profile=profile)
    db.add(run)
    try:db.commit()
    except IntegrityError:
        db.rollback()
        current=db.scalar(select(ResearchRun).where(ResearchRun.business_id==business_id,ResearchRun.status.in_(['queued','running'])))
        if current:return run_response(current,business)
        raise
    background.add_task(run_research,run.id,db.get_bind())
    return run_response(run,business)

@router.post('/businesses/{business_id}/research',status_code=202)
def start_research(business_id:str,background:BackgroundTasks,db:Session=Depends(get_db)):
    return start(business_id,background,db)

@router.post('/businesses/{business_id}/research/refresh',status_code=202)
def refresh(business_id:str,background:BackgroundTasks,db:Session=Depends(get_db)):
    return start(business_id,background,db,True)

@router.get('/businesses/{business_id}/research/status')
def status(business_id:str,db:Session=Depends(get_db)):
    business=find_business(db,business_id)
    run=db.scalar(select(ResearchRun).where(ResearchRun.business_id==business_id).order_by(ResearchRun.started_at.desc()))
    return run_response(run,business) if run else {'status':'not_started','stage':'not_started','message':'No live research has been run for this business.','stale':False,'warnings':[]}

@router.get('/research/{run_id}')
def run_status(run_id:str,db:Session=Depends(get_db)):
    run=db.get(ResearchRun,run_id)
    if not run:raise HTTPException(404,'Research run not found')
    return run_response(run,find_business(db,run.business_id))

@router.get('/businesses/{business_id}/requirements')
def requirements(business_id:str,db:Session=Depends(get_db)):
    business=find_business(db,business_id)
    rows=db.scalars(select(RegulatoryRequirement).where(RegulatoryRequirement.business_id==business_id).order_by(RegulatoryRequirement.last_checked.desc()))
    return [requirement_response(db,req,business) for req in rows]

@router.get('/businesses/{business_id}/research/sources')
def sources(business_id:str,db:Session=Depends(get_db)):
    find_business(db,business_id)
    run=db.scalar(select(ResearchRun).where(ResearchRun.business_id==business_id,ResearchRun.status=='complete').order_by(ResearchRun.started_at.desc()))
    if not run:return []
    return [source_response(s) for s in db.scalars(select(GovernmentSource).where(GovernmentSource.run_id==run.id))]

@router.get('/businesses/{business_id}/requirements/{requirement_id}')
def requirement(business_id:str,requirement_id:str,db:Session=Depends(get_db)):
    business=find_business(db,business_id)
    req=db.get(RegulatoryRequirement,requirement_id)
    if not req or req.business_id!=business_id:raise HTTPException(404,'Requirement not found for this business')
    return requirement_response(db,req,business)
