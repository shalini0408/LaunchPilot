"""Profile API and transactional roadmap reconciliation."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session
from .catalog import task_definitions
from .database import get_db
from .models import Business, BusinessModelSelection, Founder, RoadmapTask, TaskProgress, identifier, now
from .schemas import BusinessCreate, BusinessFields, BusinessPatch, BusinessRead, FounderRead, ProgressUpdate, TaskRead

router = APIRouter(prefix='/api')

def find_business(db, business_id):
    business = db.get(Business, business_id)
    if not business:
        raise HTTPException(404, 'Business profile not found')
    from .accounts import owns_founder
    owns_founder(db,business.founder_id)
    return business

def reconcile(db, business, industry=None, model=None):
    from .accounts import Project
    project=db.get(Project,business.founder_id)
    if project and project.journey=='exploring' and not project.onboarded:return
    industry = business.industry if industry is None else industry
    model = business.business_model if model is None else model
    tasks = {task.stable_key: task for task in db.scalars(select(RoadmapTask).where(RoadmapTask.business_id == business.id))}
    for task in tasks.values():
        if not task.stable_key.startswith(('regulatory:','advisor:')):
            task.active = False
    if industry and model:
        selection = db.scalar(select(BusinessModelSelection).where(
            BusinessModelSelection.business_id == business.id,
            BusinessModelSelection.industry == industry,
            BusinessModelSelection.business_model == model,
        ))
        if selection:
            selection.selected_at = now()
        else:
            db.add(BusinessModelSelection(business_id=business.id, industry=industry, business_model=model))
    from .catalog import business_task_definitions
    definitions=business_task_definitions(business,industry,model)
    if not definitions and (business.idea or business.industry or business.company_name):
        from .catalog import task_guide
        titles=[('common:structure','Choose business structure and name'),('planning:registration-review','Review whether business registration is needed'),('planning:compliance-review','Review legal and compliance requirements'),('planning:launch-review','Prepare launch operations')]
        definitions=[{'stable_key':key,'title':title,'guide':task_guide(title),'position':i} for i,(key,title) in enumerate(titles)]
    for definition in definitions:
        task = tasks.get(definition['stable_key'])
        if not task:
            task = RoadmapTask(business_id=business.id, **definition)
            db.add(task)
        else:
            for key, value in definition.items():
                if key=='guide' and task.guide.get('needs_revalidation'):
                    value={**value,'needs_revalidation':True,'review_reason':task.guide.get('review_reason','Review after a business decision.')}
                setattr(task, key, value)
        task.active = True
    db.flush()

def roadmap(db, business_id):
    from .accounts import Project
    project=db.scalar(select(Project).join(Business,Business.founder_id==Project.founder_id).where(Business.id==business_id))
    if project and project.journey=='exploring' and not project.onboarded:return []
    rows = db.execute(select(RoadmapTask, TaskProgress.completed).outerjoin(
        TaskProgress, TaskProgress.task_id == RoadmapTask.id,
    ).where(RoadmapTask.business_id == business_id, RoadmapTask.active.is_(True)).order_by(RoadmapTask.position))
    from .research.models import RegulatoryRequirement
    from .research.service import requirement_stale
    business = db.get(Business,business_id)
    requirements = {r.task_id:r for r in db.scalars(select(RegulatoryRequirement).where(RegulatoryRequirement.business_id==business_id))}
    return [TaskRead(id=t.id, stable_key=t.stable_key, title=t.title, guide=t.guide, position=t.position, completed=bool(done),
                     kind='regulatory' if t.stable_key.startswith('regulatory:') else 'planning',
                     requirement_id=requirements[t.id].id if t.id in requirements else None,
                     needs_revalidation=requirement_stale(db,requirements[t.id],business) if t.id in requirements else bool(t.guide.get('needs_revalidation'))) for t, done in rows]

def business_response(db, business):
    fields = {key: getattr(business, key) for key in BusinessFields.model_fields}
    from .accounts import Project
    project=db.get(Project,business.founder_id)
    return BusinessRead(id=business.id, founder_id=business.founder_id, **fields, roadmap=roadmap(db,business.id),journey=project.journey if project else '',launch_ready=project.onboarded if project else False,last_path=project.last_path if project else '')

def set_progress(db, task_id, completed):
    db.execute(insert(TaskProgress).values(id=identifier(), task_id=task_id, completed=completed, updated_at=now()).on_conflict_do_update(
        index_elements=['task_id'], set_={'completed': completed, 'updated_at': now()},
    ))

def import_legacy_progress(db, business, progress):
    # Legacy indices are interpreted against the original, shared catalog only.
    grouped = {}
    for key, completed in progress.items():
        parts = key.split(':')
        if len(parts) != 3 or not parts[2].isdigit():
            continue
        industry, model, raw_index = parts
        definitions = task_definitions(industry, model)
        index = int(raw_index)
        if index < len(definitions):
            grouped.setdefault((industry, model), []).append((definitions[index]['stable_key'], completed))
    for (industry, model), entries in grouped.items():
        reconcile(db, business, industry, model)
        tasks = {task.stable_key: task.id for task in db.scalars(select(RoadmapTask).where(RoadmapTask.business_id == business.id))}
        for key, completed in entries:
            # A shared completed task must not be erased by an unfinished copy.
            previous = db.scalar(select(TaskProgress.completed).where(TaskProgress.task_id == tasks[key]))
            set_progress(db, tasks[key], completed or bool(previous))
    reconcile(db, business)

@router.post('/founders/local', response_model=FounderRead)
def local_founder(db: Session = Depends(get_db)):
    from .accounts import Project
    account_id=db.info['account_id']
    existing=db.scalar(select(Project).where(Project.account_id==account_id,Project.active.is_(True)))
    if existing:return FounderRead(id=existing.founder_id,business_id=db.scalar(select(Business.id).where(Business.founder_id==existing.founder_id)))
    key='account:'+account_id
    db.execute(insert(Founder).values(id=identifier(),development_key=key,created_at=now()).on_conflict_do_nothing(index_elements=['development_key']))
    founder=db.scalar(select(Founder).where(Founder.development_key==key))
    db.execute(insert(Project).values(founder_id=founder.id,account_id=account_id,journey='',onboarded=False).on_conflict_do_nothing(index_elements=['founder_id']))
    db.commit()
    return FounderRead(id=founder.id,business_id=db.scalar(select(Business.id).where(Business.founder_id==founder.id)))

@router.get('/founders/{founder_id}', response_model=FounderRead)
def get_founder(founder_id: str, db: Session = Depends(get_db)):
    if not db.get(Founder, founder_id):
        raise HTTPException(404, 'Founder not found')
    return FounderRead(id=founder_id, business_id=db.scalar(select(Business.id).where(Business.founder_id == founder_id)))

@router.get('/founders/{founder_id}/business', response_model=BusinessRead)
def founder_business(founder_id: str, db: Session = Depends(get_db)):
    business = db.scalar(select(Business).where(Business.founder_id == founder_id))
    if not business:
        raise HTTPException(404, 'Business profile not found')
    return business_response(db, business)

@router.post('/founders/{founder_id}/business', response_model=BusinessRead)
def create_business(founder_id: str, data: BusinessCreate, db: Session = Depends(get_db)):
    if not db.get(Founder, founder_id):
        raise HTTPException(404, 'Founder not found')
    # Idempotent across tabs / React StrictMode, without overwriting an existing profile.
    business_id = identifier()
    result = db.execute(insert(Business).values(id=business_id, founder_id=founder_id, **data.model_dump(exclude={'legacy_progress'})).on_conflict_do_nothing(index_elements=['founder_id']))
    business = db.scalar(select(Business).where(Business.founder_id == founder_id))
    if result.rowcount:
        import_legacy_progress(db, business, data.legacy_progress)
    db.commit()
    return business_response(db, business)

@router.get('/businesses/{business_id}', response_model=BusinessRead)
def get_business(business_id: str, db: Session = Depends(get_db)):
    return business_response(db, find_business(db, business_id))

def lock_business(db,business):
    # Acquire the SQLite write lock before refreshing and merging profile values.
    db.execute(update(Business).where(Business.id==business.id).values(updated_at=Business.updated_at))
    db.refresh(business)

def validated_changes(business,changes):
    fields={key:getattr(business,key) for key in BusinessFields.model_fields}
    if 'details' in changes:
        details={**(business.details or {}),**changes['details']}
        if 'question_status' in changes['details']:
            details['question_status']={**(business.details or {}).get('question_status',{}),**changes['details']['question_status']}
        changes={**changes,'details':details}
    fields.update(changes)
    if 'industry' in changes and 'business_model' not in changes and fields['industry']!=business.industry:
        fields['business_model']=''
    try:return BusinessFields.model_validate(fields)
    except ValidationError as error:
        raise HTTPException(422,'; '.join(e['msg'] for e in error.errors())) from None

def major_change(business,validated):
    return any(getattr(business,key) not in ('',None) and getattr(business,key)!=getattr(validated,key) for key in ('industry','business_model','city','state','legal_structure')) or any((business.details or {}).get(key) not in ('',None) and (business.details or {}).get(key)!=getattr(validated.details,key) for key in ('founder_count','formation_status'))

def apply_changes(db,business,validated):
    from .research.service import invalidate
    review_needed=any(getattr(business,key) not in ('',None) and getattr(business,key)!=getattr(validated,key) for key in ('industry','business_model','city','state','legal_structure'))
    changed=any(getattr(business,key)!=value for key,value in validated.model_dump().items())
    if changed:invalidate(db,business)
    for key,value in validated.model_dump().items():setattr(business,key,value)
    if changed:
        reconcile(db,business)
        for task in db.scalars(select(RoadmapTask).where(RoadmapTask.business_id==business.id,RoadmapTask.active.is_(True))):
            if task.stable_key in ('common:structure','common:formation','common:ein'):
                note='Review the existing entity and records; do not file a new entity automatically.' if validated.details.formation_status=='formed' else f'Confirm the appropriate process for {business.legal_structure or "your undecided legal structure"} in {business.state or "your state"}.'
                task.guide={**task.guide,'actions':list(dict.fromkeys(task.guide['actions']+[note]))}
                if review_needed:task.guide={**task.guide,'needs_revalidation':True,'review_reason':'Review this step after your confirmed model, location or legal-structure change.'}
    from .accounts import Project
    project=db.get(Project,business.founder_id)
    db.flush()

@router.patch('/businesses/{business_id}', response_model=BusinessRead)
def update_business(business_id: str, data: BusinessPatch, db: Session = Depends(get_db)):
    business = find_business(db, business_id)
    lock_business(db,business)
    changes=data.model_dump(exclude_unset=True,exclude={'confirm_changes'})
    validated=validated_changes(business,changes)
    if major_change(business,validated) and not data.confirm_changes:
        raise HTTPException(409,'Review and confirm major profile changes before applying them. Use the decisions preview endpoint.')
    apply_changes(db,business,validated)
    db.commit()
    return business_response(db, business)

@router.get('/businesses/{business_id}/roadmap', response_model=list[TaskRead])
def get_roadmap(business_id: str, db: Session = Depends(get_db)):
    find_business(db, business_id)
    return roadmap(db, business_id)

@router.put('/businesses/{business_id}/tasks/{task_id}/progress', response_model=BusinessRead)
def update_progress(business_id: str, task_id: str, data: ProgressUpdate, db: Session = Depends(get_db)):
    business = find_business(db, business_id)
    task = db.get(RoadmapTask, task_id)
    if not task or task.business_id != business_id:
        raise HTTPException(404, 'Roadmap task not found for this business')
    if not task.active:
        raise HTTPException(409, 'This task is no longer in the current roadmap. Reload the business profile.')
    if data.completed and task.stable_key.startswith('regulatory:'):
        from .research.models import RegulatoryRequirement
        from .research.service import requirement_stale
        req = db.scalar(select(RegulatoryRequirement).where(RegulatoryRequirement.task_id==task.id))
        if not req or requirement_stale(db,req,business):
            raise HTTPException(409,'Refresh and verify this regulatory requirement before marking it complete.')
    if data.completed and not task.stable_key.startswith('regulatory:'):
        task.guide={**task.guide,'needs_revalidation':False}
    set_progress(db, task.id, data.completed)
    db.commit()
    return business_response(db, business)
