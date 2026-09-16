/**
 * GatePass — Netlify Functions entry point.
 *
 * Netlify Functions speak the AWS Lambda (event, context) shape, not Node's
 * (req, res); serverless-http adapts the already-assembled Express app to
 * that shape. Same reasoning as server/api/index.js (the Vercel entry point):
 * no listen(), no migrations, no cron — those belong to the long-running
 * src/index.js process, not a per-invocation function. Background jobs must
 * be triggered externally here too (see cron.routes.js / .env.example).
 */
import serverless from 'serverless-http';
import { createApp } from '../../src/app.js';

const app = createApp();

export const handler = serverless(app);
