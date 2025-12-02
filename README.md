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

- **KI-Überprüfung (vorbereitet)**
  - Quartalsweise Überprüfung der Kategorisierungen
  - Vorschläge für Korrekturen
  - Batch-Anwendung von Änderungen

- **Sparkassen-API (vorbereitet)**
  - Interface für FinTS/HBCI Integration
  - Automatischer Import von Kontobewegungen

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

```
Spendito/
├── app/                    # Expo Router Screens
│   ├── _layout.tsx         # Root Layout
│   └── index.tsx           # Hauptscreen
├── src/
│   ├── components/         # UI-Komponenten
│   │   ├── CategoryCard.tsx
│   │   ├── TransactionItem.tsx
│   │   ├── SummaryHeader.tsx
│   │   ├── SideMenu.tsx
│   │   └── ReviewModal.tsx
│   ├── context/
│   │   └── AppContext.tsx  # Globaler State
│   ├── services/
│   │   ├── categorization.ts  # Kategorisierungs-Engine
│   │   ├── storage.ts         # Datenpersistenz
│   │   ├── mockData.ts        # Demo-Daten Generator
│   │   ├── bankApi.ts         # Sparkassen-API (vorbereitet)
│   │   └── aiReview.ts        # KI-Review (vorbereitet)
│   └── types/
│       └── index.ts        # TypeScript Definitionen
└── assets/                 # Icons & Bilder
```

## Nächste Schritte

### Sparkassen-Integration

1. FinTS/HBCI Bibliothek einbinden (z.B. `nodejs-fints`)
2. Backend-Server für sichere Bank-Kommunikation
3. TAN-Handling implementieren

### KI-Integration

1. OpenAI oder Claude API-Key einrichten
2. `aiReviewService.configure()` aufrufen
3. Quartalsweise Reviews automatisieren

## Lizenz

MIT
