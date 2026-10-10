import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config/config.js';
import { createInstaller, needsInstall, setupToken } from './install/installer.js';
import { createSetup, needsSetup } from './install/setup.js';
import { appRoot, ensureToken, tokenFile, tokenRequired } from './install/token.js';

declare const PhusionPassenger: unknown;

async function main(): Promise<void> {
  if (needsSetup()) {
    await setup();
    // Under Passenger the process may listen only once: the next request
    // starts a fresh one, which reads the new configuration.
    if (typeof PhusionPassenger !== 'undefined') process.exit(0);
    const env = join(appRoot(), '.env');
    if (existsSync(env)) process.loadEnvFile(env);
  }
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  if (await needsInstall(config)) {
    await install(config);
    // Under Passenger the process may listen only once: the next request
    // starts a fresh one, already installed.
    if (typeof PhusionPassenger !== 'undefined') process.exit(0);
  }
  const app = await createApp(config);
  await app.listen(config.port, config.host);
}

/** Serves the setup wizard (RF-SIT-02) until the configuration is written. */
async function setup(): Promise<void> {
  const root = appRoot();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  let done!: () => void;
  const finished = new Promise<void>((resolve) => (done = resolve));
  const wizard = await createSetup({ root, onConfigured: () => done() });
  await wizard.listen({ port, host });
  console.log(
    tokenRequired()
      ? [
          'Cleitext has no configuration yet.',
          `Open /install on this site and enter the setup token: ${ensureToken(root)}`,
          `(also in ${tokenFile(root)})`,
        ].join('\n')
      : 'Cleitext has no configuration yet: open /install on this site.',
  );
  await finished;
  await wizard.close();
}

/** Serves the web installer (RF-SIT-02) until the first site exists. */
async function install(config: AppConfig): Promise<void> {
  let done!: () => void;
  const finished = new Promise<void>((resolve) => (done = resolve));
  const installer = await createInstaller({ config, onInstalled: () => done() });
  await installer.listen({ port: config.port, host: config.host });
  console.log(
    [
      'Cleitext is not installed yet.',
      tokenRequired()
        ? `Open /install on this server and enter the setup token: ${setupToken(config)}`
        : 'Open /install on this server.',
      'Or install from the command line: cleitext install',
    ].join('\n'),
  );
  await finished;
  await installer.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
