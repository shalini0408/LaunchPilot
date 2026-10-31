import json
from concurrent.futures import ThreadPoolExecutor
import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, func
from sqlalchemy.orm import Session
from backend.main import app
from backend.models import Business, BusinessModelSelection, Founder, RoadmapTask, TaskProgress

@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    return TestClient(app)

def create(client, **overrides):
    founder = client.post('/api/founders/local').json()
    response = client.post(f"/api/founders/{founder['id']}/business", json={
        'company_name':'Brightside', 'industry':'bakery', 'business_model':'home',
        'city':'San Francisco', 'state':'California', **overrides,
    })
    assert response.status_code == 200, response.text
    return response.json()

def patch(client, business, **fields):
    response = client.patch(f"/api/businesses/{business['id']}", json={**fields,'confirm_changes':True})
    assert response.status_code == 200, response.text
    return response.json()

def task(business, key):
    return next(t for t in business['roadmap'] if t['stable_key'] == key)

def complete(client, business, current_task, value=True):
    response=client.put(f"/api/businesses/{business['id']}/tasks/{current_task['id']}/progress",json={'completed':value})
    assert response.status_code == 200, response.text
    return response.json()

def test_profile_updates_and_reload(client, isolated_database):
    b=create(client)
    b=patch(client,b,company_name='New name',budget='12345.67',ownership_details='Two owners, 60% / 40%',legal_structure='llc',city='Oakland')
    loaded=client.get(f"/api/founders/{b['founder_id']}/business").json()
    assert loaded==b
    assert loaded['budget']=='12345.67'
    assert loaded['legal_structure']=='llc'
    assert loaded['city']=='Oakland'
    # A completely new engine/session reads committed data from disk.
    engine=create_engine('sqlite:///'+str(isolated_database))
    with Session(engine) as session:
        saved=session.get(Business,b['id'])
        assert saved.company_name=='New name'
        assert saved.ownership_details=='Two owners, 60% / 40%'
    engine.dispose()
    cleared=patch(client,b,budget=None)
    assert cleared['budget'] is None

def test_progress_and_model_changes(client,isolated_database):
    b=create(client)
    shared=task(b,'common:structure')
    home_only=b['roadmap'][0]
    b=complete(client,b,shared)
    b=complete(client,b,home_only)
    b=patch(client,b,business_model='store')
    assert len(b['roadmap'])==8
    assert task(b,'common:structure')['completed']
    assert task(b,'common:structure')['id']==shared['id']
    assert all(not t['completed'] for t in b['roadmap'] if not t['stable_key'].startswith('common:'))
    stale=client.put(f"/api/businesses/{b['id']}/tasks/{home_only['id']}/progress",json={'completed':False})
    assert stale.status_code==409
    reloaded=client.get(f"/api/businesses/{b['id']}/roadmap").json()
    assert reloaded==b['roadmap']
    b=patch(client,b,business_model='home')
    assert next(t for t in b['roadmap'] if t['id']==home_only['id'])['completed']
    b=complete(client,b,shared,False)
    assert not task(b,'common:structure')['completed']
    engine=create_engine('sqlite:///'+str(isolated_database))
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(BusinessModelSelection))==2
        assert session.scalar(select(func.count()).select_from(TaskProgress))==2
    engine.dispose()

def test_industry_change_clears_incompatible_model_and_keeps_shared_tasks(client):
    b=create(client)
    complete(client,b,task(b,'common:ein'))
    b=patch(client,b,industry='software')
    assert b['business_model']=='' and any('privacy' in t['title'] for t in b['roadmap'])
    assert any(t['stable_key']=='common:structure' for t in b['roadmap'])
    b=patch(client,b,business_model='saas')
    assert task(b,'common:ein')['completed']

@pytest.mark.parametrize('fields',[
    {'industry':'x'*201},{'business_model':'saas'}, {'budget':-1},
    {'budget':'nan'}, {'budget':'1.234'}, {'legal_structure':'made_up'},
    {'company_name':'x'*301}, {'city':None}, {'unknown':'field'},
])
def test_invalid_updates_do_not_change_profile(client,fields):
    b=create(client)
    response=client.patch(f"/api/businesses/{b['id']}",json={**fields,'confirm_changes':True})
    assert response.status_code==422
    assert client.get(f"/api/businesses/{b['id']}").json()==b

def test_missing_records_and_progress_validation(client):
    assert client.get('/api/businesses/missing').status_code==404
    assert client.get('/api/founders/missing').status_code==404
    assert client.post('/api/founders/missing/business',json={}).status_code==404
    b=create(client)
    url=f"/api/businesses/{b['id']}/tasks/{b['roadmap'][0]['id']}/progress"
    assert client.put(url,json={'completed':'true'}).status_code==422
    assert client.put(f"/api/businesses/{b['id']}/tasks/missing/progress",json={'completed':True}).status_code==404

def test_bootstrap_and_create_are_idempotent(client,isolated_database):
    # Concurrent initialization is safe for two tabs and React StrictMode.
    with ThreadPoolExecutor(max_workers=2) as pool:
        founders=list(pool.map(lambda _:client.post('/api/founders/local').json(),range(2)))
    assert founders[0]==founders[1]
    founder=founders[0]['id']
    with ThreadPoolExecutor(max_workers=2) as pool:
        businesses=list(pool.map(lambda _:client.post(f'/api/founders/{founder}/business',json={'industry':'bakery','business_model':'home'}),range(2)))
    assert all(r.status_code==200 for r in businesses)
    assert businesses[0].json()['id']==businesses[1].json()['id']
    engine=create_engine('sqlite:///'+str(isolated_database))
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(Founder))==1
        assert session.scalar(select(func.count()).select_from(Business))==1
        assert session.scalar(select(func.count()).select_from(RoadmapTask))==8
    engine.dispose()

def test_legacy_import_once_including_archived_model(client):
    b=create(client,legacy_progress={'bakery:home:0':True,'bakery:home:2':True,'bakery:store:0':True,'bogus':True})
    assert b['roadmap'][0]['completed']
    assert task(b,'common:structure')['completed']
    b=patch(client,b,business_model='store')
    assert b['roadmap'][0]['completed']
    response=client.post(f"/api/founders/{b['founder_id']}/business",json={'company_name':'Overwrite attempt'})
    assert response.json()==b

def test_latest_saved_profile_and_task_override_stale_chat_payload(client,monkeypatch):
    b=create(client)
    current=b['roadmap'][0]
    b=patch(client,b,company_name='Updated company',budget='25000',ownership_details='One owner',legal_structure='llc')
    original=httpx.AsyncClient
    def handler(request):
        payload=json.loads(request.content)
        prompt=payload['messages'][0]['content']
        assert 'Updated company' in prompt and '25000.00' in prompt
        assert 'One owner' in prompt and 'llc' in prompt
        assert current['title'] in prompt
        assert 'Stale company' not in prompt and 'Wrong task' not in prompt
        return httpx.Response(200,json={'choices':[{'message':{'content':'Current advice'}}]})
    monkeypatch.setattr('backend.main.httpx.AsyncClient',lambda **kwargs:original(transport=httpx.MockTransport(handler),**kwargs))
    monkeypatch.setenv('OPENAI_API_KEY','test-only')
    response=client.post('/api/chat',json={'question':'Help','business_id':b['id'],'task_id':current['id'],'company_name':'Stale company','task':'Wrong task','task_guide':{'goal':'Stale'}})
    assert response.status_code==200 and response.json()['answer']=='Current advice'
    patch(client,b,business_model='store')
    old_home_task=b['roadmap'][0]
    assert client.post('/api/chat',json={'question':'Help','business_id':b['id'],'task_id':old_home_task['id']}).status_code==409
    assert client.post('/api/chat',json={'question':'Help','business_id':b['id']}).status_code==422

def test_database_failure_is_actionable(client,monkeypatch):
    from sqlalchemy.exc import OperationalError
    from backend.database import get_db
    def broken():
        raise OperationalError('sensitive query',{},Exception('disk failure'))
        yield
    app.dependency_overrides[get_db]=broken
    response=client.post('/api/founders/local')
    assert response.status_code==503
    assert 'Changes were not saved' in response.json()['detail']
    assert 'sensitive' not in response.text

@pytest.mark.parametrize('industry,model', [('bakery','home'),('bakery','store'),('software','saas'),('software','agency'),('ecommerce','own'),('ecommerce','marketplace')])
def test_all_catalog_roadmaps_are_persisted(client,industry,model):
    from backend.catalog import task_definitions
    b=create(client,industry=industry,business_model=model)
    expected=task_definitions(industry,model)
    assert len(b['roadmap'])==len(expected)
    assert any(t['stable_key']=='common:formation' and 'if appropriate' in t['title'] for t in b['roadmap'])
    assert all('Brightside' in t['guide']['goal'] and t['guide']['prepare'] for t in b['roadmap'])
    assert [t['position'] for t in b['roadmap']]==list(range(8))
    assert client.get(f"/api/businesses/{b['id']}/roadmap").json()==b['roadmap']

def test_empty_activity_edits_remain_missing_information(client):
    b=create(client)
    response=client.patch(f"/api/businesses/{b['id']}",json={'details':{'activities':[' ','bread','bread'],'products':['']}})
    assert response.status_code==200
    assert response.json()['details']['activities']==['bread']
    assert response.json()['details']['products']==[]
    bad=client.patch(f"/api/businesses/{b['id']}",json={'details':{'activities':['x'*501]}})
    assert bad.status_code==422


def test_free_form_industry_is_preserved(client):
    b=create(client,industry='Dental clinic',business_model='')
    assert b['industry']=='other'
    assert b['details']['industry_label']=='Dental clinic'
    b=patch(client,b,industry='Marine engineering',details={**b['details'],'operating_model_label':'On-site consulting'})
    loaded=client.get(f"/api/founders/{b['founder_id']}/business").json()
    assert loaded['details']['industry_label']=='Marine engineering'
    assert loaded['details']['operating_model_label']=='On-site consulting'

def test_planning_instructions_are_not_regulatory_claims():
    from backend.advisor.comparisons import has_regulatory_claim
    assert not has_regulatory_claim('This requires scheduling interviews with potential customers.')
    assert has_regulatory_claim('You must register your business before operating.')
    assert has_regulatory_claim('No permit is needed.')


def test_discovery_preserves_an_uncatalogued_industry_and_model(client):
    from types import SimpleNamespace
    from backend.advisor.discovery import extracted_changes
    from backend.advisor.schemas import ExtractedProfile
    b=create(client,industry='other',business_model='')
    extracted=ExtractedProfile(**{**dict.fromkeys(ExtractedProfile.model_fields),
        'industry':'Dental clinic','business_model':'mobile_dentistry'})
    changes=extracted_changes(SimpleNamespace(**b),extracted)
    assert changes['industry']=='other'
    assert changes['business_model']==''
    assert changes['details']['industry_label']=='Dental clinic'
    assert changes['details']['operating_model_label']=='mobile dentistry'
