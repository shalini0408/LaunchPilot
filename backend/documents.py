"""Private project files; no file contents are submitted to AI services."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy import ForeignKey, String, LargeBinary, DateTime, select
from sqlalchemy.orm import Mapped, mapped_column, Session
from pydantic import BaseModel, Field
from .database import Base, get_db
from .models import RoadmapTask, now
from .profiles import find_business

class Document(Base):
    __tablename__='project_documents'
    id:Mapped[int]=mapped_column(primary_key=True,autoincrement=True)
    business_id:Mapped[str]=mapped_column(ForeignKey('businesses.id'),index=True)
    name:Mapped[str]=mapped_column(String(300))
    type:Mapped[str]=mapped_column(String(150))
    category:Mapped[str]=mapped_column(String(100))
    task_id:Mapped[str|None]=mapped_column(ForeignKey('roadmap_tasks.id'),nullable=True)
    contents:Mapped[bytes]=mapped_column(LargeBinary)
    created:Mapped[datetime]=mapped_column(DateTime(timezone=True),default=now)

router=APIRouter(prefix='/api/businesses/{business_id}/documents')
FORMATS={'pdf':('application/pdf',b'%PDF-'),'png':('image/png',b'\x89PNG\r\n\x1a\n'),'jpg':('image/jpeg',b'\xff\xd8\xff'),'jpeg':('image/jpeg',b'\xff\xd8\xff'),'webp':('image/webp',b'RIFF'),'doc':('application/msword',b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'),'docx':('application/vnd.openxmlformats-officedocument.wordprocessingml.document',b'PK\x03\x04'),'xlsx':('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',b'PK\x03\x04'),'txt':('text/plain',b''),'csv':('text/csv',b'')}

def validate_file(name,content,content_type):
    ext=name.rsplit('.',1)[-1].lower();fmt=FORMATS.get(ext)
    if not fmt or not content or len(content)>12*1024*1024:raise HTTPException(422,'Use a supported, nonempty document up to 12 MB.')
    mime,signature=fmt
    allowed={mime,'application/octet-stream','',None}
    if ext=='csv':allowed.update({'text/plain','application/vnd.ms-excel'})
    if content_type not in allowed:raise HTTPException(422,'File type does not match its extension.')
    if signature and not content.startswith(signature):raise HTTPException(422,'Document contents do not match the file type.')
    if ext=='webp' and content[8:12]!=b'WEBP':raise HTTPException(422,'Invalid WebP file.')
    if ext in ('txt','csv'):
        head=content[:512].strip().lower()
        if b'\x00' in head or head.startswith((b'<!doctype html',b'<html',b'<script',b'<svg')):raise HTTPException(422,'Unsupported text document contents.')
    return mime

def task_check(db,business_id,task_id):
    if task_id:
        t=db.get(RoadmapTask,task_id)
        if not t or t.business_id!=business_id:raise HTTPException(404,'Task not found for this project')

def metadata(db,d):
    t=db.get(RoadmapTask,d.task_id) if d.task_id else None
    return {'id':d.id,'businessId':d.business_id,'name':d.name,'type':d.type,'size':len(d.contents),'category':d.category,'created':d.created.isoformat(),'taskId':d.task_id,'taskTitle':t.title if t else None,'business':''}

def get_doc(db,business_id,document_id):
    find_business(db,business_id);d=db.get(Document,document_id)
    if not d or d.business_id!=business_id:raise HTTPException(404,'Document not found')
    return d

@router.get('')
def listing(business_id:str,db:Session=Depends(get_db)):
    find_business(db,business_id)
    return [metadata(db,d) for d in db.scalars(select(Document).where(Document.business_id==business_id).order_by(Document.id))]

@router.post('',status_code=201)
async def upload(business_id:str,file:UploadFile=File(...),category:str=Form('Business formation',max_length=100),task_id:str=Form('',max_length=36),db:Session=Depends(get_db)):
    find_business(db,business_id);task_check(db,business_id,task_id)
    contents=await file.read(12*1024*1024+1)
    name=(file.filename or 'document').replace('\\','/').rsplit('/',1)[-1][:300]
    mime=validate_file(name,contents,file.content_type)
    d=Document(business_id=business_id,name=name,type=mime,category=category,task_id=task_id or None,contents=contents)
    db.add(d);db.commit();return metadata(db,d)

@router.get('/{document_id}/content')
def content(business_id:str,document_id:int,db:Session=Depends(get_db)):
    d=get_doc(db,business_id,document_id)
    return Response(d.contents,media_type='application/octet-stream',headers={'Content-Disposition':'attachment','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'})

class Association(BaseModel):
    taskId:str=Field(default='',max_length=36)

@router.patch('/{document_id}')
def associate(business_id:str,document_id:int,data:Association,db:Session=Depends(get_db)):
    d=get_doc(db,business_id,document_id);task_check(db,business_id,data.taskId)
    d.task_id=data.taskId or None;db.commit();return metadata(db,d)

@router.delete('/{document_id}')
def remove(business_id:str,document_id:int,db:Session=Depends(get_db)):
    d=get_doc(db,business_id,document_id);db.delete(d);db.commit();return {'ok':True}

# Preserve the existing task worksheet feature without sharing drafts in browser storage.
class TaskDraft(Base):
    __tablename__='task_drafts'
    task_id:Mapped[str]=mapped_column(ForeignKey('roadmap_tasks.id'),primary_key=True)
    text:Mapped[str]=mapped_column(String(100000))

drafts=APIRouter(prefix='/api/businesses/{business_id}/tasks/{task_id}/draft')
class DraftInput(BaseModel):
    text:str=Field(max_length=100000)

def draft_task(db,business_id,task_id):
    find_business(db,business_id);task_check(db,business_id,task_id)

@drafts.get('')
def read_draft(business_id:str,task_id:str,db:Session=Depends(get_db)):
    draft_task(db,business_id,task_id);d=db.get(TaskDraft,task_id)
    return {'text':d.text if d else None}

@drafts.put('')
def save_draft(business_id:str,task_id:str,data:DraftInput,db:Session=Depends(get_db)):
    from sqlalchemy.dialects.sqlite import insert
    draft_task(db,business_id,task_id)
    db.execute(insert(TaskDraft).values(task_id=task_id,text=data.text).on_conflict_do_update(index_elements=['task_id'],set_={'text':data.text}));db.commit()
    return {'ok':True}
