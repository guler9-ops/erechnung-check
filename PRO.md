# erechnung-check Pro

Der kostenlose Kern (dieses Repo, MIT) erkennt E-Rechnungen und prüft die
**Kernpflichtfelder**. Für die Praxis in Buchhaltung und Softwarehäusern braucht
es mehr — das leistet **erechnung-check Pro** (kommerzielle Lizenz).

## Was Pro zusätzlich kann (geplanter Umfang)

- **Vollständiger EN-16931-Regelcheck** — alle Geschäftsregeln (BR-\*, BR-CO-\*):
  Summenstimmigkeit (Netto + USt = Brutto, Positionssummen), USt-Konsistenz je
  Kategorie, Pflichtfeld-Abhängigkeiten, Code-Listen (Währung, Einheiten,
  Steuerkategorien) — auf Basis der offiziellen **KoSIT-Schematron-Regeln**.
- **Konformitäts-Urteil** wie ein Prüfdienst: `valid` / `acceptable` / `rejected`
  mit Regel-ID, Fundstelle und Klartext-Begründung je Befund.
- **Stapelverarbeitung** ganzer Ordner/Postfächer mit Sammelbericht
  (JSON, CSV, JUnit-XML für CI).
- **PDF/A-3-Konformität** des ZUGFeRD-Containers (nicht nur das XML).
- **XRechnung-Profilprüfung** (CIUS Deutschland) zusätzlich zur reinen EN 16931.
- **Priorisierter Support & Updates** bei Versionswechseln der Standards.

## Lizenz & Bezug

Pro wird unter einer **kommerziellen Lizenz** vertrieben (ein Entwurf des
Lizenzvertrags wird vor Verkauf anwaltlich geprüft). Bezug und Preise:

➡️ **<https://www.alldesk-erp.de>** · Kontakt: info@alldesk-erp.de

> Dieser Umfang ist die geplante Produktbeschreibung, noch kein Auslieferstand.
