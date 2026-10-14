import { createDatabase, type DatabaseClient } from '@cleitext/db';
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

/** Injection token for the application-role database client. */
export const DATABASE = Symbol('DATABASE');

/**
 * Same role, separate pool: plugin transactions run as the plugin's role on a
 * connection of their own, often while a request holds one of `DATABASE`.
 * From one pool they could wait on each other until it runs dry.
 */
export const PLUGIN_DATABASE = Symbol('PLUGIN_DATABASE');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): DatabaseClient =>
        createDatabase(config.database.url, { max: config.database.poolMax }),
    },
    {
      provide: PLUGIN_DATABASE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): DatabaseClient =>
        createDatabase(config.database.url, { max: config.database.poolMax }),
    },
  ],
  exports: [DATABASE, PLUGIN_DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE) private readonly client: DatabaseClient,
    @Inject(PLUGIN_DATABASE) private readonly pluginClient: DatabaseClient,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([this.client.close(), this.pluginClient.close()]);
  }
}
