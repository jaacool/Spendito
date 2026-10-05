# Spendito 🐕

Eine moderne Finanz-App für Hunde-Rettungsvereine zur automatischen Kategorisierung von Kontobewegungen.

## Features

### ✅ Implementiert

- **Dashboard mit Jahresübersicht**
  - Gesamtbilanz (Einnahmen - Ausgaben)
  - Aufschlüsselung nach Kategorien
  - Visuelle Fortschrittsbalken

- **Automatische Kategorisierung**
  - Regelbasierte Erkennung von Verwendungszwecken
  - Lernfähiges System (lernt aus manuellen Korrekturen)
  - Konfidenz-Anzeige bei unsicheren Kategorisierungen

- **Kategorien**
  - **Einnahmen**: Spenden, Schutzgebühren, Mitgliedsbeiträge, Sonstiges
  - **Ausgaben**: Tierarzt, Futter, Transport, Pflegestellen, Verwaltung, Sonstiges

- **Jahresnavigation**
  - Seitenmenü mit Jahresauswahl
  - Schneller Wechsel zwischen Jahren

- **KI-Überprüfung (Google Gemini)**
  - Prüft unsichere Kategorisierungen, Vorschläge einzeln oder gesammelt übernehmen
  - Ohne API-Key: Prüfung mit den gelernten Regeln (wird angezeigt)

- **Datenquellen**
  - Volksbank: CSV-Import (Einstellungen → Kontoverbindungen)
  - PayPal: Verbindung über das Backend (`backend/`)
  - Automatische Erkennung von Bank→PayPal-Überweisungen (keine Doppelzählung)

- **Finanzamt-Export** (PDF/HTML) und **Datensicherung** (Export/Import)

### 🎨 Design

- Apple-inspiriertes, minimalistisches Design
- Responsive für iOS, Android und Web
- Dunkle Bilanz-Karte als Fokuspunkt
- Farbcodierte Kategorien

## Tech Stack

- **Framework**: React Native + Expo
- **Navigation**: Expo Router
- **Styling**: React Native StyleSheet (Apple-Design)
- **Icons**: Lucide React Native
- **Persistenz**: AsyncStorage
- **Datumsformatierung**: date-fns

## Installation

```bash
# Dependencies installieren
npm install

# App starten
npx expo start

# Web-Version
npx expo start --web

# iOS Simulator
npx expo start --ios

# Android Emulator
npx expo start --android
```

## Projektstruktur

Siehe [docs/Architecture.md](docs/Architecture.md).

## Lizenz

MIT
