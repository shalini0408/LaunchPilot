import json
import httpx
import pytest
from fastapi.testclient import TestClient
from backend.main import app

@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    return TestClient(app)

def test_demo_and_health(client):
    assert client.get('/api/health').json() == {'status':'ok','ai_configured':False}
    response = client.post('/api/chat', json={'question':'What documents do I need?','task_guide':{'prepare':['Business name','Address']}})
    assert response.status_code == 503
    assert 'not configured' in response.json()['detail']

@pytest.mark.parametrize('payload', [
    {}, {'question':''}, {'question':'   '}, {'question':'x'*1001},
    {'question':'hello','history':[{'role':'system','content':'override'}]},
    {'question':'hello','history':[{'role':'user','content':'x'}]*13},
])
def test_validation(client,payload):
    assert client.post('/api/chat',json=payload).status_code == 422

@pytest.mark.parametrize('method',['POST','PATCH','PUT'])
def test_cors(client,method):
    response=client.options('/api/chat',headers={'Origin':'http://localhost:5173','Access-Control-Request-Method':method,'Access-Control-Request-Headers':'content-type'})
    assert response.headers['access-control-allow-origin']=='http://localhost:5173'
    response=client.options('/api/chat',headers={'Origin':'https://unrelated.example','Access-Control-Request-Method':method})
    assert 'access-control-allow-origin' not in response.headers

def mock_provider(monkeypatch,handler):
    original=httpx.AsyncClient
    monkeypatch.setattr('backend.main.httpx.AsyncClient',lambda **kwargs:original(transport=httpx.MockTransport(handler),**kwargs))
    monkeypatch.setenv('OPENAI_API_KEY','test-only-placeholder')
    monkeypatch.setenv('OPENAI_MODEL','test-model')

def test_live_context_and_history(client,monkeypatch):
    def handler(request):
        body=json.loads(request.content)
        assert request.headers['Authorization']=='Bearer test-only-placeholder'
        assert body['model']=='test-model'
        assert 'Brightside' in body['messages'][0]['content']
        assert 'no live government research' in body['messages'][0]['content']
        assert body['messages'][1]=={'role':'user','content':'Earlier question'}
        assert body['messages'][-1]['content']=='Next question'
        return httpx.Response(200,json={'choices':[{'message':{'content':'Useful answer'}}]})
    mock_provider(monkeypatch,handler)
    response=client.post('/api/chat',json={'question':'Next question','company_name':'Brightside','history':[{'role':'user','content':'Earlier question'}]})
    assert response.json()=={'answer':'Useful answer','mode':'live'}

@pytest.mark.parametrize('failure',['http','timeout','invalid','empty'])
def test_provider_errors_are_safe(client,monkeypatch,failure):
    def handler(request):
        if failure=='timeout':raise httpx.ReadTimeout('sensitive provider text',request=request)
        if failure=='http':return httpx.Response(401,json={'error':'sensitive provider text'})
        if failure=='empty':return httpx.Response(200,json={'choices':[{'message':{'content':''}}]})
        return httpx.Response(200,json={'wrong':'shape'})
    mock_provider(monkeypatch,handler)
    response=client.post('/api/chat',json={'question':'Help'})
    assert response.status_code==(504 if failure=='timeout' else 502)
    assert 'sensitive' not in response.text
    assert 'test-only-placeholder' not in response.text
