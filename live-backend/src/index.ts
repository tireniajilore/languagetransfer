/**
 * Entry point: validate config, start HTTP, wire shutdown.
 */
import { loadConfig } from './config';
import { createApp } from './server';
import { SessionRegistry } from './sessions';

function main(): void {
  const config = loadConfig(); // throws ConfigError on missing OPENAI_API_KEY
  const registry = new SessionRegistry();
  const app = createApp({ config, registry });

  const server = app.listen(config.port, () => {
    console.log(`[live-backend] listening on :${config.port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`[live-backend] ${signal} received; closing ${registry.size} session(s)`);
    registry.destroyAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
