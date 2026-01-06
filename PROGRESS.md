# Spendito - Entwicklungsstand

**Letzte Aktualisierung:** 2. Dezember 2025

---

## ✅ Erledigt

### KI & Kategorisierung
- [x] Integration von **Gemini 3 Flash** für automatische Quartals-Reviews
- [x] Betragsbasiertes Lernen (z.B. Schutzgebühr um 500€ wird bevorzugt erkannt)
- [x] Automatisches Lernen aus KI-Vorschlägen im Review-Modal
- [x] Manuelle Korrekturen triggern Keyword- und Betrags-Learning

### PayPal Integration
- [x] Backend PayPal-Routes erstellt (`backend/src/paypal-routes.ts`)
- [x] OAuth-Flow implementiert (Login, Callback, Token-Speicherung)
- [x] Frontend UI für PayPal-Verbindung (Verbinden/Sync/Trennen Buttons)
- [x] Return URL in PayPal Developer konfiguriert: `https://spendito-production.up.railway.app/api/paypal/callback`
- [x] Railway Umgebungsvariablen gesetzt (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET)

### Volksbank FinTS Integration
- [x] FinTS-Server URLs aktualisiert auf neue Atruvia-Server (März 2024)
  - `fints2.atruvia.de` für Süddeutschland (BLZ 6xxxxx, 7xxxxx)
  - `fints1.atruvia.de` für Norddeutschland
- [x] Automatische Server-Erkennung anhand BLZ
- [x] Bessere Fehlermeldungen im Frontend

### Bank-Credentials
- [x] BLZ und VR-NetKey werden in AsyncStorage gespeichert
- [x] PIN wird NICHT gespeichert (Sicherheit)

---

## ⏳ Wartend

### PayPal OAuth Genehmigung
- **Status:** "New" - wartet auf PayPal Review
- **Dauer:** Bis zu 7 Werktage
- **Prüfen unter:** https://developer.paypal.com/dashboard/applications
- **Was fehlt:** "Log in with PayPal" muss von PayPal genehmigt werden, damit Nutzer ihre eigenen PayPal-Konten verbinden können

---

## 🔧 Zu testen (nach Genehmigung)

1. **PayPal OAuth Flow:**
   - Nutzer klickt "Verbinden" → PayPal Login → Callback → Verbunden
   - Sync Button holt Transaktionen
   - Trennen Button entfernt Verbindung

2. **Volksbank FinTS:**
   - Mit korrekten Login-Daten testen
   - TAN-Verfahren auswählen
   - Transaktionen abrufen

---

## 📁 Wichtige Dateien

| Datei | Beschreibung |
|-------|--------------|
| `backend/src/paypal-routes.ts` | PayPal OAuth & Transaktionen |
| `backend/src/fints-routes.ts` | Volksbank FinTS Integration |
| `src/components/SettingsModal.tsx` | UI für Verbindungen |
| `src/services/backendApi.ts` | API-Service für Frontend |

---

## 🔑 Konfiguration

### Railway Umgebungsvariablen
```
PAYPAL_CLIENT_ID=AYuh6Fgp0h6VGlF0Stkc1JtXW4bKTwhWtIJhTPdQzvGXly7WvEsCRVXVpt7XqIzHmLWv-O1qX8MxsKbt
PAYPAL_CLIENT_SECRET=ECFE2_-NXvZfZyP6y7ti28TQe7nD_Zq9ktxdttml6oJ0esc8XN4pIA_NWJi2VgQra4A5nBZK514BVu57
```

### PayPal Developer Dashboard
- App: "jaacool Apps PP Payment"
- Return URL: `https://spendito-production.up.railway.app/api/paypal/callback`
- Features aktiviert: Log in with PayPal, Transaction search

---

## 📝 Notizen

- PayPal OAuth erfordert Genehmigung für "Log in with PayPal" Feature
- Ohne Genehmigung können nur die Transaktionen des App-Besitzers abgerufen werden
- Volksbank nutzt jetzt Atruvia-Server (alte fiducia.de/gad.de wurden März 2024 abgeschaltet)
