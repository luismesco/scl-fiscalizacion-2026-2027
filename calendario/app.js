/* Calendario electoral 2026–2027 · Luis Montañez Escobar */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const unique = values => [...new Set(values.filter(Boolean))];
  const collator = new Intl.Collator('es-MX', {sensitivity:'base'});
  const sort = values => [...values].sort(collator.compare);
  const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const WEEKDAYS = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
  const STAGES = {
    OAC:{name:'Apoyo de la ciudadanía',full:'Obtención del apoyo de la ciudadanía',color:'var(--oac)',icon:'apoyo',description:'Apoyo para candidaturas independientes. Sus fechas y fiscalización corresponden al anexo 1.'},
    PC:{name:'Precampaña',full:'Precampaña',color:'var(--pc)',icon:'precampana',description:'Actos de precampaña partidista y revisión de sus informes. Consulta el bloque, la entidad y el cargo de cada actuación.'},
    CA:{name:'Campaña',full:'Campaña',color:'var(--ca)',icon:'campana',description:'Inicio y término de campañas, periodos de informes y actuaciones de fiscalización, con alcance por entidad y cargo.'},
    PE:{name:'Jornada y cómputos',full:'Jornada electoral, cómputos y asignación',color:'var(--pe)',icon:'jornada',description:'Jornada electoral y actividades programadas de cómputo o asignación. Un periodo programado no acredita que el acto ya se realizó.'},
    JUR:{name:'Resolución de impugnaciones',full:'Plazos de resolución de medios de impugnación',color:'var(--jur)',icon:'resolucion',description:'Límites para resolver o calificar elecciones, sujetos a sus condiciones. Se distinguen de los plazos para presentar una demanda.'}
  };
  const PREVIEW_STAGE={OAC:'Apoyo',PC:'Precampaña',CA:'Campaña',PE:'Jornada y cómputos',JUR:'Resolución'};
  let DATA, dataDigest='', entities = new Map(), months = [], events = [], intervals = [], rules = [];
  let state = {month:'2026-11',entity:'',entities:[],office:'',stage:'',annexFilter:'',query:'',annex:true,legalDates:true,view:'calendario',format:'grid',all:false,date:'',mapAll:true};
  const entityCodes=()=>state.entities.length?state.entities:(state.entity?[state.entity]:[]);
  const chooseEntities=values=>{const codes=values.length===entities.size?[]:values;state.entities=codes.length>1?[...new Set(codes)].sort():[];state.entity=codes.length===1?codes[0]:'';};
  let dialogOpener = null, mapLoaded = false, toastTimer;
  const captureRegistry=new Map(),captureCache=new Map();let captureOpener=null,captureZoom=1;
  let exportOpener=null;let exportObjectURLs=[];let exportRevision=0;
  const icon = (name, extra='') => `<svg class="icon ${extra}" aria-hidden="true"><use href="assets/icons.svg#${name}"></use></svg>`;
  const stageStyle = stage => `--stage:${STAGES[stage]?.color || 'var(--wine)'}`;
  const dateParts = value => { const [y,m,d] = value.split('-').map(Number);return {y,m,d}; };
  const monthName = month => {const [y,m] = month.split('-').map(Number);return `${MONTHS[m-1]} ${y}`;};
  const fullDate = date => {const {y,m,d}=dateParts(date);return new Intl.DateTimeFormat('es-MX',{dateStyle:'full',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d)));};
  const shortDate = date => {const {y,m,d}=dateParts(date);return `${d} de ${MONTHS[m-1]} de ${y}`;};
  const allowedURL = url => {if(typeof url!=='string'||!url.trim())return '';try{const u=new URL(url,location.href);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}};
  const articleLabel=value=>/^art[ií]culos?\b/i.test(String(value))?String(value):`Artículo ${value}`;
  const variantMatches = e => !Array.isArray(e.variants) || e.variants.includes(state.annex?'A':'B');
  const eventIcon = e => {
    const k=clean(e.kind || e.label);
    if(k.includes('notificacion'))return 'notificacion';if(k.includes('respuesta'))return 'respuesta';
    if(k.includes('comision de fiscalizacion'))return 'comision';if(k.includes('consejo general'))return 'consejo';
    if(k.includes('informe'))return 'informe';if(k.includes('computo'))return 'computos';
    if(k.includes('asignacion'))return 'jornada';return STAGES[e.stage]?.icon||'calendario';
  };
  const eventContext = e => [STAGES[e.stage]?.full || e.stage,e.block?`Bloque ${e.block}`:'',e.period!==null&&e.period!==undefined&&e.period!==''?`Periodo ${e.period}`:''].filter(Boolean).join(' · ');
  const eventTitle = e => {
    const k=e.kind||e.label||'Actuación';
    if(e.stage==='PE'&&e.interval_start&&e.interval_end&&e.interval_start!==e.interval_end&&clean(k).includes('asignacion')){
      if(['start','interval_start','start_boundary'].includes(e.boundary))return `Inicio del periodo programado · ${k}`;
      if(['end','interval_end','end_boundary'].includes(e.boundary))return `Término del periodo programado · ${k}`;
    }
    return k;
  };
  const displayEntity = scope => scope.entity_code==='FED'?'Ámbito federal':scope.entity;
  const sourceKey = s => [s.url,s.title,s.law,s.article,s.locator,s.excerpt,s.role].join('|');
  const sourcesFor = e => {
    const scopeSources=(e._scopes||e.scopes||[]).flatMap(s=>s.sources||[]);
    const list=e._scopes?(scopeSources.length?scopeSources:(e.sources||[])):[...(e.sources||[]),...scopeSources];
    return [...new Map(list.filter(Boolean).map(s=>[sourceKey(s),s])).values()];
  };
  function capturesFor(e) {
    const list=[...(!e._scopes?(e.captures||[]):[]),...(e._scopes||e.scopes||[]).flatMap(s=>s.captures||[]),...sourcesFor(e).flatMap(s=>s.captures||[])];
    list.forEach(c=>captureRegistry.set(c.id,c));return [...new Map(list.map(c=>[c.id,c])).values()];
  }
  const captureLinks=e=>capturesFor(e).map(c=>{
    const roles=sourcesFor(e).filter(s=>(s.captures||[]).some(x=>x.id===c.id)).map(s=>clean(s.role));
    const label=roles.length&&roles.every(r=>r==='cargos de eleccion')?'Ver cargos':'Ver captura';
    return `<button class="capture-button" type="button" data-capture="${escapeHTML(c.id)}">${icon('informe')}${label} · Anexo ${escapeHTML(c.annex)}, página ${escapeHTML(c.page)}${icon('enlace')}</button>`;
  }).join('');
  function sourceBadge(s) {
    if(s.law)return ['Ley',s.institution].filter(Boolean).join(' · ');
    const institution=s.institution==='Instituto Nacional Electoral'?'INE':s.institution||'';
    const type=({ine:'Acuerdo/calendario',law:'Ley',official:'Documento oficial'})[s.type]||s.type||'';
    return [institution,type].filter(Boolean).join(' · ')||'Fuente oficial';
  }
  function sourceLink(s, detailed=false) {
    const url=allowedURL(s.url);const title=s.law||s.title||s.institution||'Documento oficial';
    const article=s.article?articleLabel(s.article):'';
    const locator=s.locator||'';
    const excerpt=Array.isArray(s.excerpt)?s.excerpt.join('\n'):s.excerpt;
    const heading=[title,article].filter(Boolean).join(' · ');
    const link=url?`<a class="source-anchor" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(heading)}${icon('enlace')}</a>`:`<span>${escapeHTML(heading)}</span>`;
    const role=s.role?`<p class="source-role">${escapeHTML(s.role)}</p>`:'';
    const repository=s.repository?`<p class="source-repository">Repositorio de consulta: ${escapeHTML(s.repository)}</p>`:'';
    if(detailed&&(s.law||excerpt))return `<details class="normative-source"><summary><span class="source-badge">${escapeHTML(sourceBadge(s))}</span>${escapeHTML(heading)}</summary><div class="normative-content">${role}${locator?`<p class="source-locator">${escapeHTML(locator)}</p>`:''}${excerpt?`<blockquote>${escapeHTML(excerpt)}</blockquote>`:''}${s.scope_note?`<p class="source-scope-note">${escapeHTML(s.scope_note)}</p>`:''}${link}${repository}</div></details>`;
    return `<div class="source-item"><span class="source-badge">${escapeHTML(sourceBadge(s))}</span>${role}${link}${locator?`<span class="source-locator">${escapeHTML(locator)}</span>`:''}${repository}</div>`;
  }
  function officeMatches(original,selected) {
    if(clean(original)===clean(selected))return true;
    const facets=DATA.officeFacets?.[original];
    return Array.isArray(facets)&&facets.some(facet=>clean(facet)===clean(selected));
  }
  function officeChoices() {
    const originals=[...events,...intervals,...rules].flatMap(record=>record.scopes?.length?record.scopes.map(scope=>scope.office):[record.office]).filter(Boolean);
    const labels=originals.flatMap(original=>[original,...(Array.isArray(DATA.officeFacets?.[original])?DATA.officeFacets[original]:[])]);
    return sort([...new Map(labels.map(label=>[clean(label),label])).values()]);
  }
  function hasINEDate(record,scope) {
    const sources=scope.sources?.length?scope.sources:(record.sources||[]);
    return sources.some(s=>s.type==='ine'&&['Periodos y plazos de fiscalización','Fecha o periodo del calendario'].includes(s.role));
  }
  function filterScopes(record, ignoreMonth=false) {
    if(!variantMatches(record)||(!state.annex&&record.stage==='OAC')||(state.stage&&record.stage!==state.stage))return null;
    const annexStages={'1':'OAC','2':'PC','3':'CA'};
    if(annexStages[state.annexFilter]&&record.stage!==annexStages[state.annexFilter])return null;
    if(state.annexFilter==='otras'&&['OAC','PC','CA'].includes(record.stage))return null;
    const terms=clean(state.query).trim().split(/\s+/).filter(Boolean);
    const base=clean([record.kind,record.label,record.rule,record.condition,record.trigger,eventContext(record)].join(' '));
    const scopes=(record.scopes||[]).filter(s=>{
      if(!state.legalDates&&!hasINEDate(record,s))return false;
      if(entityCodes().length&&!entityCodes().includes(s.entity_code))return false;
      if(state.office&&!officeMatches(s.office,state.office))return false;
      const haystack=base+' '+clean([s.entity,s.office,s.election_scope,...(s.qualifications||[]).map(q=>q.literal)].join(' '));
      return terms.every(t=>haystack.includes(t));
    });
    if(!scopes.length)return null;
    return {...record,_scopes:scopes};
  }
  function filteredEvents(allMonths=false) {return events.filter(e=>allMonths||e.date.startsWith(state.month)).map(e=>filterScopes(e)).filter(Boolean);}
  function filteredIntervals(month=state.month) {return intervals.filter(e=>!month||e.month===month).map(e=>filterScopes(e)).filter(Boolean);}
  function filterRule(rule) {
    const r={...rule,stage:rule.stage||'JUR'};
    if(!r.scopes?.length){
      const name=r.entity||'';const code=r.entity_code||[...entities.values()].find(x=>x.name===name)?.code||'';
      r.scopes=[{entity_code:code,entity:name,office:r.office||'',election_scope:code==='FED'?'Federal':'Local'}];
    }
    return filterScopes(r);
  }
  function scopeGroups(scopes) {
    const byEntity=new Map();
    scopes.forEach(s=>{
      const key=`${s.entity_code}|${s.election_scope}`;
      if(!byEntity.has(key))byEntity.set(key,{name:displayEntity(s),code:s.entity_code,election_scope:s.election_scope,offices:new Set(),qualifications:new Set()});
      byEntity.get(key).offices.add(s.office);
      (s.qualifications||[]).forEach(q=>{if(q.literal)byEntity.get(key).qualifications.add(q.literal);});
    });
    const groups=new Map();
    [...byEntity.values()].sort((a,b)=>collator.compare(a.name,b.name)).forEach(e=>{
      const offices=sort([...e.offices]);const qualifications=sort([...e.qualifications]);const key=JSON.stringify([e.election_scope,offices,qualifications]);
      if(!groups.has(key))groups.set(key,{scope:e.election_scope,offices,qualifications,entities:[]});
      groups.get(key).entities.push(e.name);
    });
    return [...groups.values()];
  }
  function scopesHTML(scopes) {
    return `<div class="scope-list">${scopeGroups(scopes).map(g=>`<div class="scope-group"><span class="scope-badge">${g.scope==='Federal'?'Elección federal':'Elección local'}</span><p class="scope-entities">${escapeHTML(g.entities.join(', '))}</p><p class="scope-offices">${escapeHTML(g.offices.join(' · '))}</p>${g.qualifications.length?`<p class="scope-qualifications">${escapeHTML(g.qualifications.join(' · '))}</p>`:''}</div>`).join('')}</div>`;
  }
  function scopeSummary(e, brief=false) {
    const scopes=e._scopes||e.scopes||[];
    const names=sort(unique(scopes.map(displayEntity)));const offices=sort(unique(scopes.map(s=>s.office)));
    if(brief){
      if(names.length===1)return names[0];
      const federal=names.includes('Ámbito federal'),count=names.length-(federal?1:0);
      return `${count} ${count===1?'entidad':'entidades'}${federal?' + ámbito federal':''} · Ver detalle`;
    }
    return `${names.join(', ')}${offices.length===1?' · '+offices[0]:''}`;
  }
  function scopeAccessible(e) {
    return scopeGroups(e._scopes||e.scopes||[]).map(g=>`${g.scope==='Federal'?'Elección federal':'Elección local'}: ${g.entities.join(', ')}. Cargos: ${g.offices.join(', ')}${g.qualifications.length?'. '+g.qualifications.join(', '):''}`).join('; ');
  }
  function eventBody(e) {
    const programmed=e.interval_start&&e.interval_end&&e.interval_start!==e.interval_end;
    const period=programmed?`<p class="programmed-period"><strong>Periodo programado:</strong> ${escapeHTML(shortDate(e.interval_start))} — ${escapeHTML(shortDate(e.interval_end))}.${clean(e.kind).includes('asignacion')?' Estas fechas delimitan el periodo programado; no acreditan una asignación ya realizada.':''}</p>`:'';
    const sources=sourcesFor(e);
    return `<div class="event-body"><div><h4>Entidad, elección y cargo</h4>${scopesHTML(e._scopes||e.scopes||[])}</div>${period}${e.condition?`<p class="condition">${escapeHTML(e.condition)}</p>`:''}${sources.length?`<div><h4>Fuentes de esta actuación</h4><div class="event-source-links">${sources.map(s=>sourceLink(s,true)).join('')}</div></div>`:''}${capturesFor(e).length?`<div class="capture-buttons">${captureLinks(e)}</div>`:''}</div>`;
  }
  function eventCard(e, open=false) {
    return `<details class="event-card" style="${stageStyle(e.stage)}" ${open?'open':''} data-event-id="${escapeHTML(e.id)}"><summary>${icon(eventIcon(e))}<span><span class="event-meta">${escapeHTML(eventContext(e))}</span><h3>${escapeHTML(eventTitle(e))}</h3><span class="event-summary">${escapeHTML(scopeSummary(e))}</span></span></summary>${eventBody(e)}</details>`;
  }
  function dayEntities(list) {
    const groups=new Map();
    list.forEach(e=>{
      const scopes=e._scopes||e.scopes||[];
      unique(scopes.map(s=>s.entity_code)).forEach(code=>{
        const selected=scopes.filter(s=>s.entity_code===code);
        if(!groups.has(code))groups.set(code,{code,name:entities.get(code)?.name||displayEntity(selected[0]),events:[]});
        groups.get(code).events.push({...e,_scopes:selected});
      });
    });
    return [...groups.values()].sort((a,b)=>a.code==='FED'?1:b.code==='FED'?-1:collator.compare(a.name,b.name));
  }
  function dayEntityCard(group) {
    const silhouette=group.code==='FED'?icon('mapa','entity-silhouette'):`<svg class="entity-silhouette" aria-hidden="true" focusable="false"><use href="assets/estados.svg#${escapeHTML(group.code)}"></use></svg>`;
    const stages=unique(group.events.map(e=>e.stage));
    return `<details class="day-entity" data-day-entity="${escapeHTML(group.code)}"><summary>${silhouette}<span class="day-entity-label"><strong>${escapeHTML(group.name)}</strong><span>${group.events.length} ${group.events.length===1?'actuación':'actuaciones'}</span></span><span class="day-entity-stages" aria-hidden="true">${stages.map(stage=>`<span style="${stageStyle(stage)}">${icon(STAGES[stage]?.icon||'calendario')}</span>`).join('')}</span><span class="day-entity-toggle" aria-hidden="true">+</span></summary><div class="day-entity-events">${group.events.map(e=>eventCard(e,true)).join('')}</div></details>`;
  }
  function groupedDates(list) {const m=new Map();list.forEach(e=>{if(!m.has(e.date))m.set(e.date,[]);m.get(e.date).push(e);});return [...m.entries()].sort(([a],[b])=>a.localeCompare(b));}
  function agendaHTML(list, includeMonth=false) {
    if(!list.length)return '<div class="empty-state"><h3>No hay actuaciones con estos filtros.</h3><p>Prueba con otra entidad, cargo o periodo.</p></div>';
    return groupedDates(list).map(([date,es])=>{const p=dateParts(date);const wd=WEEKDAYS[(new Date(Date.UTC(p.y,p.m-1,p.d)).getUTCDay()+6)%7];return `<section class="agenda-day" aria-label="${escapeHTML(fullDate(date))}"><div class="agenda-date"><strong>${p.d}</strong><span>${includeMonth?MONTHS[p.m-1].slice(0,3)+' '+p.y:wd.slice(0,3)}</span><button class="text-button date-link" type="button" data-date="${date}" aria-label="Abrir detalle del ${escapeHTML(fullDate(date))}">Ver día</button></div><div class="agenda-events">${es.map(e=>eventCard(e)).join('')}</div></section>`;}).join('');
  }
  function renderCalendar() {
    $('monthTitle').textContent=state.all?`${monthName(months[0])} — ${monthName(months[months.length-1])}`:monthName(state.month);$('monthSelect').value=state.month;
    const index=months.indexOf(state.month);$('prevMonth').disabled=index<=0;$('nextMonth').disabled=index>=months.length-1;
    const list=filteredEvents(state.all);const localList=filteredEvents(false);
    const count=groupedDates(list).length;
    $('resultSummary').textContent=`${list.length} ${list.length===1?'actuación':'actuaciones'} · ${count} ${count===1?'fecha con actividad':'fechas con actividad'}${state.all?' en los 14 meses':''}`;
    $('searchAll').textContent=state.all?'Volver al mes seleccionado':'Ver coincidencias en los 14 meses';
    $('gridFormat').setAttribute('aria-pressed',String(state.format==='grid'&&!state.all));$('agendaFormat').setAttribute('aria-pressed',String(state.format==='agenda'||state.all));
    $('calendarGrid').hidden=state.format==='agenda'||state.all;$('agendaList').hidden=state.format!=='agenda'&&!state.all;
    const [year,month]=state.month.split('-').map(Number);const first=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;const last=new Date(Date.UTC(year,month,0)).getUTCDate();
    const dayMap=new Map(groupedDates(localList));
    let html=WEEKDAYS.map((d,i)=>`<div class="weekday"><span class="weekday-full">${escapeHTML(d[0].toUpperCase()+d.slice(1))}</span><span class="weekday-short" aria-label="${d}">${['L','M','X','J','V','S','D'][i]}</span></div>`).join('');
    for(let i=0;i<42;i++){
      const day=i-first+1;
      if(day<1||day>last){html+='<div class="day-cell outside" aria-hidden="true"></div>';continue;}
      const date=`${state.month}-${String(day).padStart(2,'0')}`;const es=dayMap.get(date)||[];const stages=unique(es.map(e=>e.stage));
      const label=`${fullDate(date)}. ${es.length} ${es.length===1?'actuación':'actuaciones'}. Abrir detalle.`;
      html+=`<article class="day-cell ${es.length?'active':''}" aria-label="${escapeHTML(fullDate(date))}"><button class="day-number" data-date="${date}" data-day="${day}" type="button" aria-label="${escapeHTML(label)}">${day}</button><div class="mobile-markers" aria-hidden="true">${stages.slice(0,3).map(s=>`<span style="${stageStyle(s)}">${icon(STAGES[s]?.icon||'calendario')}</span>`).join('')}</div>${es.length?`<span class="mobile-count" aria-hidden="true">${es.length} ${es.length===1?'acto':'actos'}</span>`:''}<div class="cell-event-list">${es.slice(0,2).map(e=>`<button class="cell-event" style="${stageStyle(e.stage)}" type="button" data-date="${date}" aria-label="${escapeHTML(eventContext(e)+'. '+eventTitle(e)+'. '+scopeAccessible(e))}">${icon(eventIcon(e))}<span><span class="mini-stage">${escapeHTML(PREVIEW_STAGE[e.stage]||e.stage)}${e.block?' · bloque '+escapeHTML(e.block):''}</span><strong>${escapeHTML(eventTitle(e))}</strong><small>${escapeHTML(scopeSummary(e,true))}</small></span></button>`).join('')}</div>${es.length>2?`<button class="more-events" type="button" data-date="${date}">Ver los ${es.length} actos →</button>`:''}</article>`;
    }
    $('calendarGrid').innerHTML=html;$('calendarGrid').setAttribute('aria-label',`Calendario de ${monthName(state.month)}`);
    $('agendaList').innerHTML=agendaHTML(list,state.all);
    const empty=!localList.length&&state.format==='grid'&&!state.all;$('emptyMonth').hidden=!empty;
    if(empty){const next=filteredEvents(true).find(e=>e.date>state.month+'-31');$('emptyMonth').innerHTML=`<div class="empty-state"><h3>Sin actuaciones para estos filtros en ${escapeHTML(monthName(state.month))}.</h3><p>Las fechas del resto del periodo siguen disponibles.</p>${next?`<button class="text-button" type="button" data-goto-month="${next.date.slice(0,7)}">Ir a la siguiente fecha: ${escapeHTML(shortDate(next.date))} →</button>`:''}</div>`;}
    const ints=filteredIntervals(state.all?null:state.month);$('monthIntervals').hidden=!ints.length;
    $('monthIntervals').innerHTML=`<h3>Periodos sin día individualizado</h3>${ints.map(intervalCard).join('')}`;
    renderLegend();
  }
  function intervalCard(e) {return `<article class="interval-card"><p class="eyebrow">${escapeHTML(monthName(e.month))} · sin día individualizado</p><h4>${escapeHTML(e.label||e.kind||'Periodo de resolución')}</h4>${scopesHTML(e._scopes||e.scopes||[])}<p>${escapeHTML(e.rule||'')}</p>${e.condition?`<p class="condition">${escapeHTML(e.condition)}</p>`:''}${sourcesFor(e).map(s=>sourceLink(s,true)).join('')}</article>`;}
  function renderLegend() {
    $('stageLegend').innerHTML=Object.entries(STAGES).filter(([s])=>state.annex||s!=='OAC').map(([s,t])=>`<button class="legend-item" style="${stageStyle(s)}" type="button" data-stage="${s}" aria-pressed="${state.stage===s}">${icon(t.icon)}${escapeHTML(t.name)}</button>`).join('');
  }
  function renderGuide() {
    $('guideCards').innerHTML=Object.entries(STAGES).filter(([s])=>state.annex||s!=='OAC').map(([s,t])=>`<article class="guide-card" style="${stageStyle(s)}">${icon(t.icon)}<h3>${escapeHTML(t.full)}</h3><p>${escapeHTML(t.description)}</p></article>`).join('');
    const rosters=DATA.rosters||[];
    if(Array.isArray(rosters))$('rosterGuide').innerHTML=rosters.filter(r=>state.annex||!['OAC','Apoyo'].includes(r.stage)).map(r=>{
      const entityNames=(r.entities||[]).map(e=>typeof e==='string'?e:e.entity||e.name).filter(Boolean);
      return `<details class="roster-card"><summary>${escapeHTML(STAGES[r.stage]?.full||r.stage||r.phase||'Bloque')} · bloque ${escapeHTML(r.block)}</summary><p>${escapeHTML(entityNames.join(', '))}</p>${(r.entities||[]).filter(e=>typeof e==='object').map(e=>`<p><strong>${escapeHTML(e.entity||e.name)}:</strong> ${escapeHTML((e.offices||[]).map(o=>typeof o==='string'?o:o.office||o.literal).join(' · '))}</p>`).join('')}</details>`;
    }).join('');
  }
  function renderFilters() {
    $('stateFilter').value=state.entities.length?'multiple':state.entity;$('stateFilter').querySelector('[value="multiple"]').textContent=state.entities.length?`${state.entities.filter(c=>c!=='FED').length} entidades${state.entities.includes('FED')?' y ámbito federal':''}`:'Seleccionar varias entidades…';$('officeFilter').value=state.office;$('stageFilter').value=state.stage;$('annexFilter').value=state.annexFilter;$('searchInput').value=state.query;$('annexToggle').checked=state.annex;
    $('legalDatesToggle').checked=state.legalDates;
    const chips=[];
    if(!state.legalDates)chips.push(['legalDates','Sólo calendarios del INE']);
    if(state.entities.length)chips.push(['entities',entityCodes().map(c=>entities.get(c)?.name||c).join(', ')]);
    if(state.entity)chips.push(['entity',entities.get(state.entity)?.name||state.entity]);
    if(state.office)chips.push(['office',state.office]);if(state.stage)chips.push(['stage',STAGES[state.stage]?.full||state.stage]);
    if(state.query)chips.push(['query',`“${state.query}”`]);
    if(state.annexFilter)chips.push(['annexFilter',{'1':'Anexo 1 · Apoyo','2':'Anexo 2 · Precampaña','3':'Anexo 3 · Campaña','otras':'Otras fuentes'}[state.annexFilter]]);
    $('activeFilters').innerHTML=chips.map(([key,label])=>`<span class="filter-chip"><span>${escapeHTML(label)}</span><button data-clear="${key}" type="button" aria-label="Quitar filtro ${escapeHTML(label)}">×</button></span>`).join('');
    [...$('stageFilter').options].forEach(o=>{if(o.value==='OAC')o.hidden=!state.annex;});
    ['PDF','DOCX','ODT'].forEach(format=>{
      const link=$('download'+format);
      link.setAttribute('aria-label',`Descargar calendario ${format} ${state.annex?'con':'sin'} anexo 1`);
    });
    window.calendarDownloadState={selection:{entity:state.entity,entities:[...state.entities],office:state.office,stage:state.stage,annexFilter:state.annexFilter,query:state.query,annex:state.annex,legalDates:state.legalDates,month:state.month},dataSha256:dataDigest,monthLabel:monthName(state.month),availableMonths:months.map(value=>({value,label:monthName(value)})),entityNames:entityCodes().map(c=>entities.get(c)?.name||c),officeLabel:state.office,stageLabel:STAGES[state.stage]?.name||'',sourceLabel:state.annexFilter?$('annexFilter').selectedOptions[0]?.textContent:''};
    dispatchEvent(new CustomEvent('calendar:selection',{detail:{...window.calendarDownloadState,records:filteredEvents().map(e=>({id:e.id,scopes:e._scopes.map(s=>({entity_code:s.entity_code,office:s.office}))}))}}));
  }
  function renderLegal() {
    const list=rules.map(filterRule).filter(Boolean);$('relativeCount').textContent=`${list.length} ${list.length===1?'regla':'reglas'}`;
    $('relativeRules').innerHTML=list.length?list.map(r=>`<details class="relative-rule"><summary>${escapeHTML(unique((r._scopes||[]).map(displayEntity)).join(', '))} · ${escapeHTML(r.label||r.kind||'Regla de resolución')}</summary><div class="relative-rule-content">${scopesHTML(r._scopes||[])}<p>${escapeHTML(r.rule||'')}</p>${r.trigger?`<p><strong>Hecho del que depende:</strong> ${escapeHTML(r.trigger)}</p>`:''}${r.condition?`<p class="condition">${escapeHTML(r.condition)}</p>`:''}${sourcesFor(r).map(s=>sourceLink(s,true)).join('')}</div></details>`).join(''):'<p class="section-intro">No hay reglas relativas con los filtros seleccionados.</p>';
    const pool=[...(DATA.legal?.sources||[]),...(DATA.sources||[])];
    if(!pool.length)events.forEach(e=>pool.push(...sourcesFor(e)));
    const sources=[...new Map(pool.filter(s=>s.url).map(s=>[s.url+'|'+(s.law||s.title),s])).values()];
    $('sourceLinks').innerHTML=sources.map(s=>{const url=allowedURL(s.url);return url?`<a class="document-link" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${icon('informe')}<span><span class="source-badge">${escapeHTML(sourceBadge(s))}</span>${escapeHTML(s.law||s.title||'Documento oficial')}${s.article?`<small>Artículo ${escapeHTML(s.article)}</small>`:''}</span>${icon('enlace')}</a>`:'';}).join('');
  }
  function mapCategory(e) {
    const offices=(e.offices||[]).map(o=>clean(typeof o==='string'?o:o.literal));
    if(offices.some(o=>o.includes('gubernatura')))return '#6b1b2a';
    return '#cbb896';
  }
  async function loadMap() {
    if(mapLoaded)return;
    const response=await fetch('assets/mexico.svg');if(!response.ok)throw new Error('map');
    $('mexicoMap').innerHTML=await response.text();mapLoaded=true;
    $('mexicoMap').querySelectorAll('path[data-cve-ent]').forEach(path=>{
      const entity=[...entities.values()].find(e=>String(e.inegi).padStart(2,'0')===path.dataset.cveEnt);
      if(!entity)return;
      path.dataset.entityCode=entity.code;path.style.setProperty('--map-color',mapCategory(entity));path.setAttribute('role','button');path.setAttribute('tabindex','0');path.setAttribute('aria-label',`${entity.name}. Cargos: ${(entity.offices||[]).join(', ')}. Consultar agenda.`);
      const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=`${entity.name} · ${(entity.offices||[]).join(', ')}`;path.append(title);
      path.addEventListener('click',()=>selectEntity(entity.code));
      path.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();selectEntity(entity.code);}if(e.key==='Escape')hideMapTooltip();});
      path.addEventListener('pointerenter',e=>showMapTooltip(entity,e.clientX,e.clientY));path.addEventListener('pointermove',e=>positionMapTooltip(e.clientX,e.clientY));path.addEventListener('pointerleave',hideMapTooltip);
      path.addEventListener('focus',()=>{const rect=path.getBoundingClientRect();showMapTooltip(entity,rect.x+rect.width/2,rect.y+rect.height/2);});path.addEventListener('blur',hideMapTooltip);
    });
    updateMapSelection();
  }
  function showMapTooltip(e,x,y) {$('mapTooltip').innerHTML=`<strong>${escapeHTML(e.name)}</strong>${escapeHTML((e.offices||[]).join(' · '))}`;$('mapTooltip').hidden=false;positionMapTooltip(x,y);}
  function positionMapTooltip(x,y) {const el=$('mapTooltip');el.style.left=Math.max(8,Math.min(x+12,innerWidth-el.offsetWidth-8))+'px';el.style.top=Math.max(8,Math.min(y+12,innerHeight-el.offsetHeight-8))+'px';}
  function hideMapTooltip() {$('mapTooltip').hidden=true;}
  function updateMapSelection() {$('mexicoMap').querySelectorAll('[data-entity-code]').forEach(p=>{p.classList.toggle('selected',entityCodes().includes(p.dataset.entityCode));p.setAttribute('aria-pressed',String(entityCodes().includes(p.dataset.entityCode)));});$('federalMap').classList.toggle('selected',state.entity==='FED');}
  function selectEntity(code) {chooseEntities([code]);state.mapAll=true;state.date='';writeRoute();render();hideMapTooltip();if(innerWidth<768)$('territoryPanel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
  function renderTerritory() {
    updateMapSelection();const entity=entities.get(state.entity);
    if(!entity){$('territoryPanel').innerHTML=`<div class="territory-heading"><h3>Entidades y ámbito federal</h3></div><div class="territory-states">${[...entities.values()].filter(e=>!state.entities.length||state.entities.includes(e.code)).map(e=>`<button class="state-choice" type="button" data-entity="${escapeHTML(e.code)}" style="--map-color:${e.code==='FED'?'var(--wine)':mapCategory(e)}"><span class="state-dot" aria-hidden="true"></span>${escapeHTML(e.name)}${icon('flecha')}</button>`).join('')}</div>`;return;}
    const list=filteredEvents(state.mapAll);const ints=filteredIntervals(state.mapAll?null:state.month);
    $('territoryPanel').innerHTML=`<div class="territory-heading"><p class="eyebrow">${state.entity==='FED'?'Elección federal':'Elecciones locales'}</p><h3>${escapeHTML(entity.name)}</h3><div class="office-tags">${(entity.offices||[]).map(o=>`<span class="office-tag">${escapeHTML(o)}</span>`).join('')}</div></div><div class="territory-controls"><span>${list.length} actuaciones${state.mapAll?' en 14 meses':' en '+escapeHTML(monthName(state.month))}</span><label><input type="checkbox" id="mapAllDates" ${state.mapAll?'checked':''}>Todos los meses</label></div>${agendaHTML(list,true)}${ints.length?`<section class="interval-section"><h3>Periodos sin día individualizado</h3>${ints.map(intervalCard).join('')}</section>`:''}`;
  }
  function readRoute() {
    const raw=location.hash.slice(1);if(!raw||!raw.includes('='))return;
    const p=new URLSearchParams(raw);
    state.month=months.includes(p.get('mes'))?p.get('mes'):months[0];
    chooseEntities(unique((p.get('entidades')||p.get('entidad')||'').split(',')).filter(c=>entities.has(c)));
    state.office=p.get('cargo')||'';state.stage=STAGES[p.get('etapa')]?p.get('etapa'):'';
    state.query=p.get('buscar')||'';state.annex=p.get('anexo')!=='sin';
    state.legalDates=p.get('adicionales')!=='sin';
    state.annexFilter=['1','2','3','otras'].includes(p.get('fuente'))?p.get('fuente'):'';
    if(state.annexFilter==='1')state.annex=true;
    state.view=p.get('vista')==='mapa'?'mapa':'calendario';state.format=p.get('formato')==='agenda'?'agenda':'grid';state.all=p.get('todo')==='1';
    const date=p.get('fecha')||'';state.date=/^\d{4}-\d{2}-\d{2}$/.test(date)&&months.includes(date.slice(0,7))?date:'';
    if(!state.annex&&state.stage==='OAC')state.stage='';
  }
  function writeRoute(push=false) {
    const p=new URLSearchParams({mes:state.month,vista:state.view,anexo:state.annex?'con':'sin'});
    if(state.entities.length)p.set('entidades',state.entities.join(','));else if(state.entity)p.set('entidad',state.entity);if(state.office)p.set('cargo',state.office);if(state.stage)p.set('etapa',state.stage);if(state.query)p.set('buscar',state.query);if(state.format!=='grid')p.set('formato',state.format);if(state.all)p.set('todo','1');if(state.date)p.set('fecha',state.date);
    if(state.annexFilter)p.set('fuente',state.annexFilter);
    if(!state.legalDates)p.set('adicionales','sin');
    history[push?'pushState':'replaceState'](null,'','#'+p.toString());
  }
  function render() {
    renderFilters();$('calendarView').setAttribute('aria-pressed',String(state.view==='calendario'));$('mapView').setAttribute('aria-pressed',String(state.view==='mapa'));
    $('calendarSection').hidden=state.view!=='calendario';$('mapSection').hidden=state.view!=='mapa';
    renderCalendar();renderGuide();renderLegal();
    if(state.view==='mapa'){loadMap().catch(()=>{$('mexicoMap').innerHTML='<p class="section-intro">Puedes seleccionar la entidad en la lista.</p>';});renderTerritory();}
    if(state.date)openDate(state.date,false);else if($('dateDialog').open)$('dateDialog').close();
  }
  function setCaptureZoom(value) {
    captureZoom=Math.max(.5,Math.min(16,Number(value)));$('captureZoom').value=Math.round(captureZoom*100);$('zoomValue').textContent=Math.round(captureZoom*100)+' %';$('captureZoom').setAttribute('aria-valuetext',Math.round(captureZoom*100)+' por ciento');$('captureImage').style.width=(captureZoom*100)+'%';
  }
  async function openCapture(id,opener) {
    captureOpener=opener||document.activeElement;const c=captureRegistry.get(id);if(!c)return;
    $('captureTitle').textContent=c.title||`Anexo ${c.annex} · página ${c.page}`;$('captureLoading').textContent='Cargando captura…';$('captureLoading').hidden=false;$('captureImage').hidden=true;$('zoomOriginal').disabled=true;
    if(!$('captureDialog').open)$('captureDialog').showModal();
    const params=new URLSearchParams(location.hash.slice(1));params.set('captura',id);history.replaceState(null,'','#'+params.toString());
    try{
      let content=captureCache.get(id);if(!content){const response=await fetch(c.url);if(!response.ok)throw new Error('capture');content=await response.json();if(!/^data:image\/png;base64,/.test(content.data_uri||''))throw new Error('image');captureCache.set(id,content);}
      $('captureImage').src=content.data_uri;await $('captureImage').decode();$('captureImage').alt=content.title||c.title||'Página original del anexo del INE';$('captureImage').hidden=false;$('captureLoading').hidden=true;$('zoomOriginal').disabled=false;
      $('captureOfficial').href=allowedURL(content.source_url||c.source_url||'https://repositoriodocumental.ine.mx/');$('captureDownload').href=content.data_uri;$('captureDownload').download=`INE-Anexo-${content.annex||c.annex}-pagina-${content.page||c.page}.png`;
      setCaptureZoom(1);$('captureViewport').scrollTo(0,0);
    }catch{$('captureLoading').textContent='No fue posible cargar la captura. Comprueba tu conexión y vuelve a abrirla.';}
  }
  function closeCapture() {$('captureDialog').close();const p=new URLSearchParams(location.hash.slice(1));p.delete('captura');history.replaceState(null,'','#'+p.toString());captureOpener?.focus();}
  const stageAnnex=stage=>({OAC:'1',PC:'2',CA:'3'})[stage]||'otras';
  function exportValues(group) {return [...$('exportForm').querySelectorAll(`[data-export-group="${group}"] input:checked`)].map(input=>input.value);}
  function exportSelection() {
    const selected={entities:new Set(exportValues('entities')),stages:new Set(exportValues('stages')),annexes:new Set(exportValues('annexes')),offices:exportValues('offices')};
    const period=$('exportForm').querySelector('[name="exportPeriod"]:checked')?.value;const onlyMonth=period==='month',chosenMonths=new Set(exportValues('months'));
    const terms=$('exportQuery').checked?clean(state.query).split(/\s+/).filter(Boolean):[];
    const result=[];
    events.forEach(e=>{
      if(!selected.stages.has(e.stage)||!selected.annexes.has(stageAnnex(e.stage))||(onlyMonth&&!e.date.startsWith(state.month))||(period==='selected'&&!chosenMonths.has(e.date.slice(0,7))))return;
      const variant=selected.annexes.has('1')?'A':'B';if(e.variants&&!e.variants.includes(variant))return;
      const base=clean([e.kind,e.condition,eventContext(e)].join(' '));
      (e.scopes||[]).forEach(scope=>{
        if(!$('exportLegalDates').checked&&!hasINEDate(e,scope))return;
        if(!selected.entities.has(scope.entity_code)||!selected.offices.some(office=>officeMatches(scope.office,office)))return;
        const haystack=base+' '+clean([scope.entity,scope.office,scope.election_scope,...(scope.qualifications||[]).map(q=>q.literal)].join(' '));
        if(!terms.every(t=>haystack.includes(t)))return;
        result.push({event:e,scope});
      });
    });
    return result;
  }
  function clearExportDownloads(){exportObjectURLs.forEach(url=>URL.revokeObjectURL(url));exportObjectURLs=[];$('exportDownloads').hidden=true;$('exportDownloads').innerHTML='';}
  function updateExportPreview() {$('exportMonthField').hidden=$('exportForm').querySelector('[name="exportPeriod"]:checked')?.value!=='selected';exportRevision++;clearExportDownloads();const count=exportSelection().length;$('exportPreview').textContent=`${count.toLocaleString('es-MX')} ${count===1?'entrada':'entradas'} de fecha, actuación, entidad y cargo.`;$('downloadICS').disabled=!count;$('downloadICS').textContent='Preparar .ics';}
  function exportOptions(id,values,selected) {$(id).innerHTML=values.map(([value,label])=>`<label class="export-option" data-option-text="${escapeHTML(clean(label))}"><input type="checkbox" value="${escapeHTML(value)}" ${selected.has(value)?'checked':''}><span>${escapeHTML(label)}</span></label>`).join('');}
  function openExport() {
    exportOpener=document.activeElement;
    $('exportLegalDates').checked=state.legalDates;
    const entityValues=[...entities.values()].filter(e=>e.code!=='FED').sort((a,b)=>collator.compare(a.name,b.name));entityValues.push(entities.get('FED'));
    exportOptions('exportEntities',entityValues.map(e=>[e.code,e.name]),new Set(entityCodes().length?entityCodes():entityValues.map(e=>e.code)));
    exportOptions('exportStages',Object.entries(STAGES).map(([key,v])=>[key,v.full]),new Set(state.stage?[state.stage]:Object.keys(STAGES).filter(s=>state.annex||s!=='OAC')));
    const annexes=[['1','Anexo 1 · Apoyo de la ciudadanía'],['2','Anexo 2 · Precampaña'],['3','Anexo 3 · Campaña'],['otras','Otras fuentes · Jornada, cómputos, asignación e impugnaciones']];
    exportOptions('exportAnnexes',annexes,new Set(state.annexFilter?[state.annexFilter]:annexes.map(v=>v[0]).filter(a=>state.annex||a!=='1')));
    const offices=officeChoices();
    exportOptions('exportOffices',offices.map(o=>[o,o]),new Set(state.office?offices.filter(o=>clean(o)===clean(state.office)):offices));
    $('exportEntitySearch').value='';$('exportOfficeSearch').value='';$('exportMonthLabel').textContent=monthName(state.month);const chosenPeriod=window.calendarDocumentPeriod||{period:'all',months:[]};exportOptions('exportMonths',months.map(m=>[m,monthName(m)]),new Set(chosenPeriod.period==='selected'?chosenPeriod.months:chosenPeriod.period==='month'?[state.month]:months));$('exportForm').querySelector(`[name="exportPeriod"][value="${chosenPeriod.period}"]`).checked=true;
    $('exportQueryLabel').hidden=!state.query;$('exportQuery').checked=!!state.query;$('exportQueryLabel').querySelector('span').textContent=`Aplicar también la búsqueda actual: “${state.query}”`;
    updateExportPreview();$('exportDialog').showModal();
  }
  function closeExport() {exportRevision++;$('exportDialog').close();clearExportDownloads();exportOpener?.focus();}
  function icsEscape(value) {return String(value??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
  function foldICS(line) {
    const encoder=new TextEncoder();let chunk='',bytes=0;const lines=[];
    for(const character of line){const size=encoder.encode(character).length;if(bytes+size>75){lines.push(chunk);chunk=' '+character;bytes=1+size;}else{chunk+=character;bytes+=size;}}
    lines.push(chunk);return lines.join('\r\n');
  }
  async function stableUID(e,s) {
    const text=JSON.stringify([e.id,e.date,e.stage,e.block,e.period,s.entity_code,s.election_scope,s.office]);
    if(crypto.subtle){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,40)+'@calendario-electoral-2026-2027';}
    let h=2166136261;for(const c of text){h=Math.imul(h^c.codePointAt(0),16777619);}return(h>>>0).toString(16)+'-'+encodeURIComponent(text)+'@calendario-electoral-2026-2027';
  }
  function publicDateLink(e,s,capture) {
    const url=new URL(location.href);url.hash=new URLSearchParams({mes:e.date.slice(0,7),vista:'calendario',anexo:e.stage==='OAC'?'con':'sin',entidad:s.entity_code,cargo:s.office,etapa:e.stage,fecha:e.date,...(capture?{captura:capture.id}:{})}).toString();return url.href;
  }
  async function downloadICS() {
    const selection=exportSelection();if(!selection.length)return;const revision=exportRevision;
    const button=$('downloadICS');button.disabled=true;button.textContent='Preparando…';
    try{
      const now=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
      const header=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Luis Montañez Escobar//Calendario electoral 2026-2027//ES','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:'+icsEscape('Calendario electoral 2026–2027')].map(foldICS).join('\r\n')+'\r\n';
      const footer='END:VCALENDAR\r\n',encoder=new TextEncoder(),limit=900000;const parts=[];let current={text:header,bytes:encoder.encode(header).length,count:0,dates:new Set()};
      for(const{event:e,scope:s}of selection){
        if(revision!==exportRevision)return;
        const {y,m,d}=dateParts(e.date);const end=new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10).replace(/-/g,'');
        const scoped={...e,_scopes:[s]};const sourceList=sourcesFor(scoped);const captures=capturesFor(scoped);
        const description=[eventContext(e),`${s.election_scope==='Federal'?'Elección federal':'Elección local'} · ${displayEntity(s)} · ${s.office}`];
        if(e.interval_start&&e.interval_end&&e.interval_start!==e.interval_end)description.push(`Periodo programado: ${e.interval_start} a ${e.interval_end}. Las fechas programadas no acreditan por sí mismas la realización del acto.`);
        if(e.condition)description.push('Condición: '+e.condition);
        (s.qualifications||[]).forEach(q=>{if(q.literal)description.push('Alcance: '+q.literal);});
        sourceList.forEach(src=>{description.push([sourceBadge(src),src.law||src.title,src.article?articleLabel(src.article):'',src.locator].filter(Boolean).join(' · '));if(src.excerpt)description.push('Extracto literal: '+(Array.isArray(src.excerpt)?src.excerpt.join('\n'):src.excerpt));if(src.scope_note)description.push(src.scope_note);if(src.repository)description.push('Repositorio de consulta: '+src.repository);if(src.url)description.push(src.url);});
        captures.forEach(c=>description.push(`${c.title||'Captura del original INE'}: ${publicDateLink(e,s,c)}`));
        const appLink=publicDateLink(e,s);description.push('Consulta de la fecha: '+appLink);
        const lines=['BEGIN:VEVENT','UID:'+await stableUID(e,s),'DTSTAMP:'+now,'DTSTART;VALUE=DATE:'+e.date.replace(/-/g,''),'DTEND;VALUE=DATE:'+end,
          'SUMMARY:'+icsEscape([eventTitle(e),displayEntity(s),s.office].join(' · ')),'DESCRIPTION:'+icsEscape(description.join('\n')),'URL:'+appLink,
          'X-EVENT-ID;VALUE=TEXT:'+icsEscape(e.id),'X-ENTITY-CODE;VALUE=TEXT:'+icsEscape(s.entity_code),'X-OFFICE;VALUE=TEXT:'+icsEscape(s.office),'X-STAGE;VALUE=TEXT:'+icsEscape(e.stage),'TRANSP:TRANSPARENT','END:VEVENT'];
        const eventText=lines.map(foldICS).join('\r\n')+'\r\n',eventBytes=encoder.encode(eventText).length;
        if(encoder.encode(header).length+eventBytes+encoder.encode(footer).length>limit)throw new Error('entry-size');
        if(current.count&&current.bytes+eventBytes+encoder.encode(footer).length>limit){parts.push({...current,text:current.text+footer});current={text:header,bytes:encoder.encode(header).length,count:0,dates:new Set()};}
        current.text+=eventText;current.bytes+=eventBytes;current.count++;current.dates.add(e.date);
      }
      if(current.count)parts.push({...current,text:current.text+footer});
      if(revision!==exportRevision)return;clearExportDownloads();const files=parts.map((part,index)=>{const blob=new Blob([part.text],{type:'text/calendar;charset=utf-8'});const url=URL.createObjectURL(blob);exportObjectURLs.push(url);return {url,name:calendarFilename({entities:exportValues('entities').length===entities.size?[]:exportValues('entities'),period:$('exportForm').querySelector('[name="exportPeriod"]:checked')?.value||'all',month:state.month,months:exportValues('months'),annex:exportValues('annexes').includes('1'),legalDates:$('exportLegalDates').checked},'ics').replace(/\.ics$/,parts.length>1?`_parte_${index+1}_de_${parts.length}.ics`:'.ics'),count:part.count,dates:part.dates.size,bytes:blob.size};});
      if(files.length===1){const a=document.createElement('a');a.href=files[0].url;a.download=files[0].name;document.body.append(a);a.click();a.remove();}
      $('exportDownloads').hidden=false;$('exportDownloads').innerHTML=`<h3>${files.length===1?'Archivo preparado':files.length+' partes preparadas'}</h3><p>Importa ${files.length===1?'el archivo':'todas las partes en el mismo calendario'}. Las partes mantienen todas las entradas y sus fuentes.</p>${files.length>1?'<p>Google Calendar admite archivos de hasta 1 MB; cada parte es menor a ese límite. <a href="https://support.google.com/calendar/answer/45654?hl=es" target="_blank" rel="noopener noreferrer">Ayuda de Google Calendar</a></p>':''}<div class="export-part-links">${files.map((file,i)=>`<a class="export-part" href="${file.url}" download="${escapeHTML(file.name)}"><strong>Descargar ${files.length===1?'archivo':'parte '+(i+1)+' de '+files.length}</strong><span>${file.count.toLocaleString('es-MX')} ${file.count===1?'entrada':'entradas'} · ${file.dates} ${file.dates===1?'fecha':'fechas'} · ${Math.ceil(file.bytes/1000)} kB</span></a>`).join('')}</div>`;
      if(files.length>1)$('exportDownloads').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});showToast(`${selection.length.toLocaleString('es-MX')} ${selection.length===1?'entrada':'entradas'} en ${files.length} ${files.length===1?'archivo':'partes'}.`);
    }finally{button.disabled=!exportSelection().length;button.textContent='Preparar .ics';}
  }
  function openDate(date,push=true,opener=null) {
    if(opener)dialogOpener=opener;state.date=date;if(push)writeRoute(true);
    const list=filteredEvents(true).filter(e=>e.date===date),groups=dayEntities(list),localCount=groups.filter(g=>g.code!=='FED').length;
    const scope=[localCount?`${localCount} ${localCount===1?'entidad':'entidades'}`:'',groups.some(g=>g.code==='FED')?'ámbito federal':''].filter(Boolean).join(' y ');
    $('dialogTitle').textContent=fullDate(date);$('dialogSummary').textContent=`${list.length} ${list.length===1?'actuación':'actuaciones'}${scope?' · '+scope:''}${entityCodes().length||state.office||state.stage||state.annexFilter||state.query?' con los filtros aplicados':''}`;
    $('dialogEvents').innerHTML=list.length?groups.map(dayEntityCard).join(''):'<div class="empty-state"><h3>No hay actuaciones con los filtros aplicados.</h3><p>Puedes cambiar los filtros para consultar esta fecha.</p></div>';
    $('dateDialog').scrollTop=0;
    if(!$('dateDialog').open)$('dateDialog').showModal();
  }
  function closeDate() {state.date='';writeRoute();$('dateDialog').close();dialogOpener?.focus();}
  function showToast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
  function changeMonth(delta){const index=months.indexOf(state.month)+delta;if(index<0||index>=months.length)return;state.month=months[index];state.all=false;state.date='';writeRoute();render();}
  function openEntities(){
    const current=entityCodes();
    $('entityChoices').innerHTML=[...entities.values()].map(e=>`<label class="export-option" data-entity-name="${escapeHTML(clean(e.name))}"><input type="checkbox" name="entity" value="${e.code}" ${!current.length||current.includes(e.code)?'checked':''}>${escapeHTML(e.name)}</label>`).join('');
    $('entitySearch').value='';countEntities();$('entitiesDialog').showModal();
  }
  function countEntities(){const inputs=[...$('entityChoices').querySelectorAll('input:checked')],local=inputs.filter(i=>i.value!=='FED').length;$('entitySelectionCount').textContent=`${local} entidades${inputs.some(i=>i.value==='FED')?' y ámbito federal':''}`;$('applyEntities').disabled=!inputs.length;}
  function closeEntities(){$('entitiesDialog').close();renderFilters();$('stateFilter').focus();}
  function bind() {
    $('filterForm').addEventListener('submit',e=>e.preventDefault());
    $('jumpDownloads').addEventListener('click',()=>{$('downloads').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});$('downloads').focus({preventScroll:true});});
    $('closeEntities').addEventListener('click',closeEntities);$('entitiesDialog').addEventListener('cancel',e=>{e.preventDefault();closeEntities();});
    $('entitiesForm').addEventListener('submit',e=>{e.preventDefault();const codes=[...$('entityChoices').querySelectorAll('input:checked')].map(i=>i.value);if(!codes.length)return;chooseEntities(codes);state.date='';$('entitiesDialog').close();writeRoute();render();$('stateFilter').focus();});
    $('entityChoices').addEventListener('change',countEntities);
    for(const[id,checked]of[['allEntities',true],['noneEntities',false]])$(id).addEventListener('click',()=>{$('entityChoices').querySelectorAll('input').forEach(i=>i.checked=checked);countEntities();});
    $('entitySearch').addEventListener('input',()=>{const q=clean($('entitySearch').value);$('entityChoices').querySelectorAll('label').forEach(l=>l.hidden=!l.dataset.entityName.includes(q));});
    [['stateFilter','entity'],['officeFilter','office'],['stageFilter','stage'],['annexFilter','annexFilter']].forEach(([id,key])=>$(id).addEventListener('change',()=>{if(key==='entity'){if($(id).value==='multiple'){openEntities();return;}chooseEntities($(id).value?[$(id).value]:[]);}else state[key]=$(id).value;if(key==='annexFilter'&&state.annexFilter==='1')state.annex=true;state.date='';writeRoute();render();}));
    let searchTimer;$('searchInput').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.query=$('searchInput').value;state.date='';writeRoute();render();},180);});
    $('annexToggle').addEventListener('change',()=>{state.annex=$('annexToggle').checked;if(!state.annex&&state.stage==='OAC')state.stage='';if(!state.annex&&state.annexFilter==='1')state.annexFilter='';writeRoute();render();});
    $('legalDatesToggle').addEventListener('change',()=>{state.legalDates=$('legalDatesToggle').checked;state.date='';writeRoute();render();});
    $('clearFilters').addEventListener('click',()=>{chooseEntities([]);state.office='';state.stage='';state.annexFilter='';state.query='';state.legalDates=true;state.all=false;state.date='';writeRoute();render();});
    $('calendarView').addEventListener('click',()=>{state.view='calendario';writeRoute();render();});$('mapView').addEventListener('click',()=>{state.view='mapa';writeRoute();render();});
    $('gridFormat').addEventListener('click',()=>{state.format='grid';state.all=false;writeRoute();render();});$('agendaFormat').addEventListener('click',()=>{state.format='agenda';writeRoute();render();});
    $('monthSelect').addEventListener('change',()=>{state.month=$('monthSelect').value;state.all=false;state.date='';writeRoute();render();});
    $('prevMonth').addEventListener('click',()=>changeMonth(-1));$('nextMonth').addEventListener('click',()=>changeMonth(1));
    $('searchAll').addEventListener('click',()=>{state.all=!state.all;writeRoute();render();});
    $('clearMap').addEventListener('click',()=>{chooseEntities([]);writeRoute();render();});$('federalMap').addEventListener('click',()=>selectEntity('FED'));
    document.addEventListener('click',e=>{
      const capture=e.target.closest('[data-capture]');if(capture){openCapture(capture.dataset.capture,capture);return;}
      const date=e.target.closest('[data-date]');if(date){openDate(date.dataset.date,true,date);return;}
      const stage=e.target.closest('[data-stage]');if(stage){state.stage=state.stage===stage.dataset.stage?'':stage.dataset.stage;writeRoute();render();return;}
      const entity=e.target.closest('[data-entity]');if(entity){selectEntity(entity.dataset.entity);return;}
      const clear=e.target.closest('[data-clear]');if(clear){if(clear.dataset.clear==='entities')chooseEntities([]);else state[clear.dataset.clear]=clear.dataset.clear==='legalDates'?true:'';writeRoute();render();return;}
      const go=e.target.closest('[data-goto-month]');if(go){state.month=go.dataset.gotoMonth;state.all=false;writeRoute();render();}
      const anchor=e.target.closest('a[href^="#"]');if(anchor){const target=document.getElementById(anchor.getAttribute('href').slice(1));if(target){e.preventDefault();target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}}
    });
    document.addEventListener('change',e=>{if(e.target.id==='mapAllDates'){state.mapAll=e.target.checked;renderTerritory();}});
    $('calendarGrid').addEventListener('keydown',e=>{const button=e.target.closest('[data-day]');if(!button)return;const moves={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};if(moves[e.key]){e.preventDefault();$('calendarGrid').querySelector(`[data-day="${Number(button.dataset.day)+moves[e.key]}"]`)?.focus();}});
    $('closeDialog').addEventListener('click',closeDate);$('dateDialog').addEventListener('cancel',e=>{e.preventDefault();closeDate();});
    $('dateDialog').addEventListener('click',e=>{if(e.target===$('dateDialog')){const r=$('dateDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDate();}});
    $('shareDate').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);showToast('Enlace copiado.');}catch{showToast('Puedes copiar el enlace desde la barra de direcciones.');}});
    $('closeCapture').addEventListener('click',closeCapture);$('captureDialog').addEventListener('cancel',e=>{e.preventDefault();closeCapture();});
    $('captureZoom').addEventListener('input',()=>setCaptureZoom(Number($('captureZoom').value)/100));$('zoomIn').addEventListener('click',()=>setCaptureZoom(captureZoom+.25));$('zoomOut').addEventListener('click',()=>setCaptureZoom(captureZoom-.25));$('zoomReset').addEventListener('click',()=>{setCaptureZoom(1);$('captureViewport').scrollTo(0,0);});$('zoomOriginal').addEventListener('click',()=>{const image=$('captureImage'),viewport=$('captureViewport');if(image.naturalWidth&&viewport.clientWidth){setCaptureZoom(image.naturalWidth/viewport.clientWidth);viewport.scrollTo(0,0);}});
    $('openExport').addEventListener('click',openExport);$('closeExport').addEventListener('click',closeExport);$('exportDialog').addEventListener('cancel',e=>{e.preventDefault();closeExport();});
    $('exportForm').addEventListener('submit',e=>{e.preventDefault();downloadICS().catch(()=>showToast('No fue posible preparar el archivo. Vuelve a intentarlo.'));});
    $('exportForm').addEventListener('change',updateExportPreview);
    $('exportForm').addEventListener('click',e=>{const all=e.target.closest('[data-export-all]'),none=e.target.closest('[data-export-clear]');const group=all?.dataset.exportAll||none?.dataset.exportClear;if(group){$('exportForm').querySelectorAll(`[data-export-group="${group}"] input`).forEach(i=>{i.checked=!!all;});updateExportPreview();}});
    $('exportForm').addEventListener('input',e=>{const group=e.target.dataset.exportSearch;if(group){const q=clean(e.target.value);$('exportForm').querySelectorAll(`[data-export-group="${group}"] .export-option`).forEach(label=>{label.hidden=!label.dataset.optionText.includes(q);});}});
    // Keep keyboard focus inside the uppermost dialog, including its final viewport.
    const topDialog=()=>[$('captureDialog'),$('monthsDialog'),$('entitiesDialog'),$('exportDialog'),$('dateDialog')].find(d=>d.open);
    const focusable=d=>[...d.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')].filter(el=>!el.disabled&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
    document.addEventListener('keydown',e=>{const d=topDialog();if(!d)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(d===$('captureDialog'))closeCapture();else if(d===$('monthsDialog'))$('closeMonths').click();else if(d===$('entitiesDialog'))closeEntities();else if(d===$('exportDialog'))closeExport();else closeDate();return;}if(e.key==='Tab'){const list=focusable(d),first=list[0],last=list.at(-1);if(!first){e.preventDefault();d.focus();return;}if(e.shiftKey&&(document.activeElement===first||!d.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!d.contains(document.activeElement))){e.preventDefault();first.focus();}}},true);
    document.addEventListener('focusin',e=>{const d=topDialog();if(d&&!d.contains(e.target))focusable(d)[0]?.focus();},true);
    const pointers=new Map();let pinchDistance=0,pinchZoom=1;
    const viewport=$('captureViewport');
    viewport.addEventListener('pointerdown',e=>{if($('captureImage').hidden)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});viewport.setPointerCapture(e.pointerId);if(pointers.size===2){const[a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);pinchZoom=captureZoom;}});
    viewport.addEventListener('pointermove',e=>{const previous=pointers.get(e.pointerId);if(!previous)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2&&pinchDistance){const[a,b]=[...pointers.values()];setCaptureZoom(pinchZoom*Math.hypot(a.x-b.x,a.y-b.y)/pinchDistance);}else{viewport.scrollLeft-=e.clientX-previous.x;viewport.scrollTop-=e.clientY-previous.y;}});
    const release=e=>{pointers.delete(e.pointerId);pinchDistance=0;};viewport.addEventListener('pointerup',release);viewport.addEventListener('pointercancel',release);
    addEventListener('hashchange',()=>{readRoute();render();});addEventListener('popstate',()=>{readRoute();render();});addEventListener('scroll',hideMapTooltip,{passive:true});
    addEventListener('online',()=>{$('offlineStatus').textContent='Conexión disponible.';});addEventListener('offline',()=>{$('offlineStatus').textContent='Consulta disponible sin conexión después de la primera visita.';});
  }
  async function init() {
    try{
      const response=await fetch('data/calendar.json');if(!response.ok)throw new Error('data');const dataText=await response.text();DATA=JSON.parse(dataText);
      dataDigest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(dataText)))].map(b=>b.toString(16).padStart(2,'0')).join('');
      months=DATA.months||Array.from({length:14},(_,i)=>{const d=new Date(Date.UTC(2026,10+i,1));return d.toISOString().slice(0,7);});
      events=(DATA.events||[]).filter(e=>/^\d{4}-\d{2}-\d{2}$/.test(e.date)).sort((a,b)=>a.date.localeCompare(b.date));intervals=DATA.intervals||[];rules=DATA.rules||[];
      events.forEach(capturesFor);
      (DATA.states||[]).forEach(e=>entities.set(e.code,{...e,offices:(e.offices||[]).map(o=>typeof o==='string'?o:o.literal)}));
      if(!entities.has('FED'))entities.set('FED',DATA.federal||{code:'FED',name:'Ámbito federal',offices:sort(unique(events.flatMap(e=>e.scopes||[]).filter(s=>s.entity_code==='FED').map(s=>s.office)))});
      const stateOptions=[...entities.values()].filter(e=>e.code!=='FED').sort((a,b)=>collator.compare(a.name,b.name));stateOptions.push(entities.get('FED'));
      $('stateFilter').innerHTML='<option value="">Todas las entidades y ámbito federal</option><option value="multiple">Seleccionar varias entidades…</option>'+stateOptions.map(e=>`<option value="${escapeHTML(e.code)}">${escapeHTML(e.name)}</option>`).join('');
      const officeOptions=officeChoices();
      $('officeFilter').innerHTML='<option value="">Todos los cargos</option>'+sort(officeOptions).map(o=>`<option>${escapeHTML(o)}</option>`).join('');
      $('stageFilter').innerHTML='<option value="">Todos los periodos y actuaciones</option>'+Object.entries(STAGES).map(([s,t])=>`<option value="${s}">${escapeHTML(t.full)}</option>`).join('');
      $('monthSelect').innerHTML=months.map(m=>`<option value="${m}">${escapeHTML(monthName(m))}</option>`).join('');
      state.month=months[0];readRoute();bind();$('loadState').hidden=true;$('application').hidden=false;render();
      const initialCapture=new URLSearchParams(location.hash.slice(1)).get('captura');if(initialCapture)openCapture(initialCapture,null);
      if(window.top===window&&'serviceWorker'in navigator&&['https:','http:'].includes(location.protocol)&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname))){
        navigator.serviceWorker.register('sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{$('offlineStatus').textContent='Puedes volver a consultar esta página sin conexión después de la primera visita.';}).catch(()=>{});
      }
    }catch(error){$('loadState').innerHTML='<div class="notice"><h2>No fue posible cargar el calendario.</h2><p>Comprueba tu conexión y vuelve a intentarlo.</p><button class="text-button" type="button" onclick="location.reload()">Reintentar</button></div>';}
  }
  init();
})();
