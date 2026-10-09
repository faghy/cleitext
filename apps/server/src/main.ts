import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config/config.js';

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

  const app = await createApp(config);
  await app.listen(config.port, config.host);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
