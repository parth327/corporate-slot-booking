/**
 * GatePass — server entry point.
 *
 * Boot order matters: validate config, bring the schema up to date, seed the
 * bootstrap admin, then start listening. Nothing touches the pool before the
 * config check, so a missing DATABASE_URL produces an explanation rather than
 * a connection stack trace.
 */
import { env, assertRequiredEnv } from './config/env.js';
import { createApp } from './app.js';

const FORCE_EXIT_MS = 10_000;

let server = null;
let shuttingDown = false;

async function main() {
  try {
    assertRequiredEnv();
  } catch (err) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }

  const { runMigrations } = await import('./db/migrate.js');
  const { seedBootstrap } = await import('./db/seed.js');
  const { startJobs, stopJobs } = await import('./jobs/reminders.js');
  const { closePool, waitForDatabase, startKeepalive, stopKeepalive, warmPool } = await import('./db/pool.js');

  await waitForDatabase();
  await runMigrations();
  await seedBootstrap();
  await warmPool();
  startKeepalive();

  const app = createApp();

  await new Promise((resolve, reject) => {
    server = app.listen(env.PORT, resolve);
    server.on('error', reject);
  });

  const mail = env.BREVO_API_KEY ? 'live (Brevo)' : 'dry-run (console)';
  console.log(
    [
      '',
      '  GatePass API is running',
      `    url    : http://localhost:${env.PORT}`,
      `    health : http://localhost:${env.PORT}/api/health`,
      `    env    : ${env.NODE_ENV}`,
      `    email  : ${mail}`,
      `    cron   : ${env.ENABLE_CRON ? 'enabled' : 'disabled'}`,
      `    tz     : UTC${env.TZ_OFFSET_MINUTES >= 0 ? '+' : ''}${env.TZ_OFFSET_MINUTES / 60}`,
      '',
    ].join('\n')
  );

  startJobs();

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[server] ${signal} received, shutting down…`);

    const force = setTimeout(() => {
      console.error('[server] shutdown timed out, exiting');
      process.exit(1);
    }, FORCE_EXIT_MS);
    force.unref();

    try {
      stopJobs();
      stopKeepalive();
      await new Promise((resolve) => server.close(resolve));
      await closePool();
      console.log('[server] closed cleanly');
      process.exit(0);
    } catch (err) {
      console.error('[server] shutdown error:', err.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[server] uncaught exception:', err);
  process.exit(1);
});

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
