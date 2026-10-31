import math
import os
from dataclasses import dataclass

class ResearchError(Exception):
    """Safe operational error. Never contains keys, prompts or provider bodies."""
    def __init__(self,message,*,status_code=None,code=None):
        super().__init__(message)
        self.status_code=status_code
        self.code=code

@dataclass(frozen=True)
class Settings:
    provider:str
    search_key:str
    llm_key:str
    model:str
    ttl_hours:int
    timeout:float
    max_sources:int
    retries:int
    refresh_seconds:int

    @classmethod
    def load(cls):
        provider=os.getenv('SEARCH_PROVIDER','brave').strip().lower()
        try:
            timeout=float(os.getenv('RESEARCH_HTTP_TIMEOUT','15'))
            if not math.isfinite(timeout) or timeout<=0 or timeout>120:raise ValueError()
            return cls(provider,os.getenv('BRAVE_SEARCH_API_KEY' if provider=='brave' else 'TAVILY_API_KEY','').strip(),
                       os.getenv('OPENAI_API_KEY','').strip(),os.getenv('RESEARCH_MODEL',os.getenv('OPENAI_MODEL','gpt-4o-mini')),
                       max(1,int(os.getenv('RESEARCH_CACHE_HOURS','24'))),timeout,
                       min(12,max(1,int(os.getenv('RESEARCH_MAX_SOURCES','8')))),min(3,max(0,int(os.getenv('RESEARCH_RETRIES','2')))),
                       max(0,int(os.getenv('RESEARCH_REFRESH_MIN_SECONDS','30'))))
        except ValueError:raise ResearchError('Invalid research configuration. Check numeric RESEARCH_* settings; timeout must be 1–120 seconds.') from None

    def validate(self):
        if self.provider not in ('brave','tavily'):raise ResearchError('SEARCH_PROVIDER must be brave or tavily.')
        if not self.search_key:raise ResearchError(f'Configure {"BRAVE_SEARCH_API_KEY" if self.provider=="brave" else "TAVILY_API_KEY"} in backend/.env to research regulations. OPENAI_API_KEY does not provide web search; use SEARCH_PROVIDER=tavily with TAVILY_API_KEY if choosing Tavily.')
        if not self.llm_key:raise ResearchError('Configure OPENAI_API_KEY in backend/.env for evidence-based requirement extraction.')
