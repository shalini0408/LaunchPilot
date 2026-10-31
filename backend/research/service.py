"""A bounded in-process research worker with durable status and immutable source history."""
import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import json
import logging
import re
import httpx
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from ..catalog import INDUSTRIES
from ..models import Business, RoadmapTask, TaskProgress, now
from ..schemas import BusinessFields
from .config import ResearchError, Settings
from .extraction import extract
from .models import GovernmentSource, RegulatoryRequirement, ResearchRun
from .providers import search
from .retrieval import fetch_page
from .validation import registry, relevant, validate_url

logger = logging.getLogger(__name__)
def utc(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value

def profile_snapshot(business):
    return BusinessFields.model_validate({k:getattr(business,k) for k in BusinessFields.model_fields}).model_dump(mode='json')

def fingerprint(profile):
    # Canonical Pydantic money representation is stable across SQLite round-trips.
    if profile.get('budget') is not None:
        from decimal import Decimal
        profile = {**profile,'budget':format(Decimal(str(profile['budget'])),'.2f')}
    return hashlib.sha256(json.dumps(profile,sort_keys=True).encode()).hexdigest()

def is_stale(run, business):
    return run.profile_hash != fingerprint(profile_snapshot(business)) or not run.expires_at or utc(run.expires_at) <= now()

def invalidate(db, business):
    for req in db.scalars(select(RegulatoryRequirement).where(RegulatoryRequirement.business_id == business.id)):
        req.needs_revalidation = True

def requirement_stale(db, req, business):
    run = db.get(ResearchRun,req.run_id)
    return req.needs_revalidation or not run or run.status!='complete' or is_stale(run,business)

def requirement_response(db, req, business):
    stale = requirement_stale(db,req,business)
    sources = []
    ids = {e['source_id'] for key in ('evidence','fees','deadlines') for e in req.data.get(key,[])}
    for source in db.scalars(select(GovernmentSource).where(GovernmentSource.run_id == req.run_id)):
        if source.id in ids or source.url == req.data.get('application_url'):
            sources.append(source_response(source))
    return {**req.data,'id':req.id,'business_id':req.business_id,'task_id':req.task_id,'run_id':req.run_id,
            'applicability':'needs_verification' if stale else req.data['applicability'],
            'needs_revalidation':stale,'last_checked':utc(req.last_checked).isoformat(),'sources':sources}

def source_response(source):
    return {key:utc(value).isoformat() if isinstance(value,datetime) else value for key,value in {
        'id':source.id,'url':source.url,'title':source.title,'agency':source.agency,'jurisdiction':source.jurisdiction,
        'retrieved_at':source.retrieved_at,'published_date':source.published_date,'updated_date':source.updated_date,
    }.items()}

def queries(profile):
    industry = INDUSTRIES[profile['industry']]
    model = next((m['name'] for m in industry['models'] if m['id']==profile['business_model']), '')
    activity = f"{profile.get('details',{}).get('industry_label') or industry['name']} {profile.get('details',{}).get('operating_model_label') or model} {profile['legal_structure']} " + " ".join(profile.get("details",{}).get("activities",[]) + profile.get("details",{}).get("products",[]))
    activity = activity[:220]
    result = []
    for level in ('federal','state','county','local'):
        domains = [e['domain'] for e in registry() if e['level']==level and relevant(e,profile)]
        if domains:
            where = '' if level=='federal' else f" {profile['city']} {profile['state']}"
            subject = 'EIN business formation tax' if level=='federal' else 'licenses permits registration regulations'
            sites = ' OR '.join('site:'+d for d in domains[:8])
            result.append((f'{activity}{where} {subject} ({sites})',domains))
    return result

async def collect(profile, settings, stage):
    pages=[];warnings=[];urls=[]
    if not profile.get('business_model'):
        warnings.append('Business model is not selected. Research is preliminary; model-specific requirements need further verification.')
    if profile.get('details',{}).get('operating_location'):
        warnings.append('Agency research is scoped to the saved city and state. Other intended operating locations require separate verification.')
    levels = {e['level'] for e in registry() if relevant(e,profile)}
    if 'state' not in levels: warnings.append('No verified state agency registry coverage for this location. State obligations need further research.')
    if 'local' not in levels: warnings.append('No verified municipal agency registry coverage for this city. City obligations need agency confirmation.')
    if 'county' not in levels and profile.get('city','').strip().lower()!='san francisco': warnings.append('No verified county agency registry coverage for this city. County obligations need agency confirmation.')
    warnings.append('Research is bounded and may be incomplete. Retrieval and AI interpretation are not an agency determination or legal advice.')
    async with httpx.AsyncClient(timeout=settings.timeout, follow_redirects=False) as client:
        await stage('searching','Searching federal, state, county and municipal agencies.')
        for query,domains in queries(profile):
            try:
                for candidate in await search(client,query,domains,settings):
                    try:
                        canonical,_ = validate_url(candidate,profile)
                        if canonical not in urls: urls.append(canonical)
                    except ResearchError:
                        continue
            except ResearchError as error:
                warnings.append(str(error))
        await stage('retrieving','Retrieving and checking official government evidence.')
        # Round-robin agency levels so federal results cannot crowd out local results.
        ordered=[]
        buckets={level:[] for level in ('federal','state','county','local')}
        for url in urls:
            _,entry=validate_url(url,profile);buckets[entry['level']].append(url)
        while any(buckets.values()):
            for bucket in buckets.values():
                if bucket:ordered.append(bucket.pop(0))
        for url in ordered[:settings.max_sources * 2]:
            if len(pages)>=settings.max_sources:break
            try:
                page=await fetch_page(client,url,profile,settings)
                if not any(p['url']==page['url'] for p in pages):
                    # Source IDs are assigned before extraction and cannot be supplied by page text.
                    from ..models import identifier
                    pages.append({'id':identifier(),**page})
            except ResearchError as error:
                warnings.append(str(error))
        if not pages:
            raise ResearchError('No readable, jurisdiction-matched official sources were retrieved. Check agency coverage and try again; no compliance conclusion can be drawn.')
        await stage('extracting','Extracting requirements and validating supporting quotations.')
        requirements,notes=await extract(client,profile,pages,settings)
        warnings+=notes
        for req in requirements:
            url=req.get('application_url')
            if not url:continue
            known_links={p['url'] for p in pages} | {link for p in pages for link in p['links']}
            try:
                canonical,_=validate_url(url,profile)
                # An LLM-proposed URL must also occur in actually retrieved agency content.
                if url not in known_links and canonical not in known_links:raise ResearchError('Application URL was not linked by a retrieved agency page.')
                page=next((p for p in pages if p['url']==canonical),None)
                if page is None:
                    page=await fetch_page(client,canonical,profile,settings)
                    from ..models import identifier
                    page={'id':identifier(),**page};pages.append(page)
                req['application_url']=page['url']
            except ResearchError:
                req['application_url']=None
                req['applicability']='needs_verification'
                req['verification_notes'].append('An application link could not be independently retrieved and verified; use the source agency instructions.')
        return pages,requirements,list(dict.fromkeys(warnings))

def save_findings(db, run, pages, findings, warnings):
    business=db.get(Business,run.business_id)
    stale=run.profile_hash!=fingerprint(profile_snapshot(business))
    for page in pages:
        db.add(GovernmentSource(run_id=run.id,**page))
    db.flush()
    existing={r.stable_key:r for r in db.scalars(select(RegulatoryRequirement).where(RegulatoryRequirement.business_id==business.id))}
    for req in existing.values():
        req.needs_revalidation=True
    for index,data in enumerate(findings):
        stable=hashlib.sha256((data['agency']+'|'+data['jurisdiction']+'|'+re.sub(r'\W+',' ',data['name'].lower()).strip()).encode()).hexdigest()
        req=existing.get(stable)
        if not req:
            req=RegulatoryRequirement(business_id=business.id,run_id=run.id,stable_key=stable,data=data)
            db.add(req)
        req.data=data;req.run_id=run.id;req.last_checked=now();req.needs_revalidation=stale
        if data['applicability']!='not_applicable':
            task=db.get(RoadmapTask,req.task_id) if req.task_id else None
            guide={'goal':data['description'],'actions':data['steps'] or ['Confirm applicability and the process with the issuing agency.'],
                   'prepare':data['required_information'],'proof':'You have confirmed applicability with the agency and saved evidence of the required action. Research never marks this task complete.'}
            if not task:
                task=RoadmapTask(business_id=business.id,stable_key='regulatory:'+stable,title=data['name'],guide=guide,position=1000+index,active=True)
                db.add(task);db.flush();req.task_id=task.id
            else:
                task.title=data['name'];task.guide=guide;task.active=True;task.position=1000+index
        elif req.task_id:
            # Retain completed historical tasks; never erase their progress.
            task=db.get(RoadmapTask,req.task_id)
            task.active=bool(db.scalar(select(TaskProgress.completed).where(TaskProgress.task_id==task.id)))
    run.status='complete';run.stage='complete';run.message=f'Research finished: {len(findings)} evidence-backed findings. Confirm applicability with each agency.'
    run.warnings=warnings;run.completed_at=now();run.expires_at=now()+timedelta(hours=Settings.load().ttl_hours)
    db.commit()

async def run_research(run_id, engine):
    sessions=sessionmaker(bind=engine,expire_on_commit=False)
    async def stage(name,message):
        with sessions() as db:
            run=db.get(ResearchRun,run_id)
            run.status='running';run.stage=name;run.message=message;db.commit()
    try:
        with sessions() as db:
            run=db.get(ResearchRun,run_id);profile=run.profile
        settings=Settings.load();settings.validate()
        pages,findings,warnings=await asyncio.wait_for(collect(profile,settings,stage),timeout=180)
        with sessions() as db:
            save_findings(db,db.get(ResearchRun,run_id),pages,findings,warnings)
    except Exception as error:
        # Persist a bounded safe message; never return provider bodies, prompts or keys.
        logger.warning('Research failed (%s)',type(error).__name__)
        message=str(error) if isinstance(error,ResearchError) else 'Research could not finish. Refresh to retry; previous findings remain available.'
        with sessions() as db:
            run=db.get(ResearchRun,run_id)
            run.status='failed';run.stage='failed';run.message=message;run.completed_at=now();db.commit()

def recover_interrupted(db):
    for run in db.scalars(select(ResearchRun).where(ResearchRun.status.in_(['queued','running']))):
        run.status='failed';run.stage='failed';run.message='Research was interrupted by a server restart. Refresh to retry.';run.completed_at=now()
    db.commit()
