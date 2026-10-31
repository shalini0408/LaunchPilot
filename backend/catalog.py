"""The same curated content consumed by React. No live government retrieval."""
import json
import re
from pathlib import Path
CATALOG = json.loads((Path(__file__).resolve().parent.parent / 'shared' / 'business-catalog.json').read_text())
INDUSTRIES = CATALOG['industries']
FORMATION = 'Register your business with the state'
EIN = 'Determine if you need an EIN and apply through the IRS'

def task_guide(title):
    text = title.lower()
    if re.search(r'ein|employer identification', text):
        return CATALOG['ein_guide']
    for pattern, kind in [
        (r'zoning|premises|location|leasing', 'location'),
        (r'structure|name|formation|register your business', 'entity'),
        (r'permit|registration|inspections|food safety|eligibility|labeling|tax and local', 'permit'),
        (r'privacy|data', 'privacy'), (r'contract|terms|ip', 'contract'),
        (r'tax|billing|invoic|recordkeep', 'finance'),
        (r'launch|operations|support|staffing|security', 'operations'),
        (r'product|supplier|customer|service|offering|sales channel', 'products'),
    ]:
        if re.search(pattern, text):
            return CATALOG['guides'][kind]
    return CATALOG['guides']['general']

def task_definitions(industry, model):
    steps = list(INDUSTRIES.get(industry, {}).get('steps', {}).get(model, []))
    if steps:
        index = next((i for i, title in enumerate(steps) if 'business structure and name' in title.lower()), None)
        position = index + 1 if index is not None else min(3, len(steps))
        steps[position:position] = [FORMATION, EIN]
    return [{'stable_key': stable_key(industry, title), 'title': title, 'guide': task_guide(title), 'position': i} for i, title in enumerate(steps)]

def stable_key(industry, title):
    # Only identical outcomes share progress. Distinct permit/operations tasks stay distinct.
    shared = {'Choose business structure and name': 'structure', FORMATION: 'formation', EIN: 'ein'}
    return 'common:' + shared[title] if title in shared else industry + ':' + re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')

def business_task_definitions(business,industry=None,model=None):
    """Curated planning, personalized to activity/location; research adds evidenced obligations."""
    industry=business.industry if industry is None else industry
    model=business.business_model if model is None else model
    definitions=task_definitions(industry,model)
    if not definitions and industry:
        industry_steps={
            'software':['Define customers and product offering','Choose business structure and name','Review business name registration, if needed',FORMATION,EIN,'Review privacy and data practices','Draft product terms and customer agreements','Review tax and billing obligations','Plan security and launch readiness'],
            'bakery':['Define your baked goods and sales channels','Choose business structure and name','Review business name registration, if needed',FORMATION,EIN,'Check cottage food product eligibility' if model=='home' else 'Review food preparation, premises and sales requirements','Review tax and local business obligations','Prepare launch operations'],
            'coffee':['Define your coffee products and service model','Choose business structure and name','Review business name registration, if needed',FORMATION,EIN,'Review premises and zoning before leasing','Review food and beverage permits and inspections','Review tax and local business obligations','Prepare launch operations'],
            'ecommerce':['Choose products and suppliers','Choose business structure and name','Review business name registration, if needed',FORMATION,EIN,'Validate product and labeling rules','Review sales tax and business registrations','Create store policies and fulfillment plan'],
            'other':['Define business activities and target customers','Choose business structure and name','Review business name registration, if needed',FORMATION,EIN,'Review activity-specific obligations','Plan records and finances','Prepare launch operations'],
        }
        definitions=[{'stable_key':'common:business-name' if title.startswith('Review business name registration') else stable_key(industry,title),'title':title,'guide':task_guide(title),'position':i} for i,title in enumerate(industry_steps.get(industry,[]))]
    name=business.company_name or 'your business'
    location=', '.join(v for v in (business.city,business.state) if v) or 'your operating location'
    activity='; '.join((business.details or {}).get('activities',[])) or business.idea or INDUSTRIES.get(industry,{}).get('name','business')
    formed=(business.details or {}).get('formation_status')=='formed'
    result=[]
    for definition in definitions:
        item={**definition,'guide':json.loads(json.dumps(definition['guide']))}
        if definition['stable_key']=='common:formation':
            item['title']='Review existing entity registration' if formed else 'Review entity registration, if appropriate'
            item['guide']['goal']=f'For {name} in {location}, confirm whether your chosen structure calls for entity registration. Review existing records first; forming an LLC or corporation is not assumed.'
        else:
            item['guide']['goal']=f"For {name} in {location}, review {item['title'].lower()} for these activities: {activity[:350]}. Record the next action and what needs official verification."
        item['guide']['prepare']=list(dict.fromkeys([f'Business activity: {activity[:350]}',f'Operating location: {location}',*item['guide'].get('prepare',[])]))
        if definition['stable_key']=='common:structure':
            count=(business.details or {}).get('founder_count')
            item['guide']['actions'].insert(0,f"Compare ownership and governance for {count} founder(s)." if count else 'Confirm who will own and manage the business before choosing a structure.')
        if formed and definition['stable_key'] in ('common:formation','common:structure','common:ein'):
            item['guide']['actions'].insert(0,'Review the existing entity and records; do not file a new entity automatically.')
        result.append(item)
    return result
