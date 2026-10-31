"""Small interchangeable adapters; provider snippets are never used as evidence."""
from .config import ResearchError
from .http import request

async def search(client, query, domains, settings):
    if settings.provider == 'brave':
        response = await request(client, 'GET', 'https://api.search.brave.com/res/v1/web/search', retries=settings.retries,
                                 headers={'X-Subscription-Token': settings.search_key},
                                 params={'q': query[:600], 'count': 10, 'country': 'US'})
        results = response.json().get('web', {}).get('results', [])
    elif settings.provider == 'tavily':
        response = await request(client, 'POST', 'https://api.tavily.com/search', retries=settings.retries,
                                 headers={'Authorization': 'Bearer ' + settings.search_key},
                                 json={'query': query, 'max_results': 10, 'search_depth': 'basic', 'include_domains': domains,
                                       'include_answer': False, 'include_raw_content': False})
        results = response.json().get('results', [])
    else:
        raise ResearchError('Unsupported search provider. Use brave or tavily.')
    return [r['url'] for r in results if isinstance(r, dict) and isinstance(r.get('url'), str)]
