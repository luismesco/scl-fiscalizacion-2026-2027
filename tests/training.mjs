// Autor: Luis Montañez Escobar
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const {retrieve,groundedClaims,answer,server}=await import('../server/index.mjs');
const rows=retrieve('¿Cómo se capturan los movimientos y evidencias de una póliza en el manual recibido en noviembre?');
assert.ok(rows.some(r=>r.doc==='manual-capacitacion'),'La consulta debe recuperar el manual recibido el 17 de noviembre');
assert.ok(retrieve('¿Cómo se capturan las evidencias?',[],['manual']).every(r=>r.doc==='manual'),'Respetar una versión individual seleccionada');
const before=new DatabaseSync(resolve(root,'server/data/corpus.sqlite'),{readOnly:true}).prepare('SELECT count(*) n FROM passages').get().n;
execFileSync(process.execPath,[resolve(root,'server/scripts/ingest-training.mjs')]);
const db=new DatabaseSync(resolve(root,'server/data/corpus.sqlite'),{readOnly:true});
assert.equal(db.prepare('SELECT count(*) n FROM passages').get().n,before,'La ingesta repetida no debe duplicar fragmentos');
assert.equal(db.prepare("SELECT count(*) n FROM passages WHERE id LIKE 'training-%'").get().n,720);
assert.equal(db.prepare("SELECT count(*) n FROM passages WHERE id LIKE 'training-%' AND (url='' OR locator='')").get().n,0);
const speech=db.prepare("SELECT * FROM passages WHERE doc='grabacion-capacitacion' LIMIT 1").get();
assert.ok(speech.status.includes('provisional'));
assert.equal(groundedClaims({claims:[{text:'Afirmación literal',citations:[{id:speech.id,quote:speech.text.slice(0,60)}]}]},[speech]).length,0,'No certificar citas textuales de transcripciones sin cotejo');
assert.ok(db.prepare("SELECT * FROM passages WHERE doc='manual' LIMIT 1").get(),'Conservar el manual anterior');
assert.ok(db.prepare("SELECT * FROM passages WHERE doc='faq' LIMIT 1").get(),'Conservar FAQ ya publicado');
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{const url='http://127.0.0.1:'+server.address().port;const h=await fetch(url+'/api/health').then(r=>r.json());assert.equal(h.training.fragments,720);assert.equal(h.training.manualPages,139);assert.equal(h.training.demos,8);assert.equal(h.training.received,'2026-11-17');const media=await fetch(url+'/documents/capacitacion/demo-8.mp4',{headers:{Range:'bytes=0-63'}});assert.equal(media.status,206);assert.equal((await media.arrayBuffer()).byteLength,64);assert.equal(media.headers.get('content-type'),'video/mp4');assert.equal((await fetch(url+'/server/data/training-passages.json')).status,404);console.log('APROBADO: recuperación, versiones, idempotencia, citas provisionales, salud y video por rangos');}finally{await new Promise(r=>server.close(r))}
