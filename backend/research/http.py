import asyncio
import httpx
from .config import ResearchError

async def request(client, method, url, *, retries=2, **kwargs):
    for attempt in range(retries + 1):
        try:
            response = await client.request(method, url, **kwargs)
            if response.status_code == 429 or response.status_code in (500, 502, 503, 504):
                if attempt < retries:
                    try: delay = float(response.headers.get('Retry-After', .25 * (2 ** attempt)))
                    except ValueError: delay = .25 * (2 ** attempt)
                    if delay <= 3:
                        await asyncio.sleep(max(0, delay))
                        continue
                code=None
                try:
                    candidate=response.json().get('error',{}).get('code')
                    if candidate in ('insufficient_quota','billing_hard_limit_reached'):code=candidate
                except (ValueError,AttributeError):pass
                raise ResearchError('External service is rate limited or unavailable. Wait and refresh research again.',status_code=response.status_code,code=code)
            if response.status_code in (401, 403):
                raise ResearchError('External service denied access. Check API configuration or use another official source.',status_code=response.status_code)
            response.raise_for_status()
            return response
        except (httpx.TimeoutException, httpx.NetworkError):
            if attempt == retries:
                raise ResearchError('External request timed out or could not connect. Try refreshing research.',code='transport') from None
            await asyncio.sleep(.25 * (2 ** attempt))
        except httpx.HTTPStatusError:
            raise ResearchError('An external page or service could not be retrieved.',status_code=response.status_code) from None
