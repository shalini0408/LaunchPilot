"""Structured-output HTTP adapter with bounded latency and safe diagnostics."""
import asyncio
import json
import logging
import math
import os
import httpx
from fastapi import HTTPException
from ..research.config import ResearchError
from ..research.http import request
logger=logging.getLogger(__name__)

async def structured(schema,name,prompt,context):
    key=os.getenv('OPENAI_API_KEY','').strip()
    if not key:raise HTTPException(503,'Configure OPENAI_API_KEY for live discovery and personalized AI generation. Manual profile, comparisons and research remain available.')
    try:
        timeout=float(os.getenv('ADVISOR_TIMEOUT_SECONDS','25'))
        retries=int(os.getenv('ADVISOR_RETRIES','1'))
        if not math.isfinite(timeout) or not 1<=timeout<=50 or not 0<=retries<=2:raise ValueError()
    except ValueError:raise HTTPException(503,'Invalid advisor configuration. ADVISOR_TIMEOUT_SECONDS must be 1–50 and ADVISOR_RETRIES must be 0–2.') from None
    try:
        # Total budget remains below the frontend's 65-second deadline, including retries.
        async with asyncio.timeout(55):
            async with httpx.AsyncClient(timeout=timeout) as client:
                response=await request(client,'POST','https://api.openai.com/v1/chat/completions',retries=retries,
                    headers={'Authorization':'Bearer '+key},json={'model':os.getenv('ADVISOR_MODEL',os.getenv('OPENAI_MODEL','gpt-4o-mini')),
                    'messages':[{'role':'system','content':prompt},{'role':'user','content':json.dumps(context)}],
                    'response_format':{'type':'json_schema','json_schema':{'name':name,'strict':True,'schema':schema.model_json_schema()}},
                    'max_completion_tokens':1400 if name=='contextual_advisor' else 6000})
        message=response.json()['choices'][0]['message']
        if message.get('refusal'):raise HTTPException(422,'The assistant could not answer this request. Try rephrasing your question.')
        return schema.model_validate_json(message['content'])
    except ResearchError as error:
        # Log only safe categories and status, never headers, prompts, keys or raw bodies.
        logger.warning('Advisor provider request failed: status=%s category=%s',error.status_code,error.code or 'provider')
        if error.code in ('insufficient_quota','billing_hard_limit_reached'):
            raise HTTPException(503,'The AI provider has no available credits or has reached its spending limit. Check the provider billing settings before retrying.') from None
        if error.status_code==429:raise HTTPException(503,'The AI provider is limiting requests (HTTP 429). Wait and retry; if this persists, check provider quota and billing.') from None
        if error.status_code in (401,403):raise HTTPException(503,'The AI provider rejected access. Check the server API key and project permissions.') from None
        if error.status_code in (400,404):raise HTTPException(503,'The configured AI model or structured-response settings were rejected. Check the server model configuration.') from None
        if error.code=='transport':raise HTTPException(504,'The AI provider timed out or could not be reached. Please retry.') from None
        raise HTTPException(502,'The AI provider is temporarily unavailable. Please retry.') from None
    except (TimeoutError,httpx.TimeoutException):
        logger.warning('Advisor request exceeded its time budget')
        raise HTTPException(504,'The assistant took too long to reply. Please retry.') from None
    except (httpx.HTTPError,ValueError,KeyError,IndexError,TypeError):
        logger.warning('Advisor response could not be validated')
        raise HTTPException(502,'The assistant returned an incomplete or invalid response. Please retry.') from None
