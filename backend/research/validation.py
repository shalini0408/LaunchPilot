"""Fail-closed agency registry, jurisdiction checks, HTTPS and public DNS checks."""
import asyncio
import ipaddress
import json
import os
import socket
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from .config import ResearchError

STATE_ALIASES = {'az':'arizona','ca':'california','ny':'new york','tx':'texas','fl':'florida','va':'virginia'}
def normalize(value):
    value = ' '.join(str(value).lower().strip().split())
    return STATE_ALIASES.get(value, {'nyc':'new york', 'new york city':'new york'}.get(value, value))

def registry():
    entries = json.loads(Path(__file__).with_name('registry.json').read_text())
    custom = os.getenv('GOVERNMENT_REGISTRY_PATH', '')
    if custom:
        entries += json.loads(Path(custom).read_text())
    return entries

def relevant(entry, profile):
    if entry['level'] == 'federal': return True
    if normalize(entry.get('state', '')) != normalize(profile.get('state', '')): return False
    if entry['level'] == 'state': return True
    city = normalize(profile.get('city', ''))
    return bool(city) and city in [normalize(c) for c in entry.get('cities', [entry.get('city', '')])]

def validate_url(url, profile):
    try:
        parts = urlsplit(url)
        host = (parts.hostname or '').lower().rstrip('.')
        if parts.scheme != 'https' or parts.username or parts.password or parts.port not in (None,443):
            raise ValueError()
        if not host or '%' in host or '\\' in url or any(ord(c)<33 for c in url): raise ValueError()
        try: ipaddress.ip_address(host)
        except ValueError: pass
        else: raise ValueError()
    except ValueError:
        raise ResearchError('Source rejected: only public official HTTPS agency URLs are allowed.') from None
    # More specific agency entries override a state-level domain.
    entries = sorted(registry(), key=lambda e: len(e['domain']), reverse=True)
    for entry in entries:
        domain = entry['domain'].lower()
        if host == domain or host.endswith('.' + domain):
            if not domain.endswith('.gov') and not entry.get('verification_url'):
                raise ResearchError('Source rejected: non-.gov agency has no registry verification reference.')
            if not relevant(entry, profile):
                raise ResearchError('Source rejected: agency is outside this business jurisdiction.')
            jurisdiction = 'United States' if entry['level']=='federal' else entry.get('city', '') or (entry['agency'] if entry['level']=='county' else entry['state'])
            return urlunsplit(('https', parts.netloc.lower(), parts.path or '/', parts.query, '')), {**entry,'jurisdiction':jurisdiction}
    raise ResearchError('Source rejected: agency domain is not in the verified registry.')

async def public_dns(url):
    host = urlsplit(url).hostname
    try:
        addresses = await asyncio.wait_for(asyncio.to_thread(socket.getaddrinfo, host, 443, type=socket.SOCK_STREAM), timeout=5)
    except (OSError, asyncio.TimeoutError):
        raise ResearchError('Official source DNS could not be resolved.') from None
    if not addresses or any(not ipaddress.ip_address(row[4][0]).is_global for row in addresses):
        raise ResearchError('Source rejected: host resolves to a private or reserved address.')
