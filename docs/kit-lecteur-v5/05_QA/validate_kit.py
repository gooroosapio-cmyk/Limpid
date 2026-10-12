"""Local fixture/asset checks. This is not an application or semantic teaching audit.
Run: python3 05_QA/validate_kit.py from any directory. Standard library only.
The small schema checker implements only the keywords used in the bundled schema.
Use a complete JSON Schema validator in the production application.
"""
from pathlib import Path
import json, xml.etree.ElementTree as ET, re, copy, math
R=Path(__file__).resolve().parent.parent
def check(value,schema,path='$'):
 if 'oneOf' in schema:
  count=0
  for candidate in schema['oneOf']:
   try:check(value,candidate,path);count+=1
   except ValueError:pass
  if count!=1:raise ValueError(path+': oneOf '+str(count))
  return
 if 'const' in schema and value!=schema['const']:raise ValueError(path+': const')
 if 'enum' in schema and value not in schema['enum']:raise ValueError(path+': enum')
 types=schema.get('type');types=types if isinstance(types,list) else [types] if types else []
 def matches(t):
  return {'object':isinstance(value,dict),'array':isinstance(value,list),'string':isinstance(value,str),'boolean':type(value)==bool,'integer':type(value)==int,'number':type(value) in (int,float),'null':value is None}.get(t,False)
 if types and not any(matches(t) for t in types):raise ValueError(path+': type')
 if isinstance(value,dict):
  for key in schema.get('required',[]):
   if key not in value:raise ValueError(path+': required '+key)
  if schema.get('additionalProperties') is False:
   for key in value:
    if key not in schema.get('properties',{}):raise ValueError(path+': extra '+key)
  for key,item in value.items():
   if key in schema.get('properties',{}):check(item,schema['properties'][key],path+'.'+key)
 if isinstance(value,list):
  if len(value)<schema.get('minItems',0) or len(value)>schema.get('maxItems',float('inf')):raise ValueError(path+': size')
  if schema.get('uniqueItems') and len({json.dumps(x,sort_keys=True) for x in value})!=len(value):raise ValueError(path+': duplicate')
  for i,item in enumerate(value):check(item,schema.get('items',{}),path+'['+str(i)+']')
 if isinstance(value,str) and len(value)<schema.get('minLength',0):raise ValueError(path+': length')
 if type(value) in (int,float):
  if value<schema.get('minimum',-float('inf')) or value>schema.get('maximum',float('inf')) or value<=schema.get('exclusiveMinimum',-float('inf')):raise ValueError(path+': numeric bound')
def semantic(course):
 sources={s['id']:s for s in course['sources']};evidence={e['id']:e for e in course['evidence']};claims={c['id']:c for c in course['claims']};ids=[];sections=set();questions=set()
 for e in evidence.values():
  if e['source_id'] not in sources or e['quote'] not in sources[e['source_id']]['text']:raise ValueError('Invalid source quote')
 for c in claims.values():
  if any(x not in evidence for x in c['evidence_ids']):raise ValueError('Invalid claim evidence')
 for ch in course['chapters']:
  ids.append(ch['id'])
  for sec in ch['sections']:
   ids.append(sec['id']);sections.add(sec['id'])
   for block in sec['blocks']:
    ids.append(block['id'])
    if any(x not in claims for x in block['claim_ids']) or any(x not in evidence for x in block['evidence_ids']):raise ValueError('Invalid block reference')
    if block['kind'] in ['fact','definition','formula'] and (not block['claim_ids'] or any(claims[x]['status']!='supported' for x in block['claim_ids'])):raise ValueError('Unsupported factual block')
    if block['kind']=='comparison' and any(len(row)!=len(block['payload']['columns']) for row in block['payload']['rows']):raise ValueError('Invalid table width')
  for q in ch['quiz']:
   ids.append(q['id']);questions.add(q['id'])
   if q['type']=='single' and (q['correct_index']>=len(q['choices']) or len(q['choices'])!=len(q['explanations'])):raise ValueError('Invalid question')
   if any(x not in claims for x in q['claim_ids']) or any(x not in evidence for x in q['evidence_ids']):raise ValueError('Invalid question reference')
 if len(ids)!=len(set(ids)):raise ValueError('Duplicate ids')
 for ch in course['chapters']:
  for q in ch['quiz']:
   if q['revisit_section_id'] not in sections or q['variant_of'] is not None and q['variant_of'] not in questions:raise ValueError('Invalid revisit/variant')
 if course['publication_status']=='ready' and course['validation']['blocking_errors']:raise ValueError('Published blocking error')
def luminance(hexcode):
 rgb=[int(hexcode[i:i+2],16)/255 for i in [1,3,5]]
 lin=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in rgb]
 return sum(a*b for a,b in zip(lin,[.2126,.7152,.0722]))
schema=json.loads((R/'03_COMPONENTS/course.schema.json').read_text());course=json.loads((R/'04_EXAMPLES/course.demo.json').read_text())
check(course,schema);semantic(course)
negative=[]
for name,mutate in [('unknown_reference',lambda x:x['chapters'][0]['sections'][0]['blocks'][0]['claim_ids'].append('clm_missing')),('bad_quote',lambda x:x['evidence'][0].update(quote='Not in the source')),('invalid_answer',lambda x:x['chapters'][0]['quiz'][0].update(correct_index=99)),('published_error',lambda x:x['validation']['blocking_errors'].append('Calculation error'))]:
 bad=copy.deepcopy(course);mutate(bad)
 try:check(bad,schema);semantic(bad)
 except ValueError:negative.append(name)
 else:raise ValueError('Negative fixture accepted: '+name)
icons=list((R/'02_ICONS').glob('*.svg'))
for f in icons:
 root=ET.parse(f).getroot()
 if f.name!='reader.sprite.svg' and root.attrib.get('viewBox')!='0 0 24 24':raise ValueError('Bad icon viewbox')
 if any(e.tag.split('}')[-1] in ['script','foreignObject'] for e in root.iter()):raise ValueError('Active SVG')
for f in R.rglob('*.json'):json.loads(f.read_text())
tokens=json.loads((R/'01_DESIGN/reader.tokens.json').read_text());ratios={}
for role,pair in tokens['roles'].items():
 for theme,colors in pair.items():
  a,b=[luminance(x) for x in colors];ratio=(max(a,b)+.05)/(min(a,b)+.05);ratios[role+'/'+theme]=round(ratio,2)
  if ratio<4.5:raise ValueError('Contrast failure '+role+'/'+theme)
assert math.isclose(8*(1-.25)*(1-.30),4.2)
assert math.isclose((2+1.8)/8*100,47.5)
html=(R/'04_EXAMPLES/lecteur.autonome.html').read_text()
ids=re.findall(r'\bid="([^"]+)"',html)
assert len(ids)==len(set(ids))
assert len(re.findall(r'<details class="lr-section"[^>]* open>',html))==3
assert html.index('id="chapter-quiz"')>html.index('id="sec_result"')
report={'status':'passed','schema_fixture':'passed','reference_checks':'passed','negative_fixtures_rejected':negative,'svg_files':len(icons),'production_icons':len(icons)-1,'contrast_ratios':ratios,'arithmetic':'passed','demo_html_structure':'passed','browser_runtime_and_application':'Not executed here; see RECETTE_APPLICATION.md'}
(R/'05_QA/validation.locale.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
