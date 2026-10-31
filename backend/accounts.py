"""Account ownership, Argon2 passwords and revocable Starlette cookie sessions."""
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pwdlib import PasswordHash
from sqlalchemy import DateTime, ForeignKey, String, Boolean, Index, text, select, delete
from sqlalchemy.orm import Mapped, mapped_column, Session
from sqlalchemy.exc import IntegrityError
from .database import Base, get_db
from .models import Founder, Business, identifier, now

class Account(Base):
    __tablename__='accounts'
    id: Mapped[str]=mapped_column(String(36),primary_key=True,default=identifier)
    email: Mapped[str]=mapped_column(String(320),unique=True)
    password_hash: Mapped[str]=mapped_column(String(500))
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)

class AccountSession(Base):
    __tablename__='account_sessions'
    id: Mapped[str]=mapped_column(String(100),primary_key=True)
    account_id: Mapped[str]=mapped_column(ForeignKey('accounts.id',ondelete='CASCADE'),index=True)
    expires: Mapped[datetime]=mapped_column(DateTime(timezone=True))

class Project(Base):
    # Existing founder/business rows remain intact. Each project owns one founder slot.
    __tablename__='account_projects'
    __table_args__=(Index('one_active_business_per_account','account_id',unique=True,sqlite_where=text('active = 1')),)
    founder_id: Mapped[str]=mapped_column(ForeignKey('founders.id'),primary_key=True)
    account_id: Mapped[str]=mapped_column(ForeignKey('accounts.id',ondelete='CASCADE'),index=True)
    journey: Mapped[str]=mapped_column(String(20),default='')
    onboarded: Mapped[bool]=mapped_column(Boolean,default=False)
    active: Mapped[bool]=mapped_column(Boolean,default=True,server_default='1')
    last_path: Mapped[str]=mapped_column(String(200),default='',server_default='')

class LoginThrottle(Base):
    __tablename__='login_throttle'
    key: Mapped[str]=mapped_column(String(320),primary_key=True)
    failures: Mapped[int]=mapped_column(default=0)
    until: Mapped[datetime]=mapped_column(DateTime(timezone=True))

passwords=PasswordHash.recommended()
DUMMY_HASH=passwords.hash(secrets.token_urlsafe(32))
router=APIRouter(prefix='/api/auth')

def session_secret():
    value=os.getenv('SESSION_SECRET','').strip()
    if value:
        if len(value)<32: raise RuntimeError('SESSION_SECRET must contain at least 32 characters')
        return value
    if os.getenv('COOKIE_SECURE','false').lower()=='true':
        raise RuntimeError('Set SESSION_SECRET when COOKIE_SECURE is true')
    path=Path(__file__).with_name('.session-secret')
    try:
        with open(path,'x',opener=lambda p,f:os.open(p,f,0o600)) as f:f.write(secrets.token_urlsafe(48))
    except FileExistsError:pass
    return path.read_text().strip()

def current_account(request: Request,db: Session=Depends(get_db)):
    sid=request.session.get('sid')
    session=db.get(AccountSession,sid) if isinstance(sid,str) else None
    if not session or session.expires.replace(tzinfo=timezone.utc)<=now():
        raise HTTPException(401,'Please sign in to continue.')
    account=db.get(Account,session.account_id)
    if not account:raise HTTPException(401,'Please sign in to continue.')
    db.info['account_id']=account.id
    return account

def owns_founder(db,founder_id):
    project=db.get(Project,founder_id)
    if not project or not project.active or project.account_id!=db.info.get('account_id'):
        raise HTTPException(404,'Project not found')
    return project

def protect(request: Request,db: Session=Depends(get_db)):
    if request.url.path in {'/api/health','/api/auth/signup','/api/auth/signin','/api/auth/me','/api/auth/logout'}:return
    if not request.url.path.startswith('/api/'):return
    account=current_account(request,db)
    founder=request.path_params.get('founder_id')
    if founder:owns_founder(db,founder)
    return account

class Credentials(BaseModel):
    email: EmailStr
    password: str=Field(min_length=12,max_length=128)

def establish(request,db,account):
    db.execute(delete(AccountSession).where(AccountSession.expires<=now()))
    old=request.session.get('sid')
    if old:db.execute(delete(AccountSession).where(AccountSession.id==old))
    request.session.clear()
    sid=secrets.token_urlsafe(32)
    db.add(AccountSession(id=sid,account_id=account.id,expires=now()+timedelta(days=7)))
    db.commit()
    request.session['sid']=sid
    return {'id':account.id,'email':account.email}

@router.post('/signup',status_code=201)
def signup(data:Credentials,request:Request,db:Session=Depends(get_db)):
    account=Account(email=str(data.email).lower(),password_hash=passwords.hash(data.password))
    db.add(account)
    try:db.commit()
    except IntegrityError:
        db.rollback();raise HTTPException(409,'Unable to create this account. Try signing in or use another email.') from None
    return establish(request,db,account)

@router.post('/signin')
def signin(data:Credentials,request:Request,db:Session=Depends(get_db)):
    email=str(data.email).lower()
    limit=db.get(LoginThrottle,email)
    if limit and limit.failures>=5 and limit.until.replace(tzinfo=timezone.utc)>now():
        raise HTTPException(429,'Too many sign-in attempts. Please try again in 15 minutes.')
    account=db.scalar(select(Account).where(Account.email==email))
    valid=passwords.verify(data.password,account.password_hash if account else DUMMY_HASH)
    if not account or not valid:
        if not limit:limit=LoginThrottle(key=email,failures=0,until=now());db.add(limit)
        if limit.until.replace(tzinfo=timezone.utc)<=now():limit.failures=0
        limit.failures+=1;limit.until=now()+timedelta(minutes=15)
        db.commit();raise HTTPException(401,'Email or password is incorrect.')
    if limit:db.delete(limit)
    return establish(request,db,account)

@router.get('/me')
def me(account:Account=Depends(current_account)):
    return {'id':account.id,'email':account.email}

@router.post('/logout')
def logout(request:Request,db:Session=Depends(get_db)):
    sid=request.session.get('sid')
    if sid:db.execute(delete(AccountSession).where(AccountSession.id==sid));db.commit()
    request.session.clear()
    return {'ok':True}

projects=APIRouter(prefix='/api/projects')

def project_response(db,p):
    b=db.scalar(select(Business).where(Business.founder_id==p.founder_id))
    return {'founder_id':p.founder_id,'id':b.id if b else None,'name':b.company_name if b else '', 'journey':p.journey,'onboarded':p.onboarded,'legacy':db.get(Founder,p.founder_id).development_key=='local-development','last_path':p.last_path}

@projects.get('')
def list_projects(account:Account=Depends(current_account),db:Session=Depends(get_db)):
    return [project_response(db,p) for p in db.scalars(select(Project).where(Project.account_id==account.id,Project.active.is_(True)))]

@projects.post('',status_code=201)
def new_project(account:Account=Depends(current_account),db:Session=Depends(get_db)):
    from .profiles import reconcile
    if db.scalar(select(Project.founder_id).where(Project.account_id==account.id,Project.active.is_(True))):
        raise HTTPException(409,'Each account can have one business profile. Continue your existing business.')
    f=Founder(development_key='project:'+identifier());db.add(f);db.flush()
    b=Business(founder_id=f.id);db.add(b);db.flush();reconcile(db,b)
    p=Project(founder_id=f.id,account_id=account.id);db.add(p)
    try:db.commit()
    except IntegrityError:
        db.rollback();raise HTTPException(409,'Each account can have one business profile. Continue your existing business.') from None
    return project_response(db,p)

class JourneyUpdate(BaseModel):
    journey:Literal['known','exploring']
    onboarded:bool=False

@projects.patch('/{founder_id}')
def save_journey(founder_id:str,data:JourneyUpdate,db:Session=Depends(get_db)):
    p=owns_founder(db,founder_id)
    if data.onboarded and not p.onboarded:raise HTTPException(422,'Use Continue to Launch after confirming your business details.')
    p.journey=data.journey
    # Returning to exploration does not revoke an already generated roadmap.
    db.commit();return project_response(db,p)


flow_router=APIRouter(prefix='/api/businesses/{business_id}',tags=['Business journey'])
from .schemas import BusinessPatch
class LaunchInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    confirmed:Literal[True]
    changes:BusinessPatch|None=None

@flow_router.post('/launch')
def launch(business_id:str,data:LaunchInput,db:Session=Depends(get_db)):
    from .profiles import find_business,lock_business,validated_changes,apply_changes,business_response,reconcile
    from .advisor.decisions import preview,confirm
    business=find_business(db,business_id)
    changes=data.changes.model_dump(exclude_unset=True,exclude={'confirm_changes'}) if data.changes else {}
    validated=validated_changes(business,changes)
    if not validated.industry or not (validated.idea or validated.details.activities) or not validated.city or not validated.state:
        raise HTTPException(422,'Confirm your business activity, industry, operating city and state before continuing to launch.')
    # The launch action is explicit confirmation; reuse the existing decision audit and reconciliation.
    proposal=preview(db,business,changes,'launch')
    from .advisor.models import FounderDecision
    lock_business(db,business)
    project=owns_founder(db,business.founder_id)
    if not project.journey:project.journey='known'
    project.onboarded=True
    result=confirm(db,business,db.get(FounderDecision,proposal['id']))
    reconcile(db,business)
    db.commit()
    return business_response(db,business)

class ResumeInput(BaseModel):
    path:str=Field(max_length=200)

@flow_router.patch('/navigation')
def navigation(business_id:str,data:ResumeInput,db:Session=Depends(get_db)):
    from .profiles import find_business
    from .models import RoadmapTask
    import re
    business=find_business(db,business_id);project=owns_founder(db,business.founder_id)
    if data.path in ('#discover','#roadmap'):pass
    elif re.fullmatch(r'#task/[a-zA-Z0-9-]{1,36}',data.path):
        task=db.get(RoadmapTask,data.path.split('/')[-1])
        if not task or task.business_id!=business_id or not task.active:raise HTTPException(422,'Task is not in the current roadmap.')
    elif re.fullmatch(r'#documents(?:\?task=[a-zA-Z0-9-]{1,36})?',data.path):pass
    else:raise HTTPException(422,'Unsupported journey page.')
    if not project.onboarded and data.path!='#discover':raise HTTPException(409,'Continue to launch before opening your roadmap.')
    project.last_path=data.path;db.commit();return {'ok':True}
