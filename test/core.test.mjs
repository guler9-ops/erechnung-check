// Smoke-Test gegen die echten Kernfunktionen. Ohne Test-Framework,
// nur node:assert — bewusst abhängigkeitsarm. Lauf: npm test
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkBytes, validate } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = f => join(here, 'fixtures', f);
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('  \x1b[32m✔\x1b[0m ' + name); }
  catch (e) { fail++; console.log('  \x1b[31m✘\x1b[0m ' + name + '\n      ' + e.message); }
}
const load = async f => new Uint8Array(await readFile(fx(f)));

console.log('erechnung-check — Kern-Tests\n');

await t('XRechnung UBL: wird als gültig erkannt', async () => {
  const r = await checkBytes(await load('xrechnung-ubl-valid.xml'), 'xrechnung-ubl-valid.xml');
  assert.equal(r.status, 'ok');
  assert.equal(r.inv.standard, 'UBL');
  assert.equal(r.inv.number, 'RE-2026-0815');
  assert.equal(r.inv.date, '31.01.2026');
  assert.equal(r.inv.sellerName, 'Muster Handwerk GmbH');
  assert.equal(r.inv.sellerVat, 'DE123456789');
  assert.equal(r.inv.buyerName, 'Beispiel Kunde AG');
  assert.equal(r.inv.net, '100.00');
  assert.equal(r.inv.gross, '119.00');
  assert.equal(r.val.missing, 0);
});

await t('ZUGFeRD/CII: wird als gültig erkannt + Datum-Format 102', async () => {
  const r = await checkBytes(await load('zugferd-cii-valid.xml'), 'zugferd-cii-valid.xml');
  assert.equal(r.status, 'ok');
  assert.equal(r.inv.standard, 'CII');
  assert.equal(r.inv.number, 'ZF-2026-0042');
  assert.equal(r.inv.date, '31.01.2026');
  assert.equal(r.inv.sellerVat, 'DE987654321');
  assert.equal(r.inv.gross, '119.00');
  assert.equal(r.val.missing, 0);
});

await t('Textdatei: korrekt "keine E-Rechnung"', async () => {
  const r = await checkBytes(await load('keine-rechnung.txt'), 'keine-rechnung.txt');
  assert.equal(r.status, 'bad');
});

await t('Fehlende Pflichtfelder: Status warn', async () => {
  const xml = (await readFile(fx('xrechnung-ubl-valid.xml'), 'utf8'))
    .replace(/<cbc:ID>RE-2026-0815<\/cbc:ID>/, '<cbc:ID></cbc:ID>');
  const r = await checkBytes(new TextEncoder().encode(xml), 'ohne-nummer.xml');
  assert.equal(r.status, 'warn');
  assert.ok(r.val.missing >= 1);
  assert.ok(r.val.checks.find(c => c.bt === 'BT-1' && !c.ok), 'BT-1 muss als fehlend markiert sein');
});

await t('validate(): 12 Kernfelder werden geprüft', () => {
  const v = validate({ number: 'X', date: '01.01.2026', typeCode: '380', currency: 'EUR',
    sellerName: 'A', sellerVat: 'DE1', buyerName: 'B', net: '1', tax: '0', gross: '1',
    lineCount: 1, taxBreakdownCount: 1 });
  assert.equal(v.checks.length, 12);
  assert.equal(v.valid, true);
});

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
