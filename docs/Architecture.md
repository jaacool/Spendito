# Spendito – Architektur

Kurzüberblick für Entwickler und KI-Agenten. Stand: Oktober 2026.

## Datenquellen

| Quelle | Weg | Code |
|---|---|---|
| Volksbank | CSV-Export, Import im Browser | `src/services/csvParser.ts`, `src/services/csvImport.ts` |
| PayPal | OAuth über das Backend (zustandsloser Proxy), Tokens nur im Client | `src/services/paypalAuth.ts`, `src/services/backendApi.ts`, `backend/` |

FinTS/Volksbank-Direktanbindung, Demo-Daten und GoCardless wurden entfernt.

## Schichten (Ist-Zustand)

```
app/                  Screens + Verdrahtung (Composition Root)
src/components/       UI (dumm, nur Props)
  home/               Bausteine der Startseite (Filterleiste, Liste, Kategorien)
  settings/           Abschnitte des SettingsModal
src/frontend/         Hooks: UI-Zustand + Aufruf der Services (ein Hook pro Datei)
src/context/          Globaler Zustand (AppContext, SettingsContext)
src/services/         Geschäftslogik + Speicher (AsyncStorage)
src/types/            Datenvertrag (Transaction, CategoryRule, ...)
backend/              Express-Proxy für PayPal (Railway)
```

Abweichung von der Ziel-Architektur (`src/contracts`, `src/business`, `src/database`):
`src/services` mischt noch Geschäftslogik und Speicherzugriff. Der Umbau ist als
eigenes Projekt geplant (Repository-Interfaces in `src/contracts`, AsyncStorage-Implementierung in `src/database`).

## Kernregeln der Datenlogik

1. **Duplikate** (`duplicateDetection.ts`): Nur Bank-Buchungen, die *strukturell* eine PayPal-Überweisung sind
   (Empfänger „PayPal…“ oder Referenz `PP.xxxx.PP`), werden mit einer PayPal-Buchung verknüpft – 1:1,
   gleicher Betrag/Vorzeichen, max. 5 Tage. Der Bank-Text wird nie überschrieben (`linkedPayPalInfo`).
2. **Was zählt in Summen** (`transactionFilters.ts → isCountedInTotals`): keine Duplikate, keine
   Guthaben-Transfers, keine Umbuchungen. Liste, Summen, Finanzamt-Export nutzen dieselbe Funktion.
3. **Kontostände** (`storage.getBalanceAtDate`): alle Buchungen des Kontos zählen (auch Umbuchungen).
4. **CSV-IDs** (`csvImport.generateBaseExternalId`): Format nicht ändern – bestehende Buchungen werden
   darüber erkannt. Identische Zeilen bekommen `__2`, `__3`, …
5. **Regeln** (`categorization.ts`): Standardregeln werden nie durch Lernen verändert; `initialize(true)`
   lädt nur neu, setzt nie zurück.
6. **Reparatur alter Daten** (`dataRepair.ts`): läuft bei jedem Start, idempotent.

## Plattform-Hinweise

- `Alert.alert` funktioniert im Browser nicht → immer `src/services/dialogs.ts` nutzen.
- `expo-file-system` (SDK 54): klassische API über `expo-file-system/legacy`.

## Backend (Railway)

Pflicht-Umgebungsvariablen: `ALLOWED_ORIGINS`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.
Login-Nonces liegen im Speicher → genau eine Instanz betreiben.
