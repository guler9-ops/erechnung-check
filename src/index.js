// erechnung-check — Kern-Bibliothek (Open Source, MIT)
// Erkennt und liest E-Rechnungen: XRechnung (UBL/CII) und ZUGFeRD / Factur-X
// (PDF mit eingebettetem XML) und prüft die EN-16931-Kernpflichtfelder.
//
// Läuft in Node (>=18) und im Browser. Im Browser werden native APIs
// (DOMParser, DecompressionStream) genutzt; in Node @xmldom/xmldom + zlib.
'use strict';

/* ---------- DOMParser beschaffen (Browser nativ, Node via xmldom) ---------- */
let _DOMParserClass = null;
async function getDOMParser() {
  if (typeof globalThis !== 'undefined' && globalThis.DOMParser) return globalThis.DOMParser;
  if (!_DOMParserClass) {
    const m = await import('@xmldom/xmldom');
    _DOMParserClass = m.DOMParser;
  }
  return _DOMParserClass;
}

/* ---------- XML-Helfer (namespace-unabhängig über localName) ---------- */
function desc(node, name) {
  const o = [];
  if (!node) return o;
  const a = node.getElementsByTagName('*');
  for (let i = 0; i < a.length; i++) if (a[i].localName === name) o.push(a[i]);
  return o;
}
function firstDesc(node, name) {
  if (!node) return null;
  const a = node.getElementsByTagName('*');
  for (let i = 0; i < a.length; i++) if (a[i].localName === name) return a[i];
  return null;
}
function child(node, name) {
  if (!node) return null;
  const kids = node.childNodes || [];
  for (let i = 0; i < kids.length; i++) {
    const el = kids[i];
    if (el.nodeType === 1 && el.localName === name) return el;
  }
  return null;
}
function txt(node) { return node ? String(node.textContent).trim() : ''; }

/* ---------- Datum & Beträge formatieren ---------- */
function fmtDate(raw, fmt) {
  if (!raw) return '';
  const r = String(raw).trim();
  if (fmt === '102' || /^\d{8}$/.test(r)) return r.slice(6, 8) + '.' + r.slice(4, 6) + '.' + r.slice(0, 4);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(r);
  if (m) return m[3] + '.' + m[2] + '.' + m[1];
  return r;
}
function fmtMoney(raw, cur) {
  if (raw === '' || raw == null) return '—';
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  try { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur || 'EUR' }).format(n); }
  catch (e) { return n.toFixed(2) + ' ' + (cur || ''); }
}

/* ---------- Bytes dekodieren (BOM-bewusst) ---------- */
function decodeXmlBytes(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF)
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE)
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF)
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes);
}

/* ---------- deflate entpacken (Node: zlib, Browser: DecompressionStream) ---------- */
async function inflate(bytes, fmt) {
  if (typeof globalThis !== 'undefined' && typeof globalThis.DecompressionStream === 'undefined') {
    const zlib = await import('node:zlib');
    const out = fmt === 'deflate-raw' ? zlib.inflateRawSync(bytes) : zlib.inflateSync(bytes);
    return new Uint8Array(out);
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(fmt));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function looksLikeInvoiceXml(t) {
  return /CrossIndustryInvoice/.test(t) || /<([a-zA-Z]+:)?Invoice[\s>]/.test(t) ||
    /<([a-zA-Z]+:)?CreditNote[\s>]/.test(t) || /ExchangedDocument/.test(t);
}

/* ---------- Eingebettetes XML aus PDF holen (ZUGFeRD/Factur-X) ---------- */
async function extractXmlFromPdf(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const latin = new TextDecoder('latin1').decode(bytes);
  let idx = 0;
  while (true) {
    const s = latin.indexOf('stream', idx);
    if (s < 0) break;
    idx = s + 6;
    if (s >= 3 && latin.substr(s - 3, 3) === 'end') continue; // "endstream" überspringen
    let ds = s + 6;
    if (latin[ds] === '\r') ds++;
    if (latin[ds] === '\n') ds++;
    const e = latin.indexOf('endstream', ds);
    if (e < 0) break;
    let ee = e;
    if (latin[ee - 1] === '\n') ee--;
    if (latin[ee - 1] === '\r') ee--;
    const dict = latin.substring(Math.max(0, s - 400), s);
    const raw = bytes.subarray(ds, ee);
    let decoded = null;
    if (/FlateDecode/.test(dict)) {
      try { decoded = await inflate(raw, 'deflate'); }
      catch (e1) { try { decoded = await inflate(raw, 'deflate-raw'); } catch (e2) { decoded = null; } }
    } else {
      decoded = raw;
    }
    if (decoded) {
      const sniff = new TextDecoder('latin1').decode(decoded.subarray(0, Math.min(decoded.length, 3000)));
      if (looksLikeInvoiceXml(sniff)) return decodeXmlBytes(decoded);
    }
  }
  return null;
}

/* ---------- Profil-Erkennung ---------- */
function friendlyProfile(p) {
  if (!p) return '';
  const lc = p.toLowerCase();
  let sub = '';
  if (lc.includes('minimum')) sub = 'Minimum';
  else if (lc.includes('basicwl')) sub = 'Basic WL';
  else if (lc.includes('basic')) sub = 'Basic';
  else if (lc.includes('en16931') || lc.includes('comfort')) sub = 'EN 16931 / Comfort';
  else if (lc.includes('extended')) sub = 'Extended';
  if (lc.includes('xrechnung')) return sub ? ('XRechnung · ' + sub) : 'XRechnung';
  return sub || p;
}

/* ---------- XML -> normalisierte Rechnung ---------- */
function parseInvoiceDoc(doc) {
  if (!doc || !doc.documentElement) throw new Error('XML nicht lesbar');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML nicht lesbar');
  const root = doc.documentElement;
  const rn = root.localName;
  const inv = {
    standard: '', syntax: '', profile: '', number: '', date: '', typeCode: '', currency: '',
    sellerName: '', sellerVat: '', sellerTax: '', buyerName: '', net: '', tax: '', gross: '',
    lineCount: 0, taxBreakdownCount: 0,
  };

  if (rn === 'CrossIndustryInvoice') {
    inv.standard = 'CII'; inv.syntax = 'UN/CEFACT CII';
    const ctx = firstDesc(root, 'ExchangedDocumentContext');
    const guide = firstDesc(ctx, 'GuidelineSpecifiedDocumentContextParameter');
    inv.profile = txt(firstDesc(guide, 'ID'));
    const exDoc = firstDesc(root, 'ExchangedDocument');
    inv.number = txt(firstDesc(exDoc, 'ID'));
    inv.typeCode = txt(firstDesc(exDoc, 'TypeCode'));
    const dt = firstDesc(exDoc, 'DateTimeString');
    inv.date = fmtDate(txt(dt), dt ? dt.getAttribute('format') : null);
    inv.currency = txt(firstDesc(root, 'InvoiceCurrencyCode'));
    const seller = firstDesc(root, 'SellerTradeParty');
    inv.sellerName = txt(firstDesc(seller, 'Name'));
    for (const reg of desc(seller, 'SpecifiedTaxRegistration')) {
      const id = firstDesc(reg, 'ID'); if (!id) continue;
      const sch = id.getAttribute('schemeID');
      if (sch === 'VA') inv.sellerVat = txt(id);
      else if (sch === 'FC') inv.sellerTax = txt(id);
      else if (!inv.sellerVat) inv.sellerVat = txt(id);
    }
    inv.buyerName = txt(firstDesc(firstDesc(root, 'BuyerTradeParty'), 'Name'));
    const sum = firstDesc(root, 'SpecifiedTradeSettlementHeaderMonetarySummation');
    inv.gross = txt(firstDesc(sum, 'GrandTotalAmount'));
    inv.net = txt(firstDesc(sum, 'TaxBasisTotalAmount'));
    inv.tax = txt(firstDesc(sum, 'TaxTotalAmount'));
    inv.lineCount = desc(root, 'IncludedSupplyChainTradeLineItem').length;
    const settle = firstDesc(root, 'ApplicableHeaderTradeSettlement');
    inv.taxBreakdownCount = desc(settle, 'ApplicableTradeTax').length;
  } else if (rn === 'Invoice' || rn === 'CreditNote') {
    inv.standard = 'UBL'; inv.syntax = 'OASIS UBL';
    inv.profile = txt(child(root, 'CustomizationID'));
    inv.number = txt(child(root, 'ID'));
    inv.date = fmtDate(txt(child(root, 'IssueDate')));
    inv.typeCode = txt(child(root, 'InvoiceTypeCode')) || txt(child(root, 'CreditNoteTypeCode'));
    inv.currency = txt(child(root, 'DocumentCurrencyCode'));
    const sp = firstDesc(root, 'AccountingSupplierParty'), spParty = firstDesc(sp, 'Party');
    inv.sellerName = txt(firstDesc(spParty, 'RegistrationName')) || txt(firstDesc(firstDesc(spParty, 'PartyName'), 'Name'));
    for (const pts of desc(spParty, 'PartyTaxScheme')) {
      const cid = firstDesc(pts, 'CompanyID'); if (!cid) continue;
      const scheme = txt(firstDesc(firstDesc(pts, 'TaxScheme'), 'ID'));
      if (scheme === 'VAT') inv.sellerVat = txt(cid); else if (!inv.sellerTax) inv.sellerTax = txt(cid);
    }
    const cp = firstDesc(root, 'AccountingCustomerParty'), cpParty = firstDesc(cp, 'Party');
    inv.buyerName = txt(firstDesc(cpParty, 'RegistrationName')) || txt(firstDesc(firstDesc(cpParty, 'PartyName'), 'Name'));
    const lmt = firstDesc(root, 'LegalMonetaryTotal');
    inv.gross = txt(firstDesc(lmt, 'TaxInclusiveAmount'));
    inv.net = txt(firstDesc(lmt, 'TaxExclusiveAmount'));
    const tt = firstDesc(root, 'TaxTotal');
    inv.tax = txt(firstDesc(tt, 'TaxAmount'));
    inv.lineCount = desc(root, 'InvoiceLine').length || desc(root, 'CreditNoteLine').length;
    inv.taxBreakdownCount = desc(tt, 'TaxSubtotal').length;
  } else {
    throw new Error('Kein bekanntes E-Rechnungsformat (Wurzel: ' + rn + ')');
  }
  inv.profileFriendly = friendlyProfile(inv.profile);
  return inv;
}

async function parseInvoice(xmlText) {
  const DOMParserClass = await getDOMParser();
  const doc = new DOMParserClass().parseFromString(xmlText, 'application/xml');
  return parseInvoiceDoc(doc);
}

/* ---------- EN-16931-Kernpflichtfeld-Prüfung (12 Kernfelder) ---------- */
function validate(inv) {
  const has = v => v != null && String(v).trim() !== '';
  const checks = [
    ['Rechnungsnummer', 'BT-1', has(inv.number)],
    ['Rechnungsdatum', 'BT-2', has(inv.date)],
    ['Rechnungsart (Typ-Code)', 'BT-3', has(inv.typeCode)],
    ['Währung', 'BT-5', has(inv.currency)],
    ['Verkäufer-Name', 'BT-27', has(inv.sellerName)],
    ['USt-IdNr. / Steuernummer Verkäufer', 'BT-31/32', has(inv.sellerVat) || has(inv.sellerTax)],
    ['Käufer-Name', 'BT-44', has(inv.buyerName)],
    ['Gesamtbetrag netto', 'BT-109', has(inv.net)],
    ['USt-Betrag gesamt', 'BT-110', has(inv.tax)],
    ['Zahlbetrag / brutto', 'BT-112', has(inv.gross)],
    ['Mind. eine Rechnungsposition', 'BG-25', inv.lineCount > 0],
    ['USt-Aufschlüsselung', 'BG-23', inv.taxBreakdownCount > 0],
  ].map(c => ({ label: c[0], bt: c[1], ok: c[2] }));
  const missing = checks.filter(c => !c.ok).length;
  return { checks, missing, valid: missing === 0 };
}

/* ---------- Hauptfunktion: Bytes + Dateiname -> Befund ---------- */
// Rückgabe: { status, container, inv?, val?, msg? }
//   status: 'ok' (gültig) | 'warn' (E-Rechnung, Pflichtfelder fehlen)
//           | 'bad' (keine E-Rechnung) | 'error' (defekt/nicht lesbar)
async function checkBytes(bytes, filename = '') {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = new TextDecoder('latin1').decode(u8.subarray(0, Math.min(u8.length, 1024)));
  const isPdf = head.startsWith('%PDF') || /\.pdf$/i.test(filename);
  const isXml = (/^﻿?\s*<\?xml/.test(head) ||
    /<([a-zA-Z]+:)?(Invoice|CrossIndustryInvoice|CreditNote)/.test(head) ||
    /\.xml$/i.test(filename)) && !isPdf;

  let xmlText = null, container = '';
  if (isPdf) {
    container = 'PDF';
    xmlText = await extractXmlFromPdf(u8);
    if (!xmlText) return { status: 'bad', container, msg: 'Kein eingebettetes XML gefunden – normale PDF-Rechnung oder Scan, keine E-Rechnung nach EN 16931.' };
  } else if (isXml) {
    container = 'XML';
    xmlText = decodeXmlBytes(u8);
  } else {
    return { status: 'bad', container: '?', msg: 'Unbekanntes Dateiformat – weder XML noch PDF mit E-Rechnungsdaten.' };
  }

  let inv;
  try { inv = await parseInvoice(xmlText); }
  catch (e) { return { status: 'error', container, msg: 'Datei enthält XML, aber keine gültige E-Rechnung: ' + e.message }; }
  const val = validate(inv);
  return { status: val.valid ? 'ok' : 'warn', container, inv, val };
}

export {
  checkBytes, parseInvoice, validate, extractXmlFromPdf,
  friendlyProfile, decodeXmlBytes, fmtDate, fmtMoney,
};
