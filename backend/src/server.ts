// File: backend/src/server.ts
// Load .env BEFORE any other module reads process.env (ESM imports are hoisted)
import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ALLOWED_ORIGINS, isAllowedOrigin } from './config.js';
import paypalRoutes from './paypal-routes.js';

/**
 * Spendito backend - stateless PayPal OAuth/reporting proxy.
 *
 * The former FinTS/Volksbank integration and its SQLite storage were removed;
 * the server stores no user data at all.
 */

const app = express();
const PORT = process.env.PORT || 3001;

app.disable('x-powered-by');

// CORS: only allow-listed frontend origins. Requests without an Origin header
// (health checks, server-to-server) are not affected by CORS anyway.
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, !origin || isAllowedOrigin(origin));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  })
);

app.use(express.json({ limit: '100kb' }));

// Health check (used by Railway)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// PayPal routes
app.use('/api/paypal', paypalRoutes);

// Unknown routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ code: 'NOT_FOUND', error: 'Diese Funktion gibt es nicht.' });
});

// Central error handler (e.g. malformed JSON) - never leak internals
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    res.status(400).json({ code: 'INVALID_INPUT', error: 'Ungültige Anfrage.' });
    return;
  }
  console.error('[Server] Unhandled error:', err instanceof Error ? err.message : 'unknown error');
  res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Ein interner Fehler ist aufgetreten. Bitte versuche es später erneut.' });
});

app.listen(PORT, () => {
  console.log(`🚀 Spendito Backend running on port ${PORT}`);
  if (ALLOWED_ORIGINS.length === 0) {
    console.warn('⚠️  ALLOWED_ORIGINS is not set - browser requests from the web app will be rejected (CORS).');
  } else {
    console.log(`🔒 Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  }
});

export default app;
