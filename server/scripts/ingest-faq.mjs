#!/usr/bin/env node
// Ingesta del FAQ del SCL (documents/faq-scl.md) en server/data/corpus.sqlite.
//
// Uso:
//   node server/scripts/ingest-faq.mjs [--corpus <ruta>] [--faq <ruta>] [--dry-run]
//
// Sin argumentos usa las rutas del repo (relativas a este script).
// Idempotente: borra todas las filas con doc='faq' y las vuelve a insertar,
// así que cada ejecución deja el corpus en el mismo estado.
// Antes de escribir hace una copia de seguridad:
//   server/data/corpus.sqlite.bak-AAAAMMDD-HHMMSS
// Inserta en `passages` y en la tabla FTS `search` (tabla independiente,
// por eso hay que insertar en ambas). No reconstruye el corpus desde los PDF.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, copyFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '../..');
const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
const faqPath = resolve(opt('--faq') || resolve(root, 'documents/faq-scl.md'));
const corpusPath = resolve(opt('--corpus') || resolve(root, 'server/data/corpus.sqlite'));
const dryRun = argv.includes('--dry-run');

function parseFaq(text) {
  // Una entrada por encabezado `## `; el título es la pregunta y el resto es el cuerpo.
  const entries = [];
  for (const part of text.split(/^## /m).slice(1)) {
    const lines = part.split('\n');
    const question = (lines[0] || '').trim();
    const body = lines.slice(1).join('\n').trim();
    if (!question || !body) continue;
    entries.push({question, body});
  }
  return entries;
}

const faqText = readFileSync(faqPath, 'utf8');
const entries = parseFaq(faqText);
if (!entries.length) {
  console.error('ingest-faq: sin entradas en ' + faqPath);
  process.exit(1);
}

const db = new DatabaseSync(corpusPath);
const before = db.prepare('SELECT count(*) n FROM passages').get().n;
const beforeFaq = db.prepare("SELECT count(*) n FROM passages WHERE doc='faq'").get().n;
console.log(JSON.stringify({faq: faqPath, corpus: corpusPath, entries: entries.length, passagesBefore: before, faqBefore: beforeFaq, dryRun}));

if (dryRun) process.exit(0);

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const backupPath = corpusPath + '.bak-' + stamp.slice(0, 8) + '-' + stamp.slice(8);
copyFileSync(corpusPath, backupPath);
console.log('ingest-faq: copia de seguridad en ' + backupPath);

const delSearch = db.prepare("DELETE FROM search WHERE id IN (SELECT id FROM passages WHERE doc='faq')");
const delPassages = db.prepare("DELETE FROM passages WHERE doc='faq'");
const insPassage = db.prepare('INSERT INTO passages(id,doc,title,status,page,locator,url,text) VALUES (?,?,?,?,?,?,?,?)');
const insSearch = db.prepare('INSERT INTO search(id,title,text) VALUES (?,?,?)');
const title = 'Preguntas frecuentes del SCL';
db.exec('BEGIN');
try {
  delSearch.run();
  delPassages.run();
  entries.forEach((e, i) => {
    const id = randomBytes(10).toString('hex');
    const text = e.question + '\n' + e.body;
    insPassage.run(id, 'faq', title, 'Preguntas frecuentes', null, 'FAQ ' + (i + 1), 'documents/faq-scl.md', text);
    insSearch.run(id, title, text);
  });
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  console.error('ingest-faq: error, se deshizo la transacción:', err.message);
  process.exit(1);
}

const after = db.prepare('SELECT count(*) n FROM passages').get().n;
const faqCount = db.prepare("SELECT count(*) n FROM passages WHERE doc='faq'").get().n;
const searchFaq = db.prepare("SELECT count(*) n FROM search WHERE id IN (SELECT id FROM passages WHERE doc='faq')").get().n;
const expected = before - beforeFaq + entries.length;
if (after !== expected || faqCount !== entries.length || searchFaq !== entries.length) {
  console.error(JSON.stringify({error: 'conteo inesperado', after, expected, faqCount, searchFaq}));
  process.exit(1);
}
console.log(JSON.stringify({ok: true, passagesAfter: after, faqCount, searchFaq, backup: backupPath}));
