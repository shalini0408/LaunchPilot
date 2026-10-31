import json
from copy import deepcopy
import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session
from backend.main import app
from backend.advisor.models import SavedRecommendation, DiscoveryConversation, FounderDecision, RecommendationFeedback
from backend.advisor.schemas import ExtractedProfile
from backend.migrations import migrate
from backend.research.models import RegulatoryRequirement
from backend.models import RoadmapTask, TaskProgress

@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY',raising=False)
    monkeypatch.delenv('BRAVE_SEARCH_API_KEY',raising=False)
    monkeypatch.delenv('TAVILY_API_KEY',raising=False)
    monkeypatch.setenv('SEARCH_PROVIDER','brave')
    return TestClient(app)

def create(client,**fields):
    founder=client.post('/api/founders/local').json()['id']
    response=client.post(f'/api/founders/{founder}/business',json=fields)
    assert response.status_code==200,response.text
    return response.json()

def get(client,b):return client.get(f"/api/businesses/{b['id']}").json()
def proposal(client,b,changes,origin='discovery'):
    response=client.post(f"/api/businesses/{b['id']}/decisions",json={'changes':changes,'origin':origin})
    assert response.status_code==200,response.text
    return response.json()
def confirm(client,b,d):
    response=client.post(f"/api/businesses/{b['id']}/decisions/{d['id']}/confirm",json={'confirmed':True})
    assert response.status_code==200,response.text
    return response.json()['business']
def nullable(**fields):return {**{k:None for k in ExtractedProfile.model_fields},**fields}

@pytest.fixture
def llm(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','fake-advisor-key');monkeypatch.setenv('ADVISOR_RETRIES','0')
    monkeypatch.setenv('RESEARCH_REFRESH_MIN_SECONDS','0')
    calls=[];settings={'profile':nullable(),'invalid':False,'bad_citation':False,'unsupported_cost':False,'legal_without_evidence':False}
    original=httpx.AsyncClient
    def handler(request):
        assert request.url.host=='api.openai.com'
        payload=json.loads(request.content);calls.append(payload)
        name=payload['response_format']['json_schema']['name'];context=json.loads(payload['messages'][1]['content'])
        if settings['invalid']:return httpx.Response(200,json={'choices':[{'message':{'content':'invalid JSON'}}]})
        if name=='business_discovery':result={'profile':settings['profile'],'explanation':'Review these extracted facts before saving.','unanswered_questions':['Additional details are needed.']}
        elif name=='business_comparison':
            result={'options':[{'id':o['id'],'name':o['name'],'startup_costs':'Compare fixed commitments and validate quotes.','operational_complexity':o['description'],'customer_acquisition':'Test your customer channel.','scalability':'Compare capacity to your growth goals.','location_requirements':'Check the actual address.','regulatory_considerations':'Verify current rules with the agency.','risks':['Unverified assumptions'],'advantages':['Explore fit with confirmed goals'],'disadvantages':['Needs validation'],'fit':f"For {context['profile']['company_name']} with budget {context['profile']['budget']} and goals {context['profile']['details']['goals']}",'assumptions':['Qualitative planning'],'missing_information':['Actual operating costs'],'evidence':[]} for o in context['allowed_options']], 'explanation':'No universally best option; obtain professional advice.'}
        elif name=='business_recommendations':
            result={'recommendations':[{'category':'next_actions','title':'Validate the offer','action':'Interview potential customers.','explanation':'Validate before committing resources.','fit':f"For your confirmed activities: {context['profile']['details']['activities']}",'advantages':['Learn from customers'],'tradeoffs':['Takes time'],'assumptions':['Demand is unverified'],'missing_information':['Interview results'],'evidence':[],'proposed_changes':None,'planning_task':{'title':'Interview potential customers','actions':['Write interview questions','Record feedback']}}]}
            if settings['unsupported_cost']:result['recommendations'][0]['action']='You can start for $1234.'
        elif name=='contextual_advisor':
            if settings['legal_without_evidence']:paragraph={'text':'You must pay a filing fee tomorrow.','basis':'regulatory','evidence':[]}
            elif context.get('regulatory_evidence'):
                evidence=context['regulatory_evidence'][0]['evidence'][0]
                paragraph={'text':'Review the cited government requirement and confirm applicability.','basis':'regulatory','evidence':[{'source_id':'invented' if settings['bad_citation'] else evidence['source_id'],'excerpt':evidence['excerpt']}]}
            else:paragraph={'text':f"Compare a smaller validation experiment against your goals: {context['profile']['details']['goals']}. Affordability is not established.",'basis':'planning_assumption','evidence':[]}
            result={'paragraphs':[paragraph]}
        else:raise AssertionError(name)
        return httpx.Response(200,json={'choices':[{'message':{'content':json.dumps(result)}}]})
    monkeypatch.setattr('backend.advisor.llm.httpx.AsyncClient',lambda **kwargs:original(transport=httpx.MockTransport(handler),**kwargs))
    return calls,settings

@pytest.mark.parametrize('message,extracted,expected',[
    ('I want a bakery in San Francisco with $40,000.',nullable(industry='bakery',city='San Francisco',state='California',budget='40000',activities=['baking']),{'industry':'bakery','business_model':'','budget':'40000.00'}),
    ('I am building a SaaS startup in Virginia and expect outside investment.',nullable(industry='software',business_model='saas',state='Virginia',activities=['subscription software'],investment_plans='yes'),{'industry':'software','business_model':'saas','state':'Virginia'}),
    ('I already own an LLC and only want compliance help.',nullable(legal_structure='llc',formation_status='formed'),{'legal_structure':'llc'}),
    ('I want to sell handmade skincare online.',nullable(industry='ecommerce',activities=['cosmetics manufacturing'],products=['handmade skincare'],industry_label='Skincare'),{'industry':'ecommerce'}),
])
def test_discovery_scenarios_require_confirmation(client,llm,message,extracted,expected):
    calls,options=llm;options['profile']=extracted;b=create(client)
    result=client.post(f"/api/businesses/{b['id']}/discovery/messages",json={'message':message})
    assert result.status_code==200,result.text
    data=result.json();assert len(data['questions'])<=2
    assert get(client,b)['industry']=='' and get(client,b)['legal_structure']==''
    saved=confirm(client,b,data['proposal'])
    for key,value in expected.items():assert saved[key]==value
    if extracted['formation_status']:
        assert saved['details']['formation_status']=='formed'
        assert saved['details']['existing_legal_structure']=='llc'
    assert 'UNTRUSTED' in calls[0]['messages'][0]['content'].upper()
    history=client.get(f"/api/businesses/{b['id']}/discovery").json()['conversation']
    assert history['messages'][0]['content']==message

def test_extraction_does_not_overwrite_existing_facts_or_accept_invalid_models(client,llm):
    _,options=llm;b=create(client,company_name='Existing',industry='bakery',business_model='home',budget='40000')
    options['profile']=nullable(company_name='Replacement',industry='software',business_model='saas')
    result=client.post(f"/api/businesses/{b['id']}/discovery/messages",json={'message':'Consider a SaaS alternative.'}).json()
    assert get(client,b)['company_name']=='Existing'
    assert any(d['field']=='company_name' for d in result['proposal']['differences'])
    client.post(f"/api/businesses/{b['id']}/decisions/{result['proposal']['id']}/dismiss")
    assert get(client,b)['company_name']=='Existing'
    options['profile']=nullable(industry='bakery',business_model='saas')
    assert client.post(f"/api/businesses/{b['id']}/discovery/messages",json={'message':'Bad model'}).status_code==422
    assert get(client,b)['business_model']=='home'

def test_followups_are_limited_industry_specific_and_skip_is_persisted(client):
    b=create(client,industry='software')
    initial=client.get(f"/api/businesses/{b['id']}/discovery").json()
    assert len(initial['questions'])==2 and 'software' in initial['questions'][0]['text']
    field=initial['questions'][0]['field']
    response=client.post(f"/api/businesses/{b['id']}/discovery/answers",json={'field':field,'action':'skip'}).json()
    assert get(client,b)['details']['question_status']=={}
    b=confirm(client,b,response['proposal'])
    assert b['details']['question_status'][field]=='skipped'
    after=client.get(f"/api/businesses/{b['id']}/discovery").json()
    assert field not in [q['field'] for q in after['questions']]
    response=client.post(f"/api/businesses/{b['id']}/discovery/answers",json={'field':'city','action':'undecided'}).json()
    confirm(client,b,response['proposal'])
    assert 'city' not in [q['field'] for q in client.get(f"/api/businesses/{b['id']}/discovery").json()['questions']]
    assert client.post(f"/api/businesses/{b['id']}/discovery/answers",json={'field':'unknown','action':'skip'}).status_code==422

def test_essential_questions_for_skip_discovery(client):
    b=create(client,legal_structure='llc',details={'formation_status':'formed'})
    questions=client.get(f"/api/businesses/{b['id']}/discovery?essential=true").json()['questions']
    assert len(questions)<=2 and all(q['field'] in ('industry','activities','city','state','country','business_model') for q in questions)
    assert all(q['field'] not in ('formation_status','legal_structure') for q in questions)

@pytest.mark.parametrize('industry,model', [('bakery','home'),('software','saas'),('ecommerce','own'),('other','service')])
def test_model_comparisons_and_structure_questions(client,llm,industry,model):
    b=create(client,industry=industry,business_model=model,details={'founder_count':2,'investment_plans':'yes','goals':'Grow sustainably'})
    result=client.post(f"/api/businesses/{b['id']}/comparisons",json={'kind':'models'})
    assert result.status_code==200,result.text
    assert len(result.json()['options'])>=2
    assert all(o['assumptions'] and 'not verified' in o['regulatory_considerations'] for o in result.json()['options'])
    structure=client.post(f"/api/businesses/{b['id']}/comparisons",json={'kind':'structures'}).json()
    assert {o['id'] for o in structure['options']}=={'sole_proprietorship','llc','corporation','partnership'}
    assert all(q['field'] not in ('founder_count','investment_plans') for q in structure['questions'])
    assert get(client,b)['legal_structure']==''
    selected=confirm(client,b,proposal(client,b,{'legal_structure':'corporation'},'structure'))
    assert selected['legal_structure']=='corporation' and any(t['stable_key']=='common:formation' for t in selected['roadmap'])
    cached=client.get(f"/api/businesses/{b['id']}/comparisons?kind=models").json()
    assert cached['options']

def test_major_changes_require_confirmation_and_stale_previews_cannot_apply(client):
    b=create(client,industry='bakery',business_model='store',city='San Francisco',state='California')
    structure=next(t for t in b['roadmap'] if t['stable_key']=='common:structure')
    client.put(f"/api/businesses/{b['id']}/tasks/{structure['id']}/progress",json={'completed':True})
    assert client.patch(f"/api/businesses/{b['id']}",json={'business_model':'home'}).status_code==409
    d=proposal(client,b,{'business_model':'home'},'comparison')
    assert d['roadmap_changes']['archived'] and structure['title'] in d['roadmap_changes']['preserved_completed']
    assert client.post(f"/api/businesses/{b['id']}/decisions/{d['id']}/confirm",json={'confirmed':False}).status_code==422
    updated=confirm(client,b,d)
    assert updated['business_model']=='home' and next(t for t in updated['roadmap'] if t['id']==structure['id'])['completed']
    assert confirm(client,b,d)['business_model']=='home'
    stale=proposal(client,b,{'city':'Oakland'})
    client.patch(f"/api/businesses/{b['id']}",json={'company_name':'Changed independently'})
    assert client.post(f"/api/businesses/{b['id']}/decisions/{stale['id']}/confirm",json={'confirmed':True}).status_code==409

def test_recommendations_and_feedback_are_persistent_and_confirmed(client,llm,isolated_database):
    b=create(client,industry='bakery',business_model='home',details={'activities':['baking']})
    rows=client.post(f"/api/businesses/{b['id']}/recommendations").json();r=rows[0]
    assert r['assumptions'] and r['fit'] and r['tradeoffs']
    url=f"/api/businesses/{b['id']}/recommendations/{r['id']}/feedback"
    assert client.post(url,json={'action':'save'}).json()['status']=='saved'
    d=client.post(url,json={'action':'accept'}).json()['proposal']
    assert not any(t['stable_key'].startswith('advisor:') for t in get(client,b)['roadmap'])
    confirmed=confirm(client,b,d)
    added=[t for t in confirmed['roadmap'] if t['stable_key'].startswith('advisor:')]
    assert len(added)==1 and not added[0]['completed']
    assert client.post(url,json={'action':'accept'}).json()['status']=='accepted'
    again=client.get(f"/api/businesses/{b['id']}/recommendations").json()[0]
    assert again['status']=='accepted'
    assert client.post(url,json={'action':'dismiss'}).json()['status']=='dismissed'
    engine=create_engine('sqlite:///'+str(isolated_database))
    with Session(engine) as db:assert db.scalar(select(RecommendationFeedback)) is not None
    engine.dispose()

def test_insufficient_information_and_bad_ai_responses_do_not_mutate_profile(client,llm):
    calls,options=llm;b=create(client)
    rows=client.post(f"/api/businesses/{b['id']}/recommendations").json()
    assert rows[0]['category']=='questions' and not calls
    options['invalid']=True
    assert client.post(f"/api/businesses/{b['id']}/discovery/messages",json={'message':'Help with my idea'}).status_code==502
    assert get(client,b)['industry']==''
    assert client.post(f"/api/businesses/{b['id']}/comparisons",json={'kind':'models'}).status_code==422

def test_unsupported_precise_costs_are_rejected(client,llm):
    _,options=llm;options['unsupported_cost']=True
    b=create(client,industry='software',business_model='saas',budget='20000',details={'activities':['software']})
    assert client.post(f"/api/businesses/{b['id']}/recommendations").status_code==502
    assert client.get(f"/api/businesses/{b['id']}/recommendations").json()==[]

def test_advisor_context_and_conversation_survive_reload(client,llm,isolated_database):
    calls,_=llm;b=create(client,industry='software',business_model='saas',budget='20000',state='Virginia',details={'goals':'Seek investment','activities':['subscription software']})
    rec=client.post(f"/api/businesses/{b['id']}/recommendations").json()[0]
    client.post(f"/api/businesses/{b['id']}/recommendations/{rec['id']}/feedback",json={'action':'save'})
    task=b['roadmap'][0];client.put(f"/api/businesses/{b['id']}/tasks/{task['id']}/progress",json={'completed':True})
    url=f"/api/businesses/{b['id']}/advisor/chat"
    result=client.post(url,json={'question':'Can I start with my budget?','task_id':task['id'],'research':False})
    assert result.status_code==200,result.text
    context=json.loads(calls[-1]['messages'][1]['content'])
    assert context['profile']['budget']=='20000.00' and context['profile']['state']=='Virginia'
    assert context['completed_tasks'] and context['saved_recommendations']
    for i in range(7):assert client.post(url,json={'question':f'Continue discussion {i}','task_id':task['id'],'research':False}).status_code==200
    stored=client.get(f"/api/businesses/{b['id']}/advisor/conversation?scope=task:{task['id']}").json()
    assert stored['total_messages']==16 and stored['summary']
    assert len(json.loads(calls[-1]['messages'][1]['content'])['conversation']['recent_messages'])<=12
    with Session(create_engine('sqlite:///'+str(isolated_database))) as db:
        row=db.scalar(select(DiscoveryConversation).where(DiscoveryConversation.scope=='task:'+task['id']))
        assert len(row.messages)==16

def test_regulatory_advisor_explains_unavailable_research_and_rejects_unsupported_claim(client,llm):
    _,options=llm;options['legal_without_evidence']=True
    b=create(client,industry='bakery',business_model='home',city='San Francisco',state='California')
    response=client.post(f"/api/businesses/{b['id']}/advisor/chat",json={'question':'What permits are required?'})
    assert response.status_code==200,response.text
    assert 'cannot verify' in response.json()['answer'] and 'BRAVE_SEARCH_API_KEY' in response.json()['answer']
    assert not response.json()['citations']

def test_no_key_has_guided_comparisons_and_clear_discovery_error(client):
    b=create(client,industry='software')
    assert client.get(f"/api/businesses/{b['id']}/comparisons?kind=models").json()['mode']=='guided'
    assert client.post(f"/api/businesses/{b['id']}/comparisons",json={'kind':'structures'}).json()['mode']=='guided'
    assert client.post(f"/api/businesses/{b['id']}/discovery/messages",json={'message':'A SaaS company'}).status_code==503
    assert client.post(f"/api/businesses/{b['id']}/advisor/chat",json={'question':'Help with my next step'}).status_code==503

def test_additive_migration_preserves_existing_rows(tmp_path):
    engine=create_engine('sqlite:///'+str(tmp_path/'old.db'))
    with engine.begin() as db:
        db.execute(text('CREATE TABLE businesses (id TEXT PRIMARY KEY, company_name TEXT)'))
        db.execute(text("INSERT INTO businesses VALUES ('existing','Existing business')"))
    migrate(engine);migrate(engine)
    with engine.connect() as db:
        row=db.execute(text('SELECT company_name,details FROM businesses')).one()
        assert row==('Existing business','{}')
    engine.dispose()

@pytest.mark.parametrize('bad',[False,True])
def test_existing_government_evidence_is_used_by_contextual_advisor(client,llm,isolated_database,bad):
    from datetime import timedelta
    from backend.models import Business
    from backend.research.models import ResearchRun, GovernmentSource
    from backend.research.service import fingerprint, profile_snapshot
    calls,options=llm;options['bad_citation']=bad
    b=create(client,industry='bakery',business_model='home',city='San Francisco',state='California')
    engine=create_engine('sqlite:///'+str(isolated_database))
    quote='Businesses must register with the issuing agency before opening.'
    with Session(engine) as db:
        business=db.get(Business,b['id'])
        run=ResearchRun(business_id=b['id'],profile=profile_snapshot(business),profile_hash=fingerprint(profile_snapshot(business)),status='complete',stage='complete',expires_at=__import__('backend.models',fromlist=['now']).now()+timedelta(hours=24))
        db.add(run);db.flush()
        source=GovernmentSource(run_id=run.id,url='https://sf.gov/food',title='Official agency instructions',agency='San Francisco government',jurisdiction='San Francisco',text=quote,links=[])
        db.add(source);db.flush()
        db.add(RegulatoryRequirement(business_id=b['id'],run_id=run.id,stable_key='test-evidence',data={'name':'Food registration','agency':source.agency,'jurisdiction':'San Francisco','description':'Review registration.','business_activity':'bakery','applicability':'needs_verification','reason':'Confirm products.','source_url':source.url,'application_url':None,'required_information':[],'steps':[],'fees':[],'deadlines':[],'evidence':[{'source_id':source.id,'url':source.url,'excerpt':quote}],'verification_notes':['Confirm products.'],'missing_information':['Products'],'conflicts':[]}))
        db.commit()
    response=client.post(f"/api/businesses/{b['id']}/advisor/chat",json={'question':'What does this rule say?','research':False})
    assert response.status_code==200,response.text
    if bad:assert not response.json()['citations'] and 'cannot verify' in response.json()['answer']
    else:assert response.json()['citations'][0]['url']=='https://sf.gov/food'
    context=json.loads(calls[-1]['messages'][1]['content'])
    assert context['regulatory_evidence'] and context['evidence_available']
    confirm(client,b,proposal(client,b,{'city':'Oakland'}))
    stale=client.post(f"/api/businesses/{b['id']}/advisor/chat",json={'question':'What permits apply?','research':False})
    assert not stale.json()['citations'] and 'not verified' in stale.json()['answer']
    engine.dispose()

def test_regulatory_questions_start_existing_research_service(client,llm,monkeypatch):
    recorded=[]
    def start(business_id,background,db,force=False):
        recorded.append(business_id)
        return {'id':'research-run','status':'queued','stage':'queued'}
    monkeypatch.setattr('backend.advisor.chat.start',start)
    b=create(client,industry='software',business_model='saas',city='Richmond',state='Virginia')
    response=client.post(f"/api/businesses/{b['id']}/advisor/chat",json={'question':'What current formation rules apply?'})
    assert response.status_code==200,response.text
    assert recorded==[b['id']] and response.json()['research_status']['status']=='queued'
    assert 'queued' in response.json()['answer']

def test_existing_formed_entity_adds_review_guidance_not_another_filing(client):
    b=create(client,industry='software',business_model='saas')
    changed=confirm(client,b,proposal(client,b,{'legal_structure':'llc','details':{'formation_status':'formed','founder_count':1}}))
    formation=next(t for t in changed['roadmap'] if t['stable_key']=='common:formation')
    assert any('do not file a new entity automatically' in step for step in formation['guide']['actions'])
    assert not formation['completed']


def test_affected_generic_steps_are_flagged_but_not_automatically_completed(client):
    b=create(client,industry='bakery',business_model='store')
    step=next(t for t in b['roadmap'] if t['stable_key']=='common:structure')
    client.put(f"/api/businesses/{b['id']}/tasks/{step['id']}/progress",json={'completed':True})
    changed=confirm(client,b,proposal(client,b,{'business_model':'home'}))
    affected=next(t for t in changed['roadmap'] if t['id']==step['id'])
    assert affected['completed'] and affected['needs_revalidation']
    reviewed=client.put(f"/api/businesses/{b['id']}/tasks/{step['id']}/progress",json={'completed':True}).json()
    assert not next(t for t in reviewed['roadmap'] if t['id']==step['id'])['needs_revalidation']

def test_concurrent_conflicting_decisions_only_apply_one_profile_snapshot(client):
    from concurrent.futures import ThreadPoolExecutor
    b=create(client,industry='bakery',business_model='store',city='San Francisco')
    first=proposal(client,b,{'business_model':'home'})
    second=proposal(client,b,{'city':'Oakland'})
    def apply(d):return client.post(f"/api/businesses/{b['id']}/decisions/{d['id']}/confirm",json={'confirmed':True})
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(apply,[first,second]))
    assert sorted(r.status_code for r in results)==[200,409]
    updated=get(client,b)
    assert (updated['business_model']=='home') != (updated['city']=='Oakland')

@pytest.mark.parametrize('status,code,expected,fragment',[(429,None,503,'429'),(429,'insufficient_quota',503,'credits'),(401,None,503,'access'),(403,None,503,'access'),(400,None,503,'configuration'),(404,None,503,'configuration'),(500,None,502,'temporarily unavailable')])
def test_chat_provider_errors_are_actionable_without_fake_history(client,monkeypatch,status,code,expected,fragment):
    b=create(client,industry='software',business_model='saas');task=b['roadmap'][0]
    monkeypatch.setenv('OPENAI_API_KEY','test-secret-never-returned');monkeypatch.setenv('ADVISOR_RETRIES','0')
    original=httpx.AsyncClient
    def handler(request):return httpx.Response(status,json={'error':{'code':code,'message':'sensitive raw provider message test-secret-never-returned'}})
    monkeypatch.setattr('backend.advisor.llm.httpx.AsyncClient',lambda **kwargs:original(transport=httpx.MockTransport(handler),**kwargs))
    r=client.post(f"/api/businesses/{b['id']}/advisor/chat",json={'question':'Explain this step simply','task_id':task['id'],'research':False})
    assert r.status_code==expected and fragment in r.json()['detail']
    assert 'sensitive raw' not in r.text and 'test-secret-never-returned' not in r.text
    history=client.get(f"/api/businesses/{b['id']}/advisor/conversation?scope=task:{task['id']}").json()
    assert history['messages']==[]

def test_simple_task_explanation_does_not_require_search_credentials(client,llm,monkeypatch):
    calls,_=llm;b=create(client,industry='software',business_model='saas',company_name='Nimbus')
    task=next(t for t in b['roadmap'] if t['stable_key']=='common:structure')
    def unexpected(*args,**kwargs):raise AssertionError('A simple explanation must not start government research')
    monkeypatch.setattr('backend.advisor.chat.start',unexpected)
    r=client.post(f"/api/businesses/{b['id']}/advisor/chat",json={'question':'Can you explain this in simpler terms?','task_id':task['id']})
    assert r.status_code==200,r.text
    context=json.loads(calls[-1]['messages'][1]['content'])
    assert context['current_task']['id']==task['id'] and context['profile']['company_name']=='Nimbus'
    assert 'Government research has been queued' not in r.json()['answer']

@pytest.mark.parametrize('setting,value',[('ADVISOR_TIMEOUT_SECONDS','nan'),('ADVISOR_TIMEOUT_SECONDS','0'),('ADVISOR_RETRIES','-1')])
def test_invalid_chat_configuration_is_safe(client,llm,monkeypatch,setting,value):
    b=create(client);monkeypatch.setenv(setting,value)
    r=client.post(f"/api/businesses/{b['id']}/advisor/chat",json={'question':'Help me plan','research':False})
    assert r.status_code==503 and 'configuration' in r.json()['detail']


def test_alternative_idea_does_not_reuse_old_identity_and_keeps_draft_between_messages(client,llm):
    calls,options=llm
    b=create(client,company_name='LaunchPilot',idea='Software advisor',industry='software',business_model='saas',city='Salt Lake City',state='Utah')
    options['profile']=nullable(industry='Indian grocery store',state='Arizona',activities=['Grocery retail'])
    first=client.post(f"/api/businesses/{b['id']}/discovery/messages",json={'message':'I want to open an Indian grocery store in Arizona'})
    assert first.status_code==200,first.text
    changes=first.json()['proposal']['changes']
    assert changes['company_name']=='' and changes['city']=='' and changes['business_model']==''
    assert changes['details']['industry_label']=='Indian grocery store'
    assert get(client,b)['company_name']=='LaunchPilot'
    options['profile']=nullable(budget='50000',city='Phoenix')
    second=client.post(f"/api/businesses/{b['id']}/discovery/messages",json={'message':'Phoenix and a budget of 50000'})
    assert second.status_code==200,second.text
    changes=second.json()['proposal']['changes']
    assert changes['industry']=='other' and changes['state']=='Arizona' and changes['city']=='Phoenix'
    assert changes['details']['industry_label']=='Indian grocery store'
    assert 'grocery' in changes['idea'].lower()
    assert json.loads(calls[-1]['messages'][1]['content'])['unconfirmed_idea_changes']['state']=='Arizona'
