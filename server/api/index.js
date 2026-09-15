/**
 * GatePass — Vercel serverless entry point.
 *
 * Vercel calls this module's default export as the (req, res) handler for
 * every request that vercel.json rewrites here; an Express app is callable
 * the same way, so we just hand it the already-assembled app. No listen(),
 * no migrations, no cron — those belong to the long-running src/index.js
 * process (Render), not a per-invocation serverless function.
 */
import { createApp } from '../src/app.js';

const app = createApp();

export default app;
