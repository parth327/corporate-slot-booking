/**
 * GatePass — Express application assembly.
 *
 * Kept separate from index.js so tests can boot the app in-process without
 * migrations, cron or a listening port they did not ask for.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

import authRoutes from './routes/auth.routes.js';
import publicRoutes, { publicGatepassRouter } from './routes/public.routes.js';
import gatepassRoutes from './routes/gatepass.routes.js';
import roomRoutes from './routes/room.routes.js';
import securityRoutes from './routes/security.routes.js';
import adminRoutes from './routes/admin.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '..', '..', 'client', 'dist');

/** '*' or a comma-separated allow-list. */
function corsOrigin() {
  const raw = env.CORS_ORIGIN.trim();
  if (!raw || raw === '*') return true;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length === 1 ? list[0] : list;
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // Only affects res.json()/res.send() (i.e. every API route below) — leaves
  // express.static's own, separate etag logic for the built client untouched.
  // See the no-store middleware just below for why this matters.
  app.set('etag', false);

  // Dedicated uptime-pinger target — a free Render instance spins down after
  // 15 minutes idle, so an external cron-job service hits this on a timer to
  // keep it warm. Deliberately: no DB round trip (GET /api/health already
  // covers "is the database actually reachable" for real health checks),
  // registered before morgan so routine pings don't spam the request log,
  // and plain text rather than JSON — the simplest possible response for
  // whatever is polling it to parse.
  app.get('/healthz', (req, res) => res.type('text/plain').send('ok'));

  // CSP off for now: this process also serves the built SPA (CLIENT_DIST below),
  // and a default CSP is easy to get wrong for a bundle it didn't build tooling
  // for here. The rest of helmet's headers (X-Frame-Options, X-Content-Type-
  // Options, etc.) apply regardless and cost nothing to turn on.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: corsOrigin(), credentials: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // Every /api response is per-caller (scoped by whatever Bearer token, or
  // none, made the request) and none of them should ever be reused across a
  // different caller. A browser's HTTP cache keys purely on URL + method by
  // default — it does not consider the Authorization header — so an ETag on
  // an authenticated response like GET /api/auth/me can trigger a genuine
  // 304 Not Modified for a *different* token than the one that produced the
  // cached body, silently serving one session's data to another. Confirmed
  // in practice: a shared browser profile reused across multiple role logins
  // hit exactly this, serving a stale cached body via 304 and leaving the
  // page stuck rendering a mismatched or stale session. `app.set('etag',
  // false)` above stops Express computing one in the first place; stripping
  // the incoming conditional-GET headers here is defence in depth for a
  // request that already carries a validator from before this existed.
  app.use('/api', (req, res, next) => {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
    res.set('Cache-Control', 'no-store');
    next();
  });

  // API ----------------------------------------------------------------------
  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api', publicGatepassRouter); // /api/health and /api/gatepasses/request
  app.use('/api/gatepasses', gatepassRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/security', securityRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/api', notFoundHandler);

  // Built client, when one exists — lets a single process serve the whole app.
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (req, res, next) => {
      res.sendFile(path.join(CLIENT_DIST, 'index.html'), (err) => (err ? next(err) : undefined));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
