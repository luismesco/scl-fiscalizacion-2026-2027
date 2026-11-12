/* Luis Montañez Escobar */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  let latest=null,active=null,configPromise=null,lastKey='',chosenMonths=[],previousPeriod='all';
  const links=['PDF','DOCX','ODT'].map(format=>$('download'+format));
  const selected=()=>latest?{...latest.selection,period:$('documentPeriod').value,months:$('documentPeriod').value==='selected'?[...chosenMonths]:[]}:null;
  const key=()=>JSON.stringify(selected());
  const status=message=>{$('documentStatus').textContent=message;$('documentStatus').hidden=!message;};
  function busy(value){links.forEach(link=>{link.setAttribute('aria-disabled',String(value));link.disabled=value;});$('documentPeriod').disabled=value;$('editMonths').disabled=value;}
  function update(detail){
    latest=detail;$('documentPeriod').querySelector('[value="month"]').textContent=detail.monthLabel;
    const current=key();
    if(active&&current!==lastKey){active.abort();active=null;busy(false);status('Selección modificada. Vuelve a descargar.');}
    lastKey=current;
    $('odtVersion').textContent='';$('odtVersion').hidden=true;
    const s=selected();window.calendarDocumentPeriod={period:s.period,months:[...s.months],month:s.month};$('editMonths').hidden=s.period!=='selected';
    $('documentSelection').textContent=[s.period==='selected'?detail.availableMonths.filter(m=>chosenMonths.includes(m.value)).map(m=>m.label).join(', '):s.period==='month'?detail.monthLabel:'Los 14 meses',detail.entityNames?.length?detail.entityNames.join(', '):'Todas las entidades y ámbito federal',detail.officeLabel||'Todos los cargos',detail.stageLabel||'Todas las etapas',detail.sourceLabel||'Todas las fuentes',s.annex?'Con anexo 1':'Sin anexo 1',s.legalDates?'INE y fechas adicionales':'Sólo fechas del INE'].join(' · ');
    $('documentFilename').textContent=calendarFilename(s,'pdf');
  }
  function complete(selection){return selection.period==='all'&&selection.legalDates&&!selection.entity&&!selection.entities?.length&&!selection.office&&!selection.stage&&!selection.annexFilter&&!selection.query;}
  async function api(){
    if(!configPromise)configPromise=fetch('export-config.json',{cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('No se pudo preparar la descarga.');const c=await r.json();const url=new URL(c.apiBase);if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw Error('No se pudo preparar la descarga.');return url.href.replace(/\/$/,'');}).catch(e=>{configPromise=null;throw e;});
    return configPromise;
  }
  async function json(response){
    const body=await response.json();if(!response.ok)throw Error(body.message||'No se pudo preparar la descarga.');return body;
  }
  function pause(ms,signal){return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});});}
  async function save(response,format,snapshot,signal){
    if(!response.ok)throw Error('No se pudo descargar el archivo.');
    const blob=await response.blob();if(signal.aborted)throw new DOMException('Aborted','AbortError');
    const name=calendarFilename(snapshot,format);
    const objectURL=URL.createObjectURL(blob),a=document.createElement('a');a.href=objectURL;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectURL),60000);
  }
  async function download(format){
    if(active||!latest)return;
    const snapshot=structuredClone(selected()),digest=latest.dataSha256,controller=new AbortController();active=controller;lastKey=key();busy(true);status(`Preparando ${format}…`);
    try{
      if(complete(snapshot)){
        const path=`downloads/Calendario_mensual_2026_2027_${snapshot.annex?'con':'sin'}_anexo_1.${format.toLowerCase()}`;
        await save(await fetch(path,{signal:controller.signal}),format,snapshot,controller.signal);
      }else{
        if(!navigator.onLine)throw Error('Conéctate a internet para preparar esta selección.');
        const base=await api();if(controller.signal.aborted)return;
        const job=await json(await fetch(base+'/exports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({selection:snapshot,dataSha256:digest}),signal:controller.signal}));
        const deadline=Date.now()+240000;let ready=false;
        while(Date.now()<deadline){
          const progress=await json(await fetch(base+'/exports/'+job.id,{signal:controller.signal,cache:'no-store'}));
          if(progress.status==='failed')throw Error(progress.message||'No se pudo preparar esta selección.');
          if(progress.status==='ready'){if(progress.dataSha256!==digest)throw Error('Actualiza la página para descargar la versión vigente.');ready=true;break;}
          await pause(1800,controller.signal);
        }
        if(!ready)throw Error('La preparación está tardando más de lo habitual. Intenta de nuevo.');
        await save(await fetch(base+'/exports/'+job.id+'/'+format.toLowerCase(),{signal:controller.signal}),format,snapshot,controller.signal);
      }
      status(`Descarga iniciada: ${calendarFilename(snapshot,format)}`);
    }catch(error){if(error.name!=='AbortError')status(error.message||'No se pudo preparar la descarga.');}
    finally{if(active===controller){active=null;busy(false);}}
  }
  links.forEach(link=>link.addEventListener('click',event=>{event.preventDefault();download(link.id.replace('download',''));}));
  function countMonths(){const n=$('monthChoices').querySelectorAll('input:checked').length;$('monthSelectionCount').textContent=`${n} ${n===1?'mes':'meses'}`;$('applyMonths').disabled=!n;}
  function closeMonths(){$('monthsDialog').close();$('documentPeriod').focus();}
  $('closeMonths').addEventListener('click',closeMonths);$('monthsDialog').addEventListener('cancel',event=>{event.preventDefault();closeMonths();});
  $('monthChoices').addEventListener('change',countMonths);
  for(const[id,checked]of[['allMonths',true],['noneMonths',false]])$(id).addEventListener('click',()=>{$('monthChoices').querySelectorAll('input').forEach(i=>i.checked=checked);countMonths();});
  $('monthsForm').addEventListener('submit',event=>{event.preventDefault();const values=[...$('monthChoices').querySelectorAll('input:checked')].map(i=>i.value).sort();if(!values.length)return;chosenMonths=values;previousPeriod=values.length===latest.availableMonths.length?'all':'selected';$('documentPeriod').value=previousPeriod;$('documentPeriod').querySelector('[value="selected"]').textContent=previousPeriod==='selected'?`${values.length} ${values.length===1?'mes seleccionado':'meses seleccionados'}`:'Elegir meses…';closeMonths();update(latest);});
  function openMonths(){if(!latest)return;$('documentPeriod').value=previousPeriod;$('monthChoices').replaceChildren(...latest.availableMonths.map(m=>{const label=document.createElement('label');label.className='export-option';const input=document.createElement('input');input.type='checkbox';input.value=m.value;input.checked=chosenMonths.length?chosenMonths.includes(m.value):previousPeriod==='all'||m.value===latest.selection.month;label.append(input,document.createTextNode(m.label));return label;}));countMonths();$('monthsDialog').showModal();}
  $('editMonths').addEventListener('click',openMonths);
  $('documentPeriod').addEventListener('change',()=>{if(!latest)return;if($('documentPeriod').value==='selected')openMonths();else{previousPeriod=$('documentPeriod').value;update(latest);}});
  addEventListener('calendar:selection',event=>update(event.detail));
  if(window.calendarDownloadState)update(window.calendarDownloadState);
})();
