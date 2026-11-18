/* Autor: Luis Montañez Escobar */
'use strict';
(() => {
 const T=window.SCL_TRAINING;
 const legacyRender=renderModules,legacyOpen=openModule;
 const source=(doc,page,label)=>`<button type="button" class="text-button" data-pdf="${doc}" data-page="${page}">${esc(label)}</button>`;
 const time=n=>{n=Math.floor(n);return `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`};
 const heading=document.querySelector('#operacion .count-label');
 const search=document.querySelector('#operacion .search');
 search.insertAdjacentHTML('beforebegin',`<div class="training-edition"><div><span class="badge">Material recibido · 17 nov 2026</span><p>Consulta la tarea, sus requisitos y el resultado esperado. Cada recorrido remite al manual y a la capacitación.</p></div><label for="manualEdition">Versión del recorrido<select id="manualEdition"><option value="received">Manual recibido · 139 páginas</option><option value="previous">Manual de referencia · 174 páginas</option></select></label></div>`);
 const received=()=>document.getElementById('manualEdition').value==='received';
 renderModules=function(){
  if(!received()){heading.textContent='16 apartados · 174 páginas';legacyRender();return}
  heading.textContent='13 recorridos · 139 páginas';
  const q=norm($('moduleSearch').value);
  const tasks=T.tasks.filter(t=>norm(JSON.stringify(t)).includes(q));
  $('modules').innerHTML=tasks.map(t=>`<button type="button" class="module-button training-task" data-module="${t.id}"><span class="module-top"><span>${String(t.id).padStart(2,'0')}</span><span>pp. ${t.start}–${t.end}</span></span><strong>${esc(t.title)}</strong><span class="training-task-result">${esc(t.result)}</span><span class="module-bottom">${t.demo?'Incluye demostración · ':''}Abrir recorrido ↗</span></button>`).join('')||'<p class="empty" role="status">No hay recorridos con ese término.</p>';
 };
 openModule=function(id){
  if(!received())return legacyOpen(id);
  const t=T.tasks.find(t=>t.id===id);if(!t)return;
  showDetail(t.title,`Manual recibido el 17 de noviembre · páginas ${t.start}–${t.end}`,`<div class="training-route"><p class="training-route-intro">${esc(t.result)}</p><dl class="training-requirements"><div><dt>Quién lo realiza</dt><dd>${esc(t.profile)}</dd></div><div><dt>Antes de comenzar</dt><dd>${esc(t.needs)}</dd></div></dl><h3>Secuencia de consulta y operación</h3><ol class="training-steps">${t.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><div class="training-result"><strong>Qué revisar al terminar</strong><p>${esc(t.result)}</p></div>${t.note?`<p class="warning-text">${esc(t.note)}</p>`:''}<div class="training-source-actions">${source('manual-capacitacion',t.start,'Leer el apartado · página '+t.start)}${source('capacitacion',t.slide,'Ver capacitación · diapositiva '+t.slide)}${t.demo?`<button class="primary" type="button" data-training-video="demo-${t.demo}">Ver demostración ↗</button>`:''}</div><p class="source-line">Síntesis de consulta del manual recibido; no reemplaza sus instrucciones completas. La disponibilidad de las opciones depende del perfil, la contabilidad y la temporalidad.</p></div>`);
 };
 $('moduleSearch').oninput=()=>renderModules();
 $('manualEdition').onchange=()=>{renderModules();$('moduleSearch').focus()};
 document.querySelector('#operacion .intro').textContent='Recorre las tareas del manual recibido el 17 de noviembre. Puedes cambiar a la versión anterior y consultar ambos documentos con sus propios localizadores.';
 const comparisons=T.tasks.map(t=>`<tr><th scope="row">${esc(t.title)}</th><td>${t.old.map(id=>{const m=D.modules.find(x=>x.id===id);return source('manual',m.start,`${m.title} · pp. ${m.start}–${m.end}`)}).join('')}</td><td>${source('manual-capacitacion',t.start,`Páginas ${t.start}–${t.end}`)}</td></tr>`).join('');
 $('modules').insertAdjacentHTML('afterend',`<details class="reading-note training-versions"><summary>Consultar un tema en los dos manuales SCL</summary><p>Correspondencia de temas e índices para localizar cada lectura. La agrupación y el cambio de paginación no acreditan equivalencia de instrucciones ni eliminación de funciones. Las versiones conservan sus páginas originales.</p><div class="table-wrap"><table><thead><tr><th>Tema</th><th>Referencia de 174 páginas</th><th>Material recibido de 139 páginas</th></tr></thead><tbody>${comparisons}</tbody></table></div><p>${source('manual-capacitacion',2,'Índice del manual recibido')}${source('manual',2,'Índice del manual anterior')}</p></details>`);
 const chapters=T.segments.map((s,i)=>`<button class="text-button" type="button" data-training-video="recording-${i}">Parte ${i+1} · ${time(s.start)}–${time(s.end)} ↗</button>`).join('');
 $('documentCards').insertAdjacentHTML('beforeend',`<article class="document-card training-recording"><span class="badge">Capacitación · 13 nov 2026</span><h3>Grabación de la capacitación</h3><p>Sesión completa de 1 hora y 31 minutos, disponible en ${T.segments.length} partes consecutivas. Las referencias de la grabación conservan el tiempo de la sesión completa.</p><div class="training-chapters">${chapters}</div><p class="source-line">La transcripción de consulta es provisional; coteja las intervenciones directamente en la grabación.</p></article>`);
 $('documentCards').insertAdjacentHTML('afterend',`<details class="reading-note training-demos"><summary>Ocho demostraciones para consultar por tarea</summary><p>Videos de la presentación de capacitación. No contienen narración; acompaña su lectura con el manual y la diapositiva correspondiente.</p><div class="training-demo-list">${T.demos.map(d=>`<article><div><strong>${esc(d.title)}</strong><small>Diapositiva ${d.slide}</small></div><button type="button" class="text-button" data-training-video="demo-${d.id}">Reproducir ↗</button>${source('capacitacion',d.slide,'Ver diapositiva')}</article>`).join('')}</div></details>`);
 function openTrainingVideo(id,start=0){
  let file,title,caption;
  if(id.startsWith('demo-')){const d=T.demos.find(x=>'demo-'+x.id===id);if(!d)return;file=d.file;title=d.title;caption='Demostración de la capacitación · diapositiva '+d.slide+' · sin narración'}
  else{const i=Number(id.split('-')[1]),s=T.segments[i];if(!s)return;file=s.file;title='Capacitación SCL · parte '+(i+1);caption=`Grabación del 13 de noviembre · tiempo de la sesión ${time(s.start)}–${time(s.end)}`}
  releasePdf();showDetail(title,caption,`<video class="training-video" id="trainingPlayer" controls playsinline preload="metadata" src="${file}${start?'#t='+start:''}">Tu navegador no puede reproducir este video. Usa el enlace de descarga.</video><p class="source-line">${id.startsWith('demo-')?'La demostración se consulta como material de capacitación. Verifica los datos y opciones en el manual y en el sistema habilitado.':'Las referencias textuales de esta sesión son provisionales. Confirma el audio antes de atribuir una frase.'}</p><a class="source" href="${file}" download>Descargar esta parte ↓</a>${id.startsWith('recording-')?`<div class="training-chapters">${chapters}</div>`:''}`);
 }
 document.addEventListener('click',e=>{const b=e.target.closest('[data-training-video]');if(b)openTrainingVideo(b.dataset.trainingVideo,Number(b.dataset.time)||0)});
 $('detailDialog').addEventListener('close',()=>{$('trainingPlayer')?.pause()});
 // Los enlaces profundos desde el contexto documental abren la parte y el tiempo correctos.
 const query=new URLSearchParams(location.search);if(query.has('training-video'))openTrainingVideo(query.get('training-video'),Number(query.get('t'))||0);
 QUESTIONS.push(
 ['En el manual recibido, ¿qué elementos se revisan al capturar una póliza?',['Información general, movimientos y evidencias','Solo el importe','Solo el nombre del archivo'],0,'El procedimiento describe la información general, los movimientos y las evidencias de la póliza; revisar el apartado completo.','manual-capacitacion',75],
 ['Según la página 97, ¿qué contabilidades permiten entrar a Prorrateo?',['Todas, sin distinción','Concentradora o Precandidatura de Representación Proporcional','Solo casas de precampaña'],1,'La regla de acceso del manual recibido identifica esas contabilidades; no extiende el acceso a cualquier otra.','manual-capacitacion',97],
 ['Un botón de nuevo registro está deshabilitado. ¿Qué consulta orienta la revisión?',['Crear un usuario distinto','Ignorar la alerta','Revisar perfil, temporalidad y estado del informe en el anexo'],2,'El anexo reúne las alertas y sus causas; identificar la que corresponde antes de actuar.','manual-capacitacion',138],
 ['¿Dónde se consulta la temporalidad en el manual recibido?',['Gestión Electoral > Temporalidad','Dentro de cada archivo de evidencias','Solo en el catálogo de cuentas'],0,'El apartado describe la consulta de temporalidades y las rutas con o sin contabilidad seleccionada.','manual-capacitacion',134],
 ['¿Qué permite concluir que el manual recibido tenga 139 páginas y el anterior 174?',['Que se eliminaron 35 funciones','Que deben cotejarse sus apartados e instrucciones','Que cambió automáticamente la normativa'],1,'La diferencia de extensión permite identificar las versiones; por sí sola no acredita eliminación de funciones ni cambio normativo.','manual-capacitacion',2]
 );
 renderQuiz();
 document.querySelector('#fuentes').insertAdjacentHTML('beforeend',`<div class="notice"><strong>Material de capacitación recibido el 17 de noviembre de 2026</strong><p>Manual de 139 páginas, presentación de 70 diapositivas y grabación de la sesión del 13 de noviembre. La fecha de recepción identifica el paquete; no acredita por sí sola aprobación normativa ni habilitación de funciones.</p>${source('manual-capacitacion',1,'Consultar manual recibido')}${source('capacitacion',1,'Consultar presentación')}</div>`);
 const summary=document.querySelector('#panorama');if(summary)summary.insertAdjacentHTML('beforeend',`<div class="notice"><strong>Recorridos actualizados con el material de capacitación recibido</strong><p>El manual de 139 páginas y las demostraciones se incorporan al recorrido operativo. El manual de 174 páginas y los antecedentes mantienen sus propias referencias.</p><a class="source" href="#operacion">Abrir recorridos de operación →</a></div>`);
 renderModules();
})();
