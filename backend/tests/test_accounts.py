from datetime import timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine,select
from sqlalchemy.orm import Session
from backend.main import app
from backend.accounts import Account, AccountSession, Project
from backend.models import Founder,Business,now

PASSWORD='A-real-test-password-49!'
def signup(email='owner@example.com'):
    c=TestClient(app)
    r=c.post('/api/auth/signup',json={'email':email,'password':PASSWORD})
    assert r.status_code==201,r.text
    assert 'httponly' in r.headers['set-cookie'].lower() and 'samesite=lax' in r.headers['set-cookie'].lower()
    return c,r.json()
def project(c):
    r=c.post('/api/projects');assert r.status_code==201,r.text
    return r.json()

def test_public_and_protected_routes():
    c=TestClient(app)
    assert c.get('/api/health').status_code==200
    for method,path,body in [('GET','/api/projects',None),('POST','/api/founders/local',None),('GET','/api/businesses/anything',None),('POST','/api/chat',{'question':'Hello'})]:
        assert c.request(method,path,json=body).status_code==401

def test_credentials_validation_hash_cookie_and_logout(isolated_database):
    c,u=signup('OWNER@EXAMPLE.COM')
    assert u['email']=='owner@example.com'
    cookie=c.cookies.get('launchpilot_session');assert cookie
    assert c.get('/api/auth/me').json()==u
    engine=create_engine('sqlite:///'+str(isolated_database))
    with Session(engine) as db:
        account=db.get(Account,u['id'])
        assert account.password_hash.startswith('$argon2id$') and PASSWORD not in account.password_hash
    assert c.post('/api/auth/signup',json={'email':'owner@example.com','password':PASSWORD}).status_code==409
    assert c.post('/api/auth/logout').status_code==200
    c.cookies.set('launchpilot_session',cookie)
    assert c.get('/api/auth/me').status_code==401 # replayed signed cookie is revoked
    assert c.post('/api/auth/signin',json={'email':'owner@example.com','password':PASSWORD}).status_code==200
    assert c.post('/api/auth/signup',json={'email':'bad-email','password':'short'}).status_code==422
    engine.dispose()

def test_failed_signin_throttle_and_csrf():
    c,u=signup()
    for i in range(5):assert c.post('/api/auth/signin',json={'email':u['email'],'password':'Wrong-password-23'}).status_code==401
    assert c.post('/api/auth/signin',json={'email':u['email'],'password':PASSWORD}).status_code==429
    assert c.post('/api/auth/logout',headers={'Origin':'https://evil.example'}).status_code==403
    assert c.get('/api/auth/me').status_code==200

def test_expired_and_tampered_sessions(isolated_database):
    c,u=signup();engine=create_engine('sqlite:///'+str(isolated_database))
    with Session(engine) as db:
        s=db.scalar(select(AccountSession).where(AccountSession.account_id==u['id']));s.expires=now()-timedelta(seconds=1);db.commit()
    assert c.get('/api/projects').status_code==401
    c.cookies.clear();c.cookies.set('launchpilot_session','not-a-signed-cookie')
    assert c.get('/api/projects').status_code==401
    engine.dispose()

def test_both_journeys_and_returning_user():
    c,u=signup();p=project(c)
    assert not p['onboarded']
    assert c.patch('/api/projects/'+p['founder_id'],json={'journey':'known'}).status_code==200
    r=c.patch('/api/businesses/'+p['id'],json={'company_name':'Pocket App','industry':'software','idea':'A mobile booking app','city':'Richmond','state':'Virginia','details':{'formation_status':'not_formed','operating_location':'Online across Virginia','goals':'Company formation and compliance'}})
    assert r.status_code==200,r.text
    b=r.json();assert b['legal_structure']=='' and b['business_model']==''
    assert b['roadmap'] and any(t['stable_key']=='common:structure' for t in b['roadmap'])
    assert all('register an llc' not in t['title'].lower() for t in b['roadmap'])
    assert c.post('/api/businesses/'+p['id']+'/launch',json={'confirmed':True}).status_code==200
    assert c.post('/api/projects').status_code==409
    c.post('/api/auth/logout')
    assert c.post('/api/auth/signin',json={'email':u['email'],'password':PASSWORD}).status_code==200
    projects=c.get('/api/projects').json();assert len(projects)==1 and projects[0]['onboarded']
    assert c.get('/api/businesses/'+p['id']).json()['company_name']=='Pocket App'

def test_account_and_project_isolation_including_documents_research_chat(isolated_database):
    a,_=signup();b,_=signup('other@example.com');p=project(a);other=project(b);q=other
    assert a.post('/api/projects').status_code==409
    r=a.patch('/api/businesses/'+p['id'],json={'industry':'bakery','business_model':'home','company_name':'Private Bakery'})
    task=r.json()['roadmap'][0]
    assert a.put(f"/api/businesses/{p['id']}/tasks/{task['id']}/progress",json={'completed':True}).status_code==200
    doc=a.post('/api/businesses/'+p['id']+'/documents',files={'file':('private.txt',b'Private record','text/plain')},data={'task_id':task['id']}).json()
    assert doc['taskId']==task['id']
    assert len(a.get('/api/businesses/'+p['id']+'/documents').json())==1
    assert a.get('/api/businesses/'+q['id']+'/documents').status_code==404
    for suffix in ['', '/roadmap','/documents',f"/documents/{doc['id']}/content",'/requirements','/research/status','/research/sources','/advisor/conversation','/decisions','/discovery','/comparisons','/recommendations']:
        assert b.get('/api/businesses/'+p['id']+suffix).status_code==404,suffix
    assert b.get('/api/founders/'+p['founder_id']).status_code==404
    assert b.get('/api/founders/'+p['founder_id']+'/business').status_code==404
    assert b.patch('/api/projects/'+p['founder_id'],json={'journey':'known'}).status_code==404
    assert b.patch('/api/businesses/'+p['id'],json={'company_name':'Stolen'}).status_code==404
    assert b.post('/api/chat',json={'business_id':p['id'],'task_id':task['id'],'question':'Help'}).status_code==404
    assert b.post('/api/businesses/'+p['id']+'/research').status_code==404
    assert b.delete(f"/api/businesses/{p['id']}/documents/{doc['id']}").status_code==404
    # Even the same account cannot borrow files/tasks from a different project.
    assert a.get(f"/api/businesses/{q['id']}/documents/{doc['id']}/content").status_code==404
    assert a.patch(f"/api/businesses/{q['id']}/documents/{doc['id']}",json={'taskId':''}).status_code==404
    assert a.post(f"/api/businesses/{q['id']}/documents",files={'file':('record.txt',b'Record','text/plain')},data={'task_id':task['id']}).status_code==404
    assert a.get(f"/api/businesses/{p['id']}/documents/{doc['id']}/content").content==b'Private record'
    assert b.get('/api/projects').json()[0]['id']==other['id']
    assert a.put(f"/api/businesses/{p['id']}/tasks/{task['id']}/draft",json={'text':'Private draft'}).status_code==200
    assert a.get(f"/api/businesses/{p['id']}/tasks/{task['id']}/draft").json()['text']=='Private draft'
    assert b.get(f"/api/businesses/{p['id']}/tasks/{task['id']}/draft").status_code==404
    assert a.get(f"/api/businesses/{q['id']}/tasks/{task['id']}/draft").status_code==404
    from backend.research.models import ResearchRun
    engine=create_engine('sqlite:///'+str(isolated_database))
    with Session(engine) as db:
        run=ResearchRun(business_id=p['id'],profile_hash='test',profile={},status='failed',stage='failed');db.add(run);db.commit();run_id=run.id
    assert a.get('/api/research/'+run_id).status_code==200
    assert b.get('/api/research/'+run_id).status_code==404
    engine.dispose()



def test_legacy_records_are_preserved_without_auto_claim(isolated_database):
    engine=create_engine('sqlite:///'+str(isolated_database))
    with Session(engine) as db:
        f=Founder(development_key='local-development');db.add(f);db.flush();legacy=Business(founder_id=f.id,company_name='Existing private business');db.add(legacy);db.commit();bid=legacy.id
    c,_=signup();assert c.get('/api/projects').json()==[]
    assert c.get('/api/businesses/'+bid).status_code==404
    with Session(engine) as db:assert db.get(Business,bid).company_name=='Existing private business'
    engine.dispose()


def test_server_document_validation():
    c,_=signup();p=project(c);path='/api/businesses/'+p['id']+'/documents'
    for name,data,mime in [('bad.html',b'<script>bad</script>','text/html'),('fake.pdf',b'fake','application/pdf'),('empty.txt',b'','text/plain'),('large.txt',b'x'*(12*1024*1024+1),'text/plain'),('wrong.pdf',b'%PDF-1.7','text/html')]:
        assert c.post(path,files={'file':(name,data,mime)}).status_code==422
    good=c.post(path,files={'file':('real.pdf',b'%PDF-1.7 test','application/pdf')});assert good.status_code==201
    assert c.delete(path+'/'+str(good.json()['id'])).status_code==200
    assert c.get(path).json()==[]


def test_additive_migration_preserves_existing_profiles(tmp_path):
    from backend.database import Base
    from backend.migrations import migrate
    from sqlalchemy import text
    engine=create_engine('sqlite:///'+str(tmp_path/'migration.db'))
    with engine.begin() as db:
        db.execute(text("CREATE TABLE founders (id VARCHAR(36) PRIMARY KEY, development_key VARCHAR(80) UNIQUE, created_at DATETIME)"))
        db.execute(text("CREATE TABLE businesses (id VARCHAR(36) PRIMARY KEY, founder_id VARCHAR(36) UNIQUE, company_name VARCHAR(300))"))
        db.execute(text("INSERT INTO founders VALUES ('legacy-founder','local-development',CURRENT_TIMESTAMP)"))
        db.execute(text("INSERT INTO businesses VALUES ('legacy-business','legacy-founder','Preserved business')"))
    Base.metadata.create_all(engine);migrate(engine);migrate(engine)
    with engine.connect() as db:
        assert db.execute(text("SELECT company_name,details FROM businesses WHERE id='legacy-business'")).one()==('Preserved business','{}')
        assert 'account_projects' in __import__('sqlalchemy').inspect(engine).get_table_names()
    engine.dispose()

def test_operator_can_claim_legacy_without_rebuilding_history(isolated_database,monkeypatch):
    from sqlalchemy.orm import sessionmaker
    from backend.models import RoadmapTask,TaskProgress
    from backend import claim_legacy
    c,u=signup();other,v=signup('another-owner@example.com')
    engine=create_engine('sqlite:///'+str(isolated_database))
    with Session(engine) as db:
        f=Founder(development_key='local-development');db.add(f);db.flush()
        b=Business(founder_id=f.id,company_name='Preserved business');db.add(b);db.flush()
        t=RoadmapTask(business_id=b.id,stable_key='common:structure',title='Review structure',guide={'goal':'Review','actions':[],'prepare':[],'proof':'Reviewed'},position=0);db.add(t);db.flush();db.add(TaskProgress(task_id=t.id,completed=True));db.commit();bid=b.id;tid=t.id
    monkeypatch.setattr(claim_legacy,'SessionLocal',sessionmaker(engine))
    monkeypatch.setattr(claim_legacy,'init_db',lambda:None)
    monkeypatch.setattr('sys.argv',['claim_legacy',u['email']]);claim_legacy.main();claim_legacy.main()
    saved=c.get('/api/businesses/'+bid).json()
    assert saved['roadmap'][0]['id']==tid and saved['roadmap'][0]['completed']
    assert c.get('/api/projects').json()[0]['legacy']
    monkeypatch.setattr('sys.argv',['claim_legacy',v['email']])
    import pytest
    with pytest.raises(SystemExit):claim_legacy.main()
    assert other.get('/api/businesses/'+bid).status_code==404
    engine.dispose()

def test_exploring_onboarding_completes_when_business_context_is_saved():
    c,_=signup();p=project(c)
    c.patch('/api/projects/'+p['founder_id'],json={'journey':'exploring','onboarded':False})
    assert not c.get('/api/projects').json()[0]['onboarded']
    assert c.patch('/api/businesses/'+p['id'],json={'idea':'I want to explore a neighborhood coffee shop'}).status_code==200
    assert not c.get('/api/projects').json()[0]['onboarded']
    assert c.get('/api/businesses/'+p['id']).json()['roadmap']==[]
