import os
import re
from fastapi import HTTPException
from .conversations import conversation, append_exchange, history
from .context import build_context, citations
from .schemas import StrategyAnswer
from .llm import structured
from .prompts import STRATEGY
from .comparisons import check_strategy, has_regulatory_claim
from ..research.config import ResearchError
from ..research.routes import start

async def chat(db,business,data,background):
    context,sources=build_context(db,business,data.task_id,data.requirement_id)
    scope='requirement:'+data.requirement_id if data.requirement_id else 'task:'+data.task_id if data.task_id else 'advisor'
    row=conversation(db,business.id,scope)
    older=history(row)
    context['conversation']=older
    regulatory=bool(data.requirement_id or re.search(r'law|legal|permit|licen[cs]e|tax|fee|deadline|regulat|llc|corporation|register|compliance|formation|structure|required|requirements|\bein\b',data.question+' '+context.get('current_task',{}).get('title',''),re.I))
    research_status=None;limitation=''
    # Task titles supply context; they do not make every explanatory question a live-law lookup.
    explanatory=bool(re.search(r'simpler|explain|what (?:is|does|are)|meaning|define',data.question,re.I)) and not re.search(r'fee|deadline|\brequired\b|\brequirements?\b|\bmust\b|do i (?:really )?need|does .*apply',data.question,re.I)
    if regulatory and not explanatory and data.research and not sources:
        try:research_status=start(business.id,background,db)
        except HTTPException as error:limitation=str(error.detail)
        except ResearchError as error:limitation=str(error)
    if not os.getenv('OPENAI_API_KEY','').strip():
        raise HTTPException(503,'The AI assistant is not configured. Set the server LLM API key and retry.')
    else:
        parsed=await structured(StrategyAnswer,'contextual_advisor',STRATEGY,{**context,'question':data.question,'research_status':research_status,'research_limitation':limitation})
        paragraphs=[];all_citations=[]
        for paragraph in parsed.paragraphs:
            check_strategy(paragraph.text,business)
            if paragraph.basis=='regulatory':
                if not paragraph.evidence:
                    paragraphs.append('I cannot verify that regulatory claim from current official evidence. Research the relevant agencies before acting.');continue
                try:refs=citations(paragraph.evidence,sources)
                except HTTPException:
                    paragraphs.append('I cannot verify the proposed regulatory answer from the retrieved official evidence.');continue
                numbers=[]
                for ref in refs:
                    if ref not in all_citations:all_citations.append(ref)
                    numbers.append(str(all_citations.index(ref)+1))
                paragraphs.append(paragraph.text+' ['+', '.join(numbers)+']')
            else:
                # Regulatory-looking paragraphs cannot bypass citation checks by calling themselves assumptions.
                if has_regulatory_claim(paragraph.text):
                    paragraphs.append('Current legal or regulatory consequences need official evidence and professional review.');continue
                paragraphs.append(('Planning assumption: ' if paragraph.basis=='planning_assumption' else '')+paragraph.text)
        if not paragraphs:paragraphs=['I need more confirmed information to give a useful answer. Please describe the activity and the decision you are considering.']
        if regulatory and not explanatory and not sources:
            paragraphs.append('Current regulations were not verified. '+('Government research has been queued; review its results in Legal & Compliance.' if research_status and research_status['status'] in ('queued','running') else limitation or 'Research official agencies and confirm applicability.'))
        result={'answer':'\n\n'.join(paragraphs),'mode':'live','citations':all_citations,'evidence_based':True}
    append_exchange(db,row,data.question,result['answer'],result['citations'])
    return {**result,'conversation_id':row.id,'research_status':research_status}
