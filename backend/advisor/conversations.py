from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert
from ..models import identifier, now
from .models import DiscoveryConversation

def conversation(db,business_id,scope):
    db.execute(insert(DiscoveryConversation).values(id=identifier(),business_id=business_id,scope=scope,messages=[],summary='',updated_at=now()).on_conflict_do_nothing(index_elements=['business_id','scope']))
    db.commit()
    return db.scalar(select(DiscoveryConversation).where(DiscoveryConversation.business_id==business_id,DiscoveryConversation.scope==scope))

def append(db,row,role,content,citations=None):
    db.refresh(row)
    row.messages=[*row.messages,{'id':identifier(),'role':role,'content':content,'citations':citations or [],'created_at':now().isoformat()}]
    older=row.messages[:-12]
    # Extractive digest: no invented facts, and full messages remain in SQLite.
    row.summary='\n'.join(f"{m['role']}: {m['content'][:220]}" for m in older[-18:])[:4000]
    db.commit()

def history(row):
    return {'summary':row.summary,'recent_messages':[{'role':m['role'],'content':m['content'][:4000]} for m in row.messages[-12:]]}

def response(row):return {'id':row.id,'scope':row.scope,'messages':row.messages[-100:],'summary':row.summary,'total_messages':len(row.messages)}

def append_exchange(db,row,question,answer,citations=None):
    """Only successful exchanges enter persistent history; save both messages together."""
    db.execute(update(DiscoveryConversation).where(DiscoveryConversation.id==row.id).values(updated_at=DiscoveryConversation.updated_at))
    db.refresh(row)
    created=now().isoformat()
    row.messages=[*row.messages,
        {'id':identifier(),'role':'user','content':question,'citations':[],'created_at':created},
        {'id':identifier(),'role':'assistant','content':answer,'citations':citations or [],'created_at':created}]
    older=row.messages[:-12]
    row.summary='\n'.join(f"{m['role']}: {m['content'][:220]}" for m in older[-18:])[:4000]
    db.commit()
