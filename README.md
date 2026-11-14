# erechnung-check

**Prüft, ob eine Rechnung eine echte E-Rechnung ist** — und liest die Belegdaten aus.
Erkennt **XRechnung** (UBL / CII) und **ZUGFeRD / Factur-X** (PDF mit eingebettetem XML),
liest die wichtigsten Felder und prüft die **EN-16931-Kernpflichtfelder**.

- 🔒 **Läuft lokal** — keine Rechnung verlässt deinen Rechner, keine Cloud, keine KI.
- 📦 **Als Bibliothek** einbettbar (Node & Browser) oder als **CLI** fürs Terminal / CI.
- 🇩🇪 Für die deutsche E-Rechnungspflicht (seit 2025 im B2B).

> Kostenloser Kern (dieses Paket, MIT). Für den **vollständigen EN-16931-Regelcheck**
> (alle Geschäftsregeln BR-/BR-CO-\*, Stapelverarbeitung, PDF/A-3-Konformität) gibt es
> **erechnung-check Pro** — siehe [PRO.md](PRO.md).

## Was es prüft (kostenloser Kern)

Format-Erkennung, Datenauslesung und **12 EN-16931-Kernpflichtfelder**:

| Feld | EN 16931 |
|---|---|
| Rechnungsnummer | BT-1 |
| Rechnungsdatum | BT-2 |
| Rechnungsart (Typ-Code) | BT-3 |
| Währung | BT-5 |
| Verkäufer-Name | BT-27 |
| USt-IdNr. / Steuernummer Verkäufer | BT-31/32 |
| Käufer-Name | BT-44 |
| Gesamtbetrag netto | BT-109 |
| USt-Betrag gesamt | BT-110 |
| Zahlbetrag / brutto | BT-112 |
| Mind. eine Rechnungsposition | BG-25 |
| USt-Aufschlüsselung | BG-23 |

## Installation

```bash
npm install erechnung-check
```

Node ≥ 18. Im Browser werden native APIs genutzt (kein Build nötig), serverseitig
`@xmldom/xmldom` für das XML-Parsing.

## CLI

```bash
npx erechnung-check rechnung.pdf
npx erechnung-check eingang/*.xml --json
```

Flags: `--json` (maschinenlesbar), `--quiet` (nur Zusammenfassung).
**Exit-Code:** `0` = alle gültig, `1` = unvollständig / keine E-Rechnung, `2` = Aufruffehler.
Damit direkt in CI-Pipelines einsetzbar.

## Als Bibliothek

```js
import { readFile } from 'node:fs/promises';
import { checkBytes } from 'erechnung-check';

const bytes = new Uint8Array(await readFile('rechnung.pdf'));
const r = await checkBytes(bytes, 'rechnung.pdf');

console.log(r.status);        // 'ok' | 'warn' | 'bad' | 'error'
console.log(r.inv?.number);   // 'RE-2026-0815'
console.log(r.val?.missing);  // Anzahl fehlender Kernpflichtfelder
```

### Rückgabe

- `status` — `ok` (gültig), `warn` (E-Rechnung, Pflichtfelder fehlen), `bad` (keine E-Rechnung), `error` (defekt).
- `container` — `PDF` oder `XML`.
- `inv` — ausgelesene Felder (`number`, `date`, `currency`, `sellerName`, `sellerVat`, `buyerName`, `net`, `tax`, `gross`, `standard`, `profileFriendly` …).
- `val` — `{ checks[], missing, valid }` der Kernpflichtfeld-Prüfung.

## Browser-Demo

[`web/index.html`](web/index.html) ist ein eigenständiges Werkzeug (Drag & Drop, läuft
komplett im Browser, keine Abhängigkeiten). Online: <https://www.alldesk-erp.de/e-rechnung-pruefen.html>

## Grenzen des kostenlosen Kerns

Der Kern prüft **Format + Kernpflichtfelder**, nicht die vollständigen
EN-16931-Geschäftsregeln (Summenstimmigkeit BR-CO-\*, USt-Konsistenz, Code-Listen).
Das leistet **[erechnung-check Pro](PRO.md)**.

## Lizenz

MIT © S.G Beratungs- und Verwaltungs GmbH (AllDesk). Siehe [LICENSE](LICENSE).

> Hinweis: Dieses Werkzeug unterstützt bei der Prüfung, ersetzt aber keine
> steuerliche oder rechtliche Beratung.
