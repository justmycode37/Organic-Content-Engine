import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { ConfigError, loadConfig, type Config } from './config.ts';
import { createContainer } from './container.ts';
import { createApp } from './http/app.ts';

const SHUTDOWN_TIMEOUT_MS = 45_000;

function warnOnLooseEnvFile(warn: (message: string) => void): void {
  try {
    if (statSync(resolve(process.cwd(), '.env')).mode & 0o077) {
      warn('.env is readable by other users; run: chmod 600 .env');
    }
  } catch {
    // No .env file: configuration comes from the real environment.
  }
}

function main(): void {
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const container = createContainer(config);
  const { logger, gateway, scheduler, db } = container;
  warnOnLooseEnvFile((message) => logger.warn(message));

  const ready = gateway.statuses().filter((p) => p.state === 'ready').map((p) => p.id);
  if (gateway.mode === 'live' && ready.length === 0) {
    logger.warn('PUBLISH_MODE=live but no platform has complete credentials; nothing can be posted');
  }

  const server = serve({ fetch: createApp(container).fetch, hostname: config.host, port: config.port }, (info) => {
    logger.info('server listening', {
      host: config.host,
      port: info.port,
      publishMode: gateway.mode,
      platformsReady: ready,
      authRequired: config.apiToken !== null,
    });
  });
  scheduler.start();

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('shutting down', { signal });
    // A post cut off here is caught by lease recovery on the next start.
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    server.close(() => {
      void scheduler.stop().finally(() => {
        db.close();
        process.exit(0);
      });
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
