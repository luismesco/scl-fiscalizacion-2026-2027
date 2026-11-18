// Autor: Luis Montañez Escobar
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const rows=JSON.parse(readFileSync(resolve(root,'server/data/training-passages.json'),'utf8'));
if(rows.length!==720||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Inventario de capacitación inconsistente');
for(const r of rows)if(!r.id.startsWith('training-')||!r.text||!r.locator||!r.url.startsWith('documents/'))throw Error('Fuente de capacitación inválida');
const db=new DatabaseSync(resolve(root,'server/data/corpus.sqlite'));
db.exec('BEGIN');
try{
 db.exec("DELETE FROM search WHERE id IN (SELECT id FROM passages WHERE id LIKE 'training-%'); DELETE FROM passages WHERE id LIKE 'training-%'");
 const p=db.prepare('INSERT INTO passages(id,doc,title,status,page,locator,url,text) VALUES(?,?,?,?,?,?,?,?)');
 const s=db.prepare('INSERT INTO search(id,title,text) VALUES(?,?,?)');
 for(const r of rows){p.run(r.id,r.doc,r.title,r.status,r.page,r.locator,r.url,r.text);s.run(r.id,r.title,r.text)}
 db.exec('COMMIT');
}catch(e){db.exec('ROLLBACK');throw e}
if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Integridad del índice');
console.log(JSON.stringify({training:rows.length,passages:db.prepare('SELECT count(*) n FROM passages').get().n}));
