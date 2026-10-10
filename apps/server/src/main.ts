import { createApp } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config/config.js';
import { createInstaller, needsInstall, setupToken } from './install/installer.js';

declare const PhusionPassenger: unknown;

async function main(): Promise<void> {
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

/** Serves the web installer (RF-SIT-02) until the first site exists. */
async function install(config: AppConfig): Promise<void> {
  let done!: () => void;
  const finished = new Promise<void>((resolve) => (done = resolve));
  const installer = await createInstaller({ config, onInstalled: () => done() });
  await installer.listen({ port: config.port, host: config.host });
  console.log(
    [
      'Cleitext is not installed yet.',
      `Open /install on this server and enter the setup token: ${setupToken(config)}`,
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
