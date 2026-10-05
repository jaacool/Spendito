// File: backend/src/paypal-callback-page.ts
/**
 * HTML pages rendered in the PayPal OAuth popup after the redirect.
 *
 * - The token is only ever posted to explicitly allow-listed frontend origins
 *   (never '*'), so a foreign opener window cannot receive it.
 * - No user- or upstream-provided text is interpolated into the HTML; error
 *   pages use fixed German messages.
 * - Data embedded into the inline <script> is JSON-encoded with '<' and line
 *   separators escaped, so it cannot break out of the script element.
 */

import type { Response } from 'express';
import type { PayPalToken } from './paypal-client.js';

function toSafeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function setSecurityHeaders(res: Response): void {
  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', // the URL contains the OAuth code
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  });
}

const PAGE_STYLE =
  'font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 40px 20px; color: #1f2937;';

/**
 * Success page: hands the token to the opener window (web app) and offers a
 * deep link back to the native app on mobile.
 */
export function sendCallbackSuccessPage(
  res: Response,
  token: PayPalToken,
  state: string,
  targetOrigins: string[]
): void {
  setSecurityHeaders(res);
  const message = { type: 'PAYPAL_CONNECTED', state, token };

  res.status(200).send(`<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <title>PayPal verbunden</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body style="${PAGE_STYLE}">
    <div style="max-width: 400px; margin: 0 auto;">
      <div style="font-size: 64px; margin-bottom: 20px;">✅</div>
      <h1 style="font-size: 24px; margin-bottom: 16px;">PayPal erfolgreich verbunden!</h1>
      <p style="font-size: 16px; color: #6b7280; line-height: 1.5; margin-bottom: 30px;">
        Du kannst dieses Fenster nun schließen und zur App zurückkehren.
      </p>
      <button onclick="window.close()"
        style="display: block; width: 100%; background: #0070ba; color: white; border: none; padding: 14px 24px; border-radius: 8px; font-weight: 600; font-size: 16px; cursor: pointer; margin-bottom: 12px;">
        Fenster schließen
      </button>
      <a href="spendito://paypal-success" id="app-link" style="display: none; font-size: 14px; color: #0070ba;">Zurück zur App (Mobile)</a>
    </div>
    <script>
      (function () {
        var message = ${toSafeScriptJson(message)};
        var targets = ${toSafeScriptJson(targetOrigins)};
        // Web: post the token ONLY to allow-listed origins. The browser drops
        // the message if the opener's origin does not match the target.
        if (window.opener) {
          for (var i = 0; i < targets.length; i++) {
            try { window.opener.postMessage(message, targets[i]); } catch (e) {}
          }
        }
        // Mobile: offer deep link back into the app
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
          document.getElementById('app-link').style.display = 'block';
          setTimeout(function () { window.location.href = 'spendito://paypal-success'; }, 1000);
        }
      })();
    </script>
  </body>
</html>`);
}

/**
 * Error page with a fixed, generic German message (no technical details).
 */
export function sendCallbackErrorPage(res: Response, status: number, message: string): void {
  setSecurityHeaders(res);
  // `message` is always one of the fixed strings below, but escape anyway.
  const safeMessage = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  res.status(status).send(`<!doctype html>
<html lang="de">
  <head><meta charset="utf-8"><title>Fehler</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="${PAGE_STYLE}">
    <h1>❌ Verbindung fehlgeschlagen</h1>
    <p>${safeMessage}</p>
    <p>Bitte schließe dieses Fenster und versuche es in Spendito erneut.</p>
  </body>
</html>`);
}

export const CALLBACK_MESSAGES = {
  cancelled: 'Die PayPal-Anmeldung wurde abgebrochen.',
  invalidState: 'Die Anmeldung ist abgelaufen oder ungültig.',
  exchangeFailed: 'PayPal hat die Anmeldung nicht bestätigt.',
} as const;
