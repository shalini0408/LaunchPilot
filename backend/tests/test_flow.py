"""Exact single-business journeys, using real SQLite and mocked provider traffic."""
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from datetime import timedelta
import json
import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine,select,func,text
from sqlalchemy.orm import Session
from backend.main import app
from backend.accounts import Project
from backend.models import Business,Founder,RoadmapTask,TaskProgress,now

def account(email):
    c=TestClient(app);r=c.post('/api/auth/signup',json={'email':email,'password':'Test-password-6349!'});assert r.status_code==201,r.text
    return c

def profile(c,journey):
    p=c.post('/api/projects');assert p.status_code==201,p.text
    p=p.json();assert c.patch('/api/projects/'+p['founder_id'],json={'journey':journey}).status_code==200
    return p

def test_ready_software_virginia_roadmap_is_personalized_and_structure_optional():
    c=account('ready@example.com');p=profile(c,'known')
    r=c.post('/api/businesses/'+p['id']+'/launch',json={'confirmed':True,'changes':{'company_name':'Pocket App','idea':'A booking application','industry':'software','city':'Richmond','state':'Virginia','details':{'founder_count':2,'formation_status':'not_formed','activities':['booking software']},'ownership_details':'Two cofounders'}})
    assert r.status_code==200,r.text
    b=r.json();assert b['launch_ready'] and b['legal_structure']==''
    titles=[t['title'].lower() for t in b['roadmap']]
    assert any('privacy' in t for t in titles) and any('ein' in t for t in titles)
    assert any('registration' in t and 'if appropriate' in t for t in titles)
    assert not any('food' in t for t in titles)
    assert all('Virginia' in t['guide']['goal'] and 'Pocket App' in t['guide']['goal'] for t in b['roadmap'])
    structure=next(t for t in b['roadmap'] if t['stable_key']=='common:structure')
    assert any('2 founder' in a for a in structure['guide']['actions'])

def test_exploring_coffee_keeps_roadmap_empty_until_explicit_launch_and_resumes():
    c=account('coffee@example.com');p=profile(c,'exploring');bid=p['id']
    b=c.patch('/api/businesses/'+bid,json={'company_name':'Coffee Corner','idea':'A coffee shop','industry':'coffee','business_model':'mobile_cart','city':'Richmond','state':'Virginia','details':{'activities':['coffee service'],'target_customers':'Commuters'}}).json()
    assert not b['launch_ready'] and b['roadmap']==[]
    comparison=c.get('/api/businesses/'+bid+'/comparisons').json()
    assert {o['id'] for o in comparison['options']}=={'storefront','kiosk','mobile_cart'}
    assert c.get('/api/businesses/'+bid+'/roadmap').json()==[]
    r=c.post('/api/businesses/'+bid+'/launch',json={'confirmed':True});assert r.status_code==200,r.text
    b=r.json();assert b['launch_ready'] and any('mobile' in t['title'].lower() for t in b['roadmap'])
    task=b['roadmap'][0]
    c.put(f"/api/businesses/{bid}/tasks/{task['id']}/progress",json={'completed':True})
    assert c.patch('/api/businesses/'+bid+'/navigation',json={'path':'#task/'+task['id']}).status_code==200
    c.post('/api/auth/logout');assert c.post('/api/auth/signin',json={'email':'coffee@example.com','password':'Test-password-6349!'}).status_code==200
    loaded=c.get('/api/businesses/'+bid).json();assert loaded['last_path']=='#task/'+task['id'] and loaded['roadmap'][0]['completed']
    # Refining the idea does not create another business or discard launch history.
    assert c.post('/api/projects').status_code==409
    assert len(c.get('/api/projects').json())==1

def test_single_business_constraint_is_atomic(isolated_database):
    c=account('single@example.com')
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:c.post('/api/projects'),range(2)))
    assert sorted(r.status_code for r in results)==[201,409]
    engine=create_engine('sqlite:///'+str(isolated_database))
    with Session(engine) as db:assert db.scalar(select(func.count()).select_from(Business))==1
    engine.dispose()

def test_launch_needs_confirmed_activity_and_location_and_is_isolated():
    a=account('a@example.com');b=account('b@example.com');p=profile(a,'exploring')
    assert a.post('/api/businesses/'+p['id']+'/launch',json={'confirmed':True}).status_code==422
    assert b.post('/api/businesses/'+p['id']+'/launch',json={'confirmed':True}).status_code==404
    assert b.patch('/api/businesses/'+p['id']+'/navigation',json={'path':'#discover'}).status_code==404
    assert a.patch('/api/businesses/'+p['id']+'/navigation',json={'path':'#roadmap'}).status_code==409

def test_migration_archives_extra_businesses_without_deleting_rows(tmp_path):
    from backend.migrations import migrate
    engine=create_engine('sqlite:///'+str(tmp_path/'old.db'))
    with engine.begin() as db:
        db.exec_driver_sql('CREATE TABLE businesses (id TEXT PRIMARY KEY,founder_id TEXT, updated_at TEXT, details JSON)')
        db.exec_driver_sql('CREATE TABLE account_projects (founder_id TEXT PRIMARY KEY,account_id TEXT,journey TEXT,onboarded BOOLEAN)')
        db.exec_driver_sql("INSERT INTO businesses VALUES ('old','f1','2025-01-01','{}'),('recent','f2','2026-01-01','{}')")
        db.exec_driver_sql("INSERT INTO account_projects VALUES ('f1','owner','known',1),('f2','owner','exploring',0)")
    migrate(engine);migrate(engine)
    with engine.connect() as db:
        assert db.exec_driver_sql('SELECT COUNT(*) FROM businesses').scalar()==2
        assert db.exec_driver_sql('SELECT founder_id FROM account_projects WHERE active=1').scalar()=='f2'
        assert db.exec_driver_sql('SELECT COUNT(*) FROM account_projects').scalar()==2
    engine.dispose()

def test_archived_businesses_remain_stored_but_are_not_an_extra_active_profile(isolated_database):
    c=account('archive@example.com');p=profile(c,'known')
    engine=create_engine('sqlite:///'+str(isolated_database))
    with Session(engine) as db:
        owner=db.get(Project,p['founder_id']).account_id
        f=Founder(development_key='old-archived-founder');db.add(f);db.flush()
        b=Business(founder_id=f.id,company_name='Preserved old business');db.add(b);db.flush()
        db.add(Project(founder_id=f.id,account_id=owner,active=False,journey='known',onboarded=True));db.commit();archived_id=b.id
    assert c.get('/api/businesses/'+archived_id).status_code==404
    assert len(c.get('/api/projects').json())==1
    assert c.post('/api/projects').status_code==409
    with Session(engine) as db:assert db.get(Business,archived_id).company_name=='Preserved old business'
    engine.dispose()
