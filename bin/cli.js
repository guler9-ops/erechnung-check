#!/usr/bin/env node
// erechnung-check — CLI (Open Source, MIT)
// Nutzung:
//   erechnung-check rechnung.pdf [weitere ...] [--json] [--quiet]
// Exit-Code: 0 = alle geprüften Dateien sind gültige E-Rechnungen,
//            1 = mind. eine ist unvollständig oder keine E-Rechnung,
//            2 = Aufruffehler (keine Datei angegeben / Datei fehlt).
'use strict';

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { checkBytes, fmtMoney } from '../src/index.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const files = args.filter(a => !a.startsWith('--'));
const asJson = flags.has('--json');
const quiet = flags.has('--quiet');

if (flags.has('--help') || flags.has('-h') || files.length === 0) {
  process.stderr.write(
    'erechnung-check — prüft, ob Dateien echte E-Rechnungen sind (XRechnung / ZUGFeRD / Factur-X)\n\n' +
    'Nutzung: erechnung-check <datei> [weitere ...] [--json] [--quiet]\n\n' +
    '  --json    Maschinenlesbare Ausgabe (ein JSON-Objekt)\n' +
    '  --quiet   Nur Zusammenfassung, keine Feldliste\n\n' +
    'Exit-Code: 0 = alle gültig, 1 = unvollständig/keine E-Rechnung, 2 = Aufruffehler\n'
  );
  process.exit(files.length === 0 ? 2 : 0);
}

const C = { reset: '\x1b[0m', ok: '\x1b[32m', warn: '\x1b[33m', bad: '\x1b[31m', dim: '\x1b[90m', b: '\x1b[1m' };
const color = process.stdout.isTTY && !asJson;
const paint = (c, s) => color ? c + s + C.reset : s;

const results = [];
let worst = 0; // 0 ok, 1 problem

for (const f of files) {
  let bytes;
  try { bytes = await readFile(f); }
  catch (e) {
    results.push({ file: f, status: 'error', msg: 'Datei nicht lesbar: ' + e.message });
    worst = 2;
    continue;
  }
  let r;
  try { r = await checkBytes(new Uint8Array(bytes), basename(f)); }
  catch (e) { r = { status: 'error', container: '?', msg: 'Unerwarteter Fehler: ' + e.message }; }
  results.push({ file: f, ...r });
  if (r.status !== 'ok' && worst < 1) worst = 1;
}

if (asJson) {
  // schlanke, stabile JSON-Form für CI/Integration
  const out = results.map(r => ({
    file: r.file,
    status: r.status,
    valid: r.status === 'ok',
    container: r.container || null,
    format: r.inv ? (r.inv.standard === 'CII' ? (r.container === 'PDF' ? 'ZUGFeRD/Factur-X' : 'XRechnung-CII') : 'XRechnung-UBL') : null,
    invoice: r.inv ? {
      number: r.inv.number, date: r.inv.date, currency: r.inv.currency,
      seller: r.inv.sellerName, sellerVat: r.inv.sellerVat || r.inv.sellerTax || null,
      buyer: r.inv.buyerName, net: r.inv.net, tax: r.inv.tax, gross: r.inv.gross,
      profile: r.inv.profileFriendly || r.inv.profile || null,
    } : null,
    missingFields: r.val ? r.val.checks.filter(c => !c.ok).map(c => ({ field: c.label, id: c.bt })) : null,
    message: r.msg || null,
  }));
  process.stdout.write(JSON.stringify({ results: out, summary: summarize() }, null, 2) + '\n');
  process.exit(worst === 2 ? 2 : (worst ? 1 : 0));
}

for (const r of results) {
  const label =
    r.status === 'ok' ? paint(C.ok, '✔ gültige E-Rechnung') :
    r.status === 'warn' ? paint(C.warn, '▲ E-Rechnung · ' + r.val.missing + ' Pflichtfeld' + (r.val.missing > 1 ? 'er' : '') + ' fehlen') :
    r.status === 'bad' ? paint(C.bad, '✘ keine E-Rechnung') :
    paint(C.bad, '✘ Fehler');
  process.stdout.write(`\n${paint(C.b, r.file)}  ${label}\n`);
  if (r.inv) {
    const i = r.inv;
    const fmtd = i.standard === 'CII' ? (r.container === 'PDF' ? 'ZUGFeRD / Factur-X' : 'XRechnung (CII)') : 'XRechnung (UBL)';
    process.stdout.write(paint(C.dim, `  ${fmtd}${i.profileFriendly ? ' · ' + i.profileFriendly : ''}\n`));
    process.stdout.write(`  Nr. ${i.number || '—'} · ${i.date || '—'} · ${i.sellerName || '—'} · ${fmtMoney(i.gross, i.currency)}\n`);
    if (!quiet && r.val) {
      for (const c of r.val.checks) {
        const mark = c.ok ? paint(C.ok, '✔') : paint(C.bad, '✘');
        process.stdout.write(`    ${mark} ${c.label} ${paint(C.dim, c.bt)}\n`);
      }
    }
  }
  if (r.msg) process.stdout.write(paint(C.dim, `  ${r.msg}\n`));
}

const s = summarize();
process.stdout.write(`\n${paint(C.b, 'Zusammenfassung:')} ` +
  `${paint(C.ok, s.ok + ' gültig')} · ${paint(C.warn, s.warn + ' unvollständig')} · ${paint(C.bad, s.bad + ' keine E-Rechnung')}\n`);
process.exit(worst === 2 ? 2 : (worst ? 1 : 0));

function summarize() {
  const s = { ok: 0, warn: 0, bad: 0 };
  for (const r of results) {
    if (r.status === 'ok') s.ok++;
    else if (r.status === 'warn') s.warn++;
    else s.bad++;
  }
  return s;
}
