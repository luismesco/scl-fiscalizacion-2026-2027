#!/usr/bin/env node
// Ingesta de una versión estenográfica como documento nuevo del corpus
// (server/data/corpus.sqlite), un pasaje por página, con cita por página.
//
// Uso:
//   node server/scripts/ingest-text.mjs --text documents/CGex202611-11-VE.txt \
//     --doc sesion-cg-20261111-ve \
//     --title "Versión estenográfica · Sesión Extraordinaria Urgente del Consejo General · 11 de noviembre de 2026" \
//     --pdf-url https://repositoriodocumental.ine.mx/xmlui/bitstream/handle/123456789/190925/CGex202611-11-VE.pdf \
//     [--status "Versión estenográfica"] [--corpus <ruta>] [--dry-run]
//
// El .txt es la extracción del PDF oficial con `pdftotext` (una página por
// separador de formulario). No requiere poppler en tiempo de construcción:
// el PDF no se descarga, la cita enlaza a la fuente oficial del INE.
// Idempotente: borra todas las filas con ese doc y las vuelve a insertar,
// con ids deterministas (sha1 de doc + página), así que cada ejecución deja
// el corpus en el mismo estado. Antes de escribir hace una copia de
// seguridad: corpus.sqlite.bak-AAAAMMDD-HHMMSS. Inserta en `passages` y en
// la tabla FTS `search`. No reconstruye el corpus desde los PDF.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, copyFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '../..');
const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
const textArg = opt('--text');
const doc = opt('--doc');
const title = opt('--title');
const status = opt('--status') || 'Versión estenográfica';
const pdfUrl = opt('--pdf-url');
const corpusPath = resolve(opt('--corpus') || resolve(root, 'server/data/corpus.sqlite'));
const dryRun = argv.includes('--dry-run');
if (!textArg || !doc || !title) {
  console.error('ingest-text: faltan --text, --doc o --title');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(doc)) {
  console.error('ingest-text: --doc debe ser un identificador [a-z0-9-]');
  process.exit(1);
}
const textPath = resolve(textArg);
if (!existsSync(textPath)) {
  console.error('ingest-text: no existe el texto: ' + textPath);
  process.exit(1);
}

const raw = readFileSync(textPath, 'utf8');
const pages = raw.split('\x0c').map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length >= 40);
if (!pages.length) {
  console.error('ingest-text: sin páginas con texto en ' + textPath);
  process.exit(1);
}

const db = new DatabaseSync(corpusPath);
const before = db.prepare('SELECT count(*) n FROM passages').get().n;
const beforeDoc = db.prepare('SELECT count(*) n FROM passages WHERE doc=?').get(doc).n;
console.log(JSON.stringify({text: textPath, doc, pages: pages.length, passagesBefore: before, docBefore: beforeDoc, dryRun}));
if (dryRun) process.exit(0);

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const backupPath = corpusPath + '.bak-' + stamp.slice(0, 8) + '-' + stamp.slice(8);
copyFileSync(corpusPath, backupPath);
console.log('ingest-text: copia de seguridad en ' + backupPath);

const url = pdfUrl || ('documents/' + basename(textPath).replace(/\.txt$/, '.pdf'));
const delSearch = db.prepare('DELETE FROM search WHERE id IN (SELECT id FROM passages WHERE doc=?)');
const delPassages = db.prepare('DELETE FROM passages WHERE doc=?');
const insPassage = db.prepare('INSERT INTO passages(id,doc,title,status,page,locator,url,text) VALUES (?,?,?,?,?,?,?,?)');
const insSearch = db.prepare('INSERT INTO search(id,title,text) VALUES (?,?,?)');
db.exec('BEGIN');
try {
  delSearch.run(doc);
  delPassages.run(doc);
  pages.forEach((text, i) => {
    const page = i + 1;
    const id = createHash('sha1').update(doc + ':' + page).digest('hex').slice(0, 20);
    insPassage.run(id, doc, title, status, page, 'Página ' + page, url + '#page=' + page, text);
    insSearch.run(id, title, text);
  });
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('ingest-text: error, se deshizo la transacción:', err.message);
  process.exit(1);
}

const after = db.prepare('SELECT count(*) n FROM passages').get().n;
const docCount = db.prepare('SELECT count(*) n FROM passages WHERE doc=?').get(doc).n;
const searchDoc = db.prepare('SELECT count(*) n FROM search WHERE id IN (SELECT id FROM passages WHERE doc=?)').get(doc).n;
const expected = before - beforeDoc + pages.length;
if (after !== expected || docCount !== pages.length || searchDoc !== pages.length) {
  console.error(JSON.stringify({error: 'conteo inesperado', after, expected, docCount, searchDoc}));
  process.exit(1);
}
console.log(JSON.stringify({ok: true, passagesAfter: after, docCount, searchDoc, backup: backupPath}));
