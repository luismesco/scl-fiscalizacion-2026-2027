"""Consulta de fuentes electorales; Luis Montañez Escobar."""
import json,os,re,sqlite3,sys,unicodedata
from pathlib import Path
root=Path(os.environ.get('NORMATIVE_RAG_ROOT','private-normative'))
def fold(s):return ''.join(c for c in unicodedata.normalize('NFD',str(s or '').lower()) if unicodedata.category(c)!='Mn')
def phrase(s):return re.sub(r'[^a-z0-9]+',' ',fold(s)).strip()
def article_key(s):return re.sub(r'^(\d+)[oº°]?',r'\1',fold(s)).strip()
def toc(text):return bool(re.search(r'\.{4,}|…{3,}',text)) and len(re.findall(r'articulo\s+\d+',fold(text)))>=3
def authority(m):
 title=fold(m.get('titulo',''));kind=fold(m.get('tipo_documento',''))
 if title.startswith('constitucion'):return 4
 if title.startswith(('convencion ','pacto ','tratado ')):return 4
 if title.startswith(('ley ','codigo ')):return 3
 if title.startswith(('reglamento ','estatuto ')):return 2
 if title.startswith(('acuerdo ','lineamientos ','lineamiento ')):return 1
 return 0

def intent_for(question):
 path=Path(__file__).resolve().parent.parent
 asset=next((p for p in [path/'dist/src/views/judicial/retrieval-intents.json',path/'src/views/judicial/retrieval-intents.json'] if p.is_file()),None)
 if not asset:return None
 if re.search(r'\b(?:penal|civil|amparo|laboral)\b',question) and 'electoral' not in question:return None
 profiles=json.loads(asset.read_text())['profiles'];n=re.sub(r'\s+',' ',fold(question))
 return next((profile for profile in profiles if any(re.search(pattern,n) for pattern in profile['matchAny'])),None)

def comparison_question(n):
 return local_normative_existence(n) or bool(re.search(r'\botr[ao]s?\s+(?:entidad(?:es)?(?:\s+federativas?)?|estados?)\b',n) or (re.search(r'\bcompar(?:a|ar|acion|ativo|ativa)\b',n) and re.search(r'\b(?:entidad(?:es)?|estados?|federativ[ao]s?|territorial)\b',n)))

def local_normative_existence(n):
 explicit=bool(re.search(r'\b(?:algun[ao]s?|existe(?:n)?)\b.{0,35}\b(?:normas?|ley(?:es)?|disposicion(?:es)?|legislacion)\b.{0,40}\b(?:estatal(?:es)?|local(?:es)?)\b',n))
 if not explicit and re.search(r'\bley\s+federal\b|\bacto\s+(?:del\s+)?ine\b',n):return False
 return explicit or bool(re.search(r'\b(?:norm\w*|ley(?:es)?|legislacion|codigo\w*|electoral\w*|prohib\w*|permit\w*|prerrogativ\w*|obligacion\w*|derech\w*|regul\w*)\b',n) and re.search(r'\b(?:en que\s+(?:estado|entidad)|que\s+(?:estados|entidades)|algun[ao]\s+(?:estado|entidad)|existe(?:n)?\s+(?:un[ao]|algun[ao])?\s*(?:estado|entidad))\b',n))

def main():
 payload=json.loads(sys.stdin.read(12000));question=payload.get('question','')[:4000];n=fold(question).replace('r.a.p.','rap').replace('r.a.p','rap');n=re.sub(r'constitcion','constitucion',n);n=re.sub(r'exahustivdad|exahustividad|exhaustivdad','exhaustividad',n);profile=intent_for(n);db=root/'normative.sqlite'
 if not db.is_file():return []
 comparative=comparison_question(n);local_existential=local_normative_existence(n);pes_requested=bool(re.search(r'procedimiento\s+especial\s+sancionador|\bpes\b',n));gender_requested=bool(re.search(r'violencia|genero|mujer|vpmrg|\bvpg\b',n));fiscal_requested=bool(re.search(r'fiscaliz',n) and re.search(r'procedimiento|sancionador|queja|oficioso|inici',n) and not re.search(r'\brap\b|apelacion|impugnar|impugnacion',n));procedure_inferred=False;reference_entities=[]
 c=sqlite3.connect(db.resolve().as_uri()+'?mode=ro',uri=True,timeout=3)
 stop=set('que quien quienes cuantos cuantas cuanto cuando dias tengo tenemos ingresar ingreso presentar presento interponer interpongo saber quiero necesito puedo pueden esto eso esta este ella ello ellos ellas una uno unos unas del los las con por sus sin son ser hay fue han mas muy mis tus nos les sido desde hasta cual cuales decir dice dime explicame define definicion favor articulo articulos numeral numerales revisa revisar correcta correcto precedentes precedente favorables favorable contrario contrarios documento sobre para como esta este tiene tienen debe deben entre cada puede pueden cuando donde cual cuales otros otras seria autoridad partido responde respuesta consulta analiza analizar conforme aplicable aplica caso hechos forma preliminar explica acredita falta contrasta inventar recuperen manera'.split())
 # Carry a previous topic only for an underspecified follow-up, never across an explicit new topic.
 context=fold(payload.get('context','')[:2600])
 explicit=bool(re.search(r'\brap\b|apelacion|violencia|articulo\s+\d+|\bley\b|\bcodigo\b|\breglamento\b|constitucion|cpeum|lgipe|lgpp|lgsmime',n))
 if context and not explicit and re.search(r'^(?:[¿¡\s]*)(?:y (?:el|la|los|las|cual|cuanto|como)|entonces|eso|esa |ese |sobre (?:eso|ese|esa)|en ese caso|lo anterior)',n):n+=' '+context
 words=list(dict.fromkeys(w for w in re.findall(r'[a-z0-9]{3,}',n) if w not in stop))[:24]
 aliases={'rf':'reglamento de fiscalizacion','lgipe':'ley general de instituciones y procedimientos electorales','lgpp':'ley general de partidos politicos','lgsmime':'ley general del sistema de medios de impugnacion','cpeum':'constitucion politica de los estados unidos mexicanos','rpsf':'reglamento de procedimientos sancionadores en materia de fiscalizacion'}
 aliases['lgamvlv']='ley general de acceso de las mujeres a una vida libre de violencia'
 titles=[v for k,v in aliases.items() if re.search(r'\b'+k+r'\b',n) or v in n];articles=re.findall(r'articulo\s+(\d+(?:[ \t]+(?:bis|ter|quater|quinquies))?)',n);
 for group in re.findall(r'articulos?\s+((?:\d+(?:\s*(?:bis|ter))?\s*(?:,|y|a|al)?\s*)+)',n):
  for number in re.findall(r'\d+(?:\s+(?:bis|ter))?',group):
   if number not in articles:articles.append(number)
 articles=[re.sub(r'\s+',' ',a).strip() for a in articles[:12]];numerals=re.findall(r'numeral(?:es)?\s+(\d+)',n)
 def law_title(m):
  title=fold(m['titulo']).replace('violencias','violencia');return any(title==t.replace('violencias','violencia') or title.startswith(t.replace('violencias','violencia')+' ') or title.startswith(t.replace('violencias','violencia')+'(') for t in titles)
 if re.search(r'\brap\b',n):words=list(dict.fromkeys(['recurso','apelacion','impugnacion']+words))
 # Resolve instrument metadata once, before reading its indexed page fragments.
 records=[(rid,json.loads(raw)) for rid,raw in c.execute("SELECT id,metadata FROM records WHERE status IN ('indexed','indexed_alias')")]
 if not re.search(r'decreto|transitorio|reforma|historico|vigente en',n):records=[(rid,m) for rid,m in records if not re.search(r'^decreto(?: de)? reforma',fold(m.get('identificador_oficial','')))]
 entities={m['entidad'] for _,m in records if m.get('ambito')=='Local' and isinstance(m.get('entidad'),str) and m['entidad'].strip()}
 state_aliases={'aguascalientes':['ags'],'baja california':['bc'],'baja california sur':['bcs'],'campeche':['camp'],'coahuila':['coah'],'coahuila de zaragoza':['coah','coahuila'],'colima':['col'],'chiapas':['chis'],'chihuahua':['chih'],'ciudad de mexico':['cdmx'],'durango':['dgo'],'guanajuato':['gto'],'guerrero':['gro'],'hidalgo':['hgo'],'jalisco':['jal'],'estado de mexico':['edomex'],'michoacan':['mich'],'michoacan de ocampo':['mich','michoacan'],'morelos':['mor'],'nayarit':['nay'],'nuevo leon':['nl'],'oaxaca':['oax'],'puebla':['pue'],'queretaro':['qro'],'quintana roo':['qroo'],'san luis potosi':['slp'],'sinaloa':['sin'],'sonora':['son'],'tabasco':['tab'],'tamaulipas':['tamps'],'tlaxcala':['tlax'],'veracruz':['ver'],'veracruz de ignacio de la llave':['ver','veracruz'],'yucatan':['yuc'],'zacatecas':['zac']}
 # Short codes that are also common Spanish words require an explicit territorial cue.
 selected=[e for e in entities if fold(e) in n or any(re.search((r'\b(?:en|estado de)\s+' if alias in ['sin','son','col','tab','mor'] else r'\b')+re.escape(alias)+r'\b',n) for alias in state_aliases.get(fold(e),[]))]
 named=' '+phrase(n)+' '
 for _,m in records:
  title=m.get('titulo','');clean=phrase(title)
  if len(clean)>18 and ' '+clean+' ' in named:
   titles.append(fold(title))
   if m.get('ambito')=='Local' and m.get('entidad') not in selected:selected.append(m.get('entidad'))
 # Place of residence is not the jurisdiction of an act of the federal INE.
 if re.search(r'\bfederal\b|(?:consejo general|resolucion|decision|acto).{0,60}\bine\b',n) and not re.search(r'\bople\b|tribunal estatal|instituto electoral (?:local|del estado)',n):selected=[]
 if len(selected)>1 and re.search(r'\bcompar(?:a|ar|acion|ativo|ativa)\b',n):comparative=True
 if comparative:
  local_target=local_existential and selected and not re.search(r'\ben que\s+(?:estado|entidad)|\bque\s+(?:estados|entidades)|\botra?\s+entidad',n) and any(re.search(r'\b(?:en|de)\s+(?:el estado de\s+)?'+re.escape(fold(entity))+r'\b',n) for entity in selected)
  reference_entities=[] if local_existential else list(selected)
  if not local_target:selected=[]
  titles=[]
  generic=set('existe existen disposicion disposiciones codigo ley local electoral establece partidos politicos concepto ante consejo general ople alguna algun otra otro entidad entidades federativa federativas similar similares comparar compara comparacion'.split())
  geographic={word for entity in entities for word in phrase(entity).split()}
  words=[word for word in words if word not in generic and word not in geographic]
  if local_existential:words=[word for word in words if word not in set('norma normas ley leyes disposicion disposiciones legislacion estatal estatales local locales estado estados contempla contemplan existe existen puede usar uso regula regulan regulen prohibe prohiben prohiban preve preven establece establecen contiene contienen dispone disponen'.split())]
  if re.search(r'representacion\s+politica',n) and re.search(r'prerrogativa|financiamiento|asignacion',n):words=list(dict.fromkeys(['representacion','politica','prerrogativa','financiamiento']+words))

 if not titles and selected:
  local=[m for _,m in records if m.get('entidad') in selected and m.get('ambito')=='Local']
  if 'constitucion' in n:titles=[fold(m['titulo']) for m in local if fold(m['titulo']).startswith('constitucion')]
  elif re.search(r'\brap\b|apelacion|medios de impugnacion|justicia electoral',n):
   special=[m for m in local if fold(m['titulo']).startswith(('ley ','codigo ')) and re.search(r'medios.*impugnacion|justicia electoral|procesal electoral',fold(m['titulo']))]
   titles=[fold(m['titulo']) for m in (special or [m for m in local if fold(m['titulo']).startswith(('ley ','codigo ')) and 'electoral' in fold(m['titulo'])])]
  elif re.search(r'codigo.*electoral|ley.*(?:electoral|instituciones)',n):titles=[fold(m['titulo']) for m in local if fold(m['titulo']).startswith(('ley ','codigo ')) and 'electoral' in fold(m['titulo']) and not re.search(r'medios.*impugnacion|justicia electoral|procesal electoral',fold(m['titulo']))]
 if not titles and not selected and re.search(r'constitucion|\bcpeum\b',n):titles=[aliases['cpeum']]
 if (pes_requested or fiscal_requested) and not titles and not comparative:
  if selected:
   titles=[fold(m['titulo']) for _,m in records if m.get('entidad') in selected and m.get('ambito')=='Local' and authority(m)>=2 and 'electoral' in fold(m['titulo'])]
  else:
   if fiscal_requested:titles=[aliases['rpsf'],aliases['rf']]
   if pes_requested:titles+=[aliases['lgipe']]+([] if fiscal_requested else [fold(m['titulo']) for _,m in records if m.get('ambito')=='Federal' and re.search(r'^reglamento.*quejas.*denuncias',fold(m['titulo'])) and (gender_requested or not re.search(r'violencia|genero|mujer',fold(m['titulo'])))])
  procedure_inferred=True
  expansion=(['fiscalizacion','queja','oficioso','unidad','tecnica'] if fiscal_requested else [])+(['especial','sancionador','audiencia','alegatos'] if pes_requested else [])
  words=list(dict.fromkeys(expansion+words))[:24]
 titles=list(dict.fromkeys(titles))
 if re.search(r'plazo|\bdias\b|termino|vencimiento',n):words=list(dict.fromkeys(words+['plazo','dias','interponer','interposicion']))
 # Intent expansion retrieves governing provisions, not a memorized answer.
 inferred=False
 if not titles and not selected and profile and not comparative:
  titles=[fold(profile['law'])];inferred=True
  if not articles:articles=profile['articles'][:12]
  if not numerals:numerals=profile.get('numerals',[])
  words=list(dict.fromkeys(profile['terms']+words))[:24]
 if not titles and not selected and not comparative:
  if re.search(r'\brap\b|\bapelacion\b|(?=.*impugn)(?=.*(?:errores y omisiones|fiscalizacion))',n):
   titles=[aliases['lgsmime']];inferred=True
   if not articles:articles=['8','7'] if re.search(r'plazo|\bdias\b|tiempo|termino|venc|present|ingres|interpon|fecha|limite|cuando',n) else ['40','3']
  elif re.search(r'(?:requisit|desech|improceden)',n) and re.search(r'impugn|demanda|recurso',n):
   titles=[aliases['lgsmime']];inferred=True
   if not articles:articles=['9','10','8','7']
  elif 'propaganda' in n and not re.search(r'gubernamental|personalizada',n):
   titles=[aliases['lgipe']];inferred=True
   if not articles:articles=['242','3']
  elif re.search(r'salud',n) and re.search(r'constitucion|derecho',n):
   titles=[aliases['cpeum']];inferred=True
   if not articles:articles=['4']
  elif re.search(r'votar|ser votad',n):
   titles=[aliases['cpeum']];inferred=True
   if not articles:articles=['35']
  elif re.search(r'exhaustividad',n):
   titles=[aliases['cpeum']];inferred=True
   if not articles:articles=['17','16']
  elif re.search(r'violencia(?:s)?',n) and re.search(r'genero|mujer',n):
   titles=[aliases['lgamvlv']];inferred=True
   if not articles:articles=['20 bis'] if 'politica' in n else (['6','5'] if re.search(r'tipos|clases',n) else ['5','6'])
 if profile and not selected and any(t.replace('violencias','violencia')==fold(profile['law']).replace('violencias','violencia') for t in titles) and not articles:
  articles=profile['articles'][:12];inferred=True
  if not numerals:numerals=profile.get('numerals',[])
 if not articles and not selected and any('constitucion politica de los estados unidos mexicanos'==t for t in titles):
  if 'salud' in n:articles=['4'];inferred=True
  elif re.search(r'votar|ser votad',n):articles=['35'];inferred=True
  elif re.search(r'cuantos.*articulos|cuantos articulos|cuantos.*conform|cuantos.*constitucion',n):articles=['136','1'];inferred=True
 eligible=[rid for rid,m in records if m.get('ambito')=='Local' and authority(m)>=2 and (not local_existential or not selected or m.get('entidad') in selected)] if comparative else [rid for rid,m in records if m.get('ambito')=='Federal' or m.get('entidad') in selected];matching=[rid for rid,m in records if rid in eligible and law_title(m)]
 if (matching or comparative) and not re.search(r'historic|(?:vigente en|version de|texto de)\s+(?:19|20)\d{2}',n):
  # Prefer a newer dated edition of the same instrument; retain old records and saved citations.
  meta=dict(records);versions={}
  for rid in (eligible if comparative else matching):
   m=meta[rid];instrument=fold(m['titulo']).replace('violencias','violencia');date=max([m.get(k,'') for k in ['fecha_reforma_declarada','fecha_edicion','fecha_publicacion','fecha_emision'] if re.match(r'^\d{4}-\d{2}(?:-\d{2})?$',str(m.get(k) or ''))] or [''])
   versions.setdefault((fold(m.get('entidad','')),instrument),[]).append((date,rid))
  newest=[rid for editions in versions.values() for date,rid in editions if date==max(d for d,_ in editions)]
  if comparative:eligible=newest
  else:matching=newest
 if procedure_inferred and not matching:return []
 if matching:eligible=matching
 if comparative and (re.search(r'codigo|ley|legislacion',n) or (local_existential and 'electoral' in n)):
  codes={rid for rid,m in records if rid in eligible and fold(m['titulo']).startswith(('codigo ','ley ')) and 'electoral' in fold(m['titulo'])}
  code_entities={m.get('entidad') for rid,m in records if rid in codes}
  eligible=[rid for rid,m in records if rid in eligible and (rid in codes or m.get('entidad') not in code_entities)]
 comparison_searched=sorted({m.get('entidad','') for rid,m in records if rid in eligible and m.get('entidad')})
 if not eligible:return []
 columns='h.id,h.record_id,h.page,h.text,r.metadata,r.sha256'
 rows=[];windows=set();targeted=set();locators={};procedure_windows={};procedure_documents=set()
 if pes_requested and matching:
  # Follow the named procedure's section across page continuations. A later chapter
  # is a boundary, not evidence for the special procedure.
  for rid in matching:
   if fiscal_requested and re.search(r'fiscaliz',fold(dict(records)[rid]['titulo'])):continue
   active=False
   for fragment in c.execute('SELECT '+columns+',0 FROM chunks h JOIN records r ON r.id=h.record_id WHERE h.record_id=? ORDER BY h.page,h.id',[rid]):
    value=fragment[3];normalized=fold(value)
    heading=re.search(r'(?m)^[ \t]*(?:del\s+)?procedimiento\s+especial\s+sancionador[ \t]*$',normalized)
    boundary=re.search(r'(?m)^\s*(?:capitulo|titulo|libro)\s+[ivxlc0-9]+\b',normalized)
    start=heading.start() if heading else 0
    if heading:active=True
    if not active:continue
    # fold preserves positions for ordinary accented Spanish text.
    following=re.search(r'(?m)^\s*(?:capitulo|titulo|libro)\s+[ivxlc0-9]+\b',normalized[heading.end():]) if heading else boundary
    end=(heading.end()+following.start()) if heading and following else following.start() if following else len(value)
    snippet=value[start:end].strip()
    if snippet:procedure_windows[fragment[0]]=snippet;procedure_documents.add(rid)
    if following:active=False

 if matching and articles:
  placeholders=','.join('?' for _ in matching)
  fragments=c.execute('SELECT '+columns+',0 FROM chunks h JOIN records r ON r.id=h.record_id WHERE h.record_id IN ('+placeholders+') ORDER BY h.record_id,h.page,h.id',matching).fetchall()
  article_heading=re.compile(r'(?im)^\s*art(?:i\u0301?|í)culo\s*\*?\s*(\d+(?:[oº°])?(?:[ \t]+(?:bis|ter|quater|quinquies))?)(?=[\s.:\-–—]|$)')
  first_articles=set()
  for index,header in enumerate(fragments):
   if toc(header[3]):continue
   for wanted in [match for match in article_heading.finditer(header[3]) if article_key(match.group(1)) in articles and not re.search(r'\.{3,}|…{2,}',header[3][match.end():header[3].find('\n',match.end()) if '\n' in header[3][match.end():] else len(header[3])])]:
    identity=(header[1],article_key(wanted.group(1)))
    if identity in first_articles:continue
    first_articles.add(identity)
    for position in range(index,len(fragments)):
     original=fragments[position]
     if original[1]!=header[1]:break
     text=original[3];start=wanted.start() if position==index else 0;scan=wanted.end() if position==index else 0
     following=next((match for match in article_heading.finditer(text,scan) if article_key(match.group(1))!=article_key(wanted.group(1))),None)
     end=following.start() if following else len(text);snippet=text[start:end].strip()
     if snippet:
      row=(*original[:3],snippet,*original[4:]);rows.append(row);key=(row[0],snippet);windows.add(key);locators[key]='Artículo '+article_key(wanted.group(1)).title()
      if inferred and article_key(wanted.group(1))==articles[0] and position==index:targeted.add(key)
      if any(re.search(r'(?m)^\s*'+number+r'[.)]\s+',snippet) for number in numerals):targeted.add(key)
     if following:break

 if not rows and words:
  terms=words[:16]
  if terms:
   query=' OR '.join('"'+word+'"'+('*' if local_existential else '') for word in terms)
   # Separate candidate pools keep long manuals from displacing all governing laws.
   groups={}
   for rid,m in records:
    if rid in eligible:groups.setdefault((authority(m),fold(m.get('entidad',''))) if comparative else authority(m),[]).append(rid)
   for group in groups.values():
    placeholders=','.join('?' for _ in group)
    rows+=c.execute('SELECT '+columns+',bm25(chunks_fts) AS rank FROM chunks_fts JOIN chunks h ON h.id=chunks_fts.rowid JOIN records r ON r.id=h.record_id WHERE chunks_fts MATCH ? AND h.record_id IN ('+placeholders+') ORDER BY rank LIMIT 80',[query]+group).fetchall()
 # A page continuation keeps its own locator; no distant fragments are stitched.
 rows=list({(row[0],row[3]):row for row in rows}.values());ranked=[]
 for row in rows:
  identifier,rid,page,text,raw,sha,rank=row;m=json.loads(raw)
  if toc(text):continue
  if pes_requested and procedure_inferred and not re.search(r'fiscaliz',fold(m['titulo'])):
   if rid in procedure_documents:
    if identifier not in procedure_windows:continue
    text=procedure_windows[identifier];row=(*row[:3],text,*row[4:])
   elif not (re.search(r'procedimiento\s+especial\s+sancionador',fold(text)) or ('audiencia' in fold(text) and 'alegatos' in fold(text))):continue
  article_match=bool(locators.get((identifier,text))) if windows else any(re.search(r'articulo\s*'+a+r'(?:[oº°])?\b',fold(text)) for a in articles)
  content=fold(text)
  if local_existential and re.search(r'\bsimbolos?\s+patrios?\b',n) and not re.search(r'\bsimbolos?\s+patrios?\b',content):continue
  if comparative and re.search(r'representacion\s+politica',n) and re.search(r'prerrogativa|financiamiento|asignacion',n) and not ('representacion' in content and re.search(r'politic',content) and re.search(r'prerrogativ|financiamient|ministracion|asignacion|economic',content)):continue
  coverage=sum(bool(re.search(r'\b'+re.escape(word)+r'\w*',content)) for word in words)
  if local_existential and coverage<min(2,len(words)):continue
  # Relevance remains necessary; hierarchy does not make an unrelated law applicable.
  if not windows and not coverage:continue
  score=(200 if (identifier,text) in targeted else 0)+(80 if (identifier,text) in windows else 0)+(30 if law_title(m) else 0)+(25 if article_match else 0)+(2 if fold(m.get('situacion_segun_fuente','')).startswith('vigente') else 0)+(4 if m.get('relacion')=='EDICIÓN OFICIAL DE CONSULTA' else 0)
  score+=(100 if inferred and re.match(r'^art(?:i|í)culo\s*\*?\s*\d',text,re.I) else 0)
  if fiscal_requested and law_title(m) and re.search(r'^reglamento.*procedimientos.*sancionadores.*fiscalizacion',fold(m['titulo'])):score+=100
  if pes_requested and re.search(r'alegato',n) and re.search(r'uso\s+de\s+la\s+voz|formular.{0,50}alegatos|alegatos.{0,180}minutos',content,re.S):score+=120
  if comparative and re.search(r'representacion\s+politica',n) and re.search(r'(?:prerrogativ|financiamient|ministracion|asignacion).{0,250}representacion\s+politica|representacion\s+politica.{0,250}(?:prerrogativ|financiamient|ministracion|asignacion)',content,re.S):score+=150
  if local_existential:
   topic_hits=[hit.start() for word in words for hit in re.finditer(r'\b'+re.escape(word)+r'\w*',content)]
   governing=[heading for heading in re.finditer(r'(?m)^\s*articulo\s*\*?\s*(\d+(?:[ \t]+(?:bis|ter|quater))?)',content) if topic_hits and heading.start()<min(topic_hits)]
   if governing:score+=100;locators[(identifier,text)]='Artículo '+governing[-1].group(1).title()
   if re.search(r'no se puede|prohib|no.{0,20}usar|imped',n) and re.search(r'no se emplear|prohib|abstener|prescindir|no podran',content):score+=45
  score+=coverage*15+(authority(m)*12 if coverage>=min(2,len(words)) else 0)
  ranked.append((score,coverage,authority(m),-rank,row,m))
 ranked.sort(key=lambda x:(x[0],x[1],x[2],x[3]),reverse=True);out=[];seen=set()
 matched_entities=sorted({x[5].get('entidad','') for x in ranked if x[5].get('entidad')})
 if comparative:
  # Search every eligible territorial pool, then show distinct jurisdictions rather
  # than spending the whole response on the entity used as the reference.
  diverse=[];territories=set()
  for item in ranked:
   entity=item[5].get('entidad','')
   if entity not in reference_entities and entity not in territories:diverse.append(item);territories.add(entity)
  base=next((x for x in ranked if x[5].get('entidad') in reference_entities),None)
  ranked=diverse[:11]+([base] if base else [])
 elif fiscal_requested and pes_requested:
  first=[];instruments=set()
  for item in ranked:
   instrument=fold(item[5]['titulo'])
   if instrument not in instruments:first.append(item);instruments.add(instrument)
  ranked=first+ranked

 for _,_,_,_,row,m in ranked:
  identifier,rid,page,text,raw,sha,rank=row
  identity=(fold(m['titulo']),fold(m.get('entidad','')),page,phrase(text)) if procedure_inferred or comparative else (sha,page,text)
  if identity in seen:continue
  seen.add(identity);dates='; '.join(k+': '+m[k] for k in ['fecha_emision','fecha_publicacion','fecha_entrada_vigor','fecha_reforma_declarada','fecha_edicion'] if m.get(k))
  context=('Función de fuente: '+('constitucional o convencional' if authority(m)==4 else 'legislación' if authority(m)==3 else 'reglamentaria' if authority(m)==2 else 'acto o disposición administrativa' if authority(m)==1 else 'material institucional de apoyo')+'. Instrumento: '+m.get('tipo_documento','Normativa de referencia')+'. '+m.get('ambito','')+' · '+m.get('entidad','')+'. '+m.get('relacion','')+'. '+m.get('situacion_segun_fuente','')+'. '+dates+'. Catálogo consultado: '+m.get('fecha_consulta','')+'. '+m.get('observaciones','')+' La etiqueta del catálogo no certifica vigencia ni aplicabilidad. Cotejar reformas y transitorios.')[:2000]
  if comparative:context=('Alcance comparativo: se buscó texto en '+str(len(comparison_searched))+' entidades con legislación indexada ('+', '.join(comparison_searched)+'). Entidades con coincidencias: '+(', '.join(matched_entities) or 'ninguna')+'. Entidad de referencia: '+(', '.join(reference_entities) or 'no individualizada')+'. Las fuentes mostradas son una selección; una coincidencia no acredita equivalencia normativa ni inexistencia en las entidades restantes. '+context)[:2000]
  out.append({'documentId':'norm:'+rid,'chunkId':str(identifier)+(':'+locators[(identifier,text)].replace('Artículo ','').replace(' ','-') if (identifier,text) in locators else ''),'caseId':m['titulo'][:500],'title':m['titulo'][:700],'officialUrl':m['url_documento'],'court':(m.get('institucion','')+' · '+m.get('entidad',''))[:200],'year':0,'genre':m.get('tipo_documento','norma')[:100],'pageStart':page,'pageEnd':page,'section':locators.get((identifier,text)) or m.get('identificador_oficial','')[:700] or None,'text':text,'sourceKind':'normative','legalContext':context})
  if comparative and len(json.dumps(out,ensure_ascii=False).encode('utf8'))>120000:out.pop();continue
  if len(out)==(12 if comparative else 4):break
 c.close();return out
try:print(json.dumps(main(),ensure_ascii=False))
except Exception as error:
 print(type(error).__name__+': '+str(error)[:200],file=sys.stderr)
 print('[]')
