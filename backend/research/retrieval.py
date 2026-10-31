"""Bounded HTML/PDF retrieval. Redirect destinations must pass the same validation."""
import asyncio
from io import BytesIO
import re
from urllib.parse import urljoin
import httpx
from bs4 import BeautifulSoup
from pypdf import PdfReader
from .config import ResearchError
from .validation import public_dns, validate_url

MAX_BYTES = 2 * 1024 * 1024

def clean(text):
    return ' '.join(text.split())

def parse_page(body, content_type, url):
    published = updated = None
    links = []
    if 'pdf' in content_type:
        try:
            reader = PdfReader(BytesIO(body))
            text = clean(' '.join(page.extract_text() or '' for page in reader.pages[:30]))
            title = str((reader.metadata or {}).get('/Title', '')) or url
            updated = str((reader.metadata or {}).get('/ModDate', ''))[:100] or None
        except Exception:
            raise ResearchError('Official PDF could not be extracted; verify it directly with the agency.') from None
    elif 'html' in content_type:
        soup = BeautifulSoup(body, 'html.parser')
        title = clean(soup.title.get_text()) if soup.title else url
        for meta in soup.select('meta[content]'):
            key = str(meta.get('property') or meta.get('name') or '').lower()
            if key in ('article:published_time', 'datepublished', 'dc.date.issued'):
                published = str(meta['content'])[:100]
            if key in ('article:modified_time', 'datemodified', 'dc.date.modified', 'last-modified'):
                updated = str(meta['content'])[:100]
        for script in soup.select('script[type="application/ld+json"]'):
            # Read only dates; never execute or treat JSON-LD as instructions.
            for key, target in [('datePublished','published'),('dateModified','updated')]:
                match = re.search(r'"' + key + r'"\s*:\s*"([^"]{1,100})"', script.get_text())
                if match:
                    if target == 'published': published = match.group(1)
                    else: updated = match.group(1)
        visible = clean(soup.get_text(' ',strip=True))
        date_pattern = r'(\d{4}-\d{2}-\d{2}|\d{1,2}[- ](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[- ,]+\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December) +\d{1,2},? +\d{4})'
        if not updated:
            match=re.search(r'(?:Page Last Reviewed or Updated|Last Updated|Last Modified|Updated on)\s*:?\s*'+date_pattern,visible,re.I)
            if match:updated=match.group(1)
        if not published:
            match=re.search(r'Published on\s*:?\s*'+date_pattern,visible,re.I)
            if match:published=match.group(1)
        links = list(dict.fromkeys(urljoin(url, str(a['href'])) for a in soup.select('a[href]')))[:150]
        for tag in soup(['script','style','nav','footer','header','noscript','form']): tag.decompose()
        text = clean((soup.find('main') or soup.find('article') or soup).get_text(' ', strip=True))
    elif 'text/plain' in content_type:
        text = clean(body.decode('utf-8', errors='replace'))
        title = url
    else:
        raise ResearchError('Official source has an unsupported content type; open it directly with the agency.')
    if len(text) < 80:
        raise ResearchError('Official source contained too little readable evidence.')
    return {'title':title[:1000], 'text':text[:16000], 'links':links, 'published_date':published, 'updated_date':updated}

async def fetch_page(client, url, profile, settings):
    for _ in range(5):
        url, agency = validate_url(url, profile)
        await public_dns(url)
        response = None
        for attempt in range(settings.retries + 1):
            try:
                async with client.stream('GET', url, follow_redirects=False, headers={'User-Agent':'LaunchPilotResearch/0.7 (+official-source research)', 'Accept':'text/html,application/pdf,text/plain'}) as stream:
                    if stream.status_code in (429,500,502,503,504):
                        if attempt < settings.retries:
                            try: delay=float(stream.headers.get('Retry-After','.5'))
                            except ValueError: delay=.5
                            if delay <= 3:
                                await asyncio.sleep(max(0,delay));continue
                        raise ResearchError('Official website is rate limited or unavailable; refresh later.')
                    if stream.is_redirect:
                        url = urljoin(url, stream.headers.get('location',''))
                        response = 'redirect'
                        break
                    if stream.status_code != 200:
                        raise ResearchError('Official page could not be retrieved.')
                    content_type = stream.headers.get('content-type','').lower()
                    if not any(t in content_type for t in ('text/html','application/pdf','text/plain')):
                        raise ResearchError('Official source format is not supported.')
                    body = bytearray()
                    async for chunk in stream.aiter_bytes():
                        body.extend(chunk)
                        if len(body)>MAX_BYTES:
                            raise ResearchError('Official source exceeded the retrieval size limit.')
                    page = parse_page(bytes(body), content_type, url)
                    return {'url':url, 'agency':agency['agency'], 'jurisdiction':agency['jurisdiction'], **page}
            except (httpx.TimeoutException,httpx.NetworkError):
                if attempt == settings.retries:
                    raise ResearchError('Official page timed out or could not connect.') from None
                await asyncio.sleep(.25 * (2 ** attempt))
        if response != 'redirect': break
    raise ResearchError('Official page redirected too many times.')
