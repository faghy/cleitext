import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AdminController } from './admin/admin.controller.js';
import { AuditService } from './audit/audit.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthService } from './auth/auth.service.js';
import { IdentityService } from './auth/identity.service.js';
import { TwoFactorService } from './auth/two-factor.service.js';
import { PasskeyService } from './auth/passkey.service.js';
import { ApiTokenService } from './auth/api-token.service.js';
import { TokensController } from './auth/tokens.controller.js';
import { LoginThrottleService } from './auth/login-throttle.service.js';
import { SessionService, UserTokenService } from './auth/session.service.js';
import { ProblemDetailsFilter } from './common/problem.js';
import { EntriesController } from './content/entries.controller.js';
import { OEmbedController } from './content/oembed.controller.js';
import { StructureController } from './content/structure.controller.js';
import { StructureService } from './content/structure.service.js';
import { ThemesController } from './themes/themes.controller.js';
import { RedirectsController } from './settings/redirects.controller.js';
import { ThemesService } from './themes/themes.service.js';
import { EntriesService } from './content/entries.service.js';
import { SchedulerService } from './content/scheduler.service.js';
import { TermsController } from './content/terms.controller.js';
import { TermsService } from './content/terms.service.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { MailService } from './mail/mail.service.js';
import { MediaController } from './media/media.controller.js';
import { MediaService } from './media/media.service.js';
import { MenusController } from './menus/menus.controller.js';
import { MenusService } from './menus/menus.service.js';
import { PluginHost } from './plugins/plugin-host.service.js';
import { PluginRoutes } from './plugins/plugin-routes.js';
import { PluginServicesProvider } from './plugins/plugin-services.service.js';
import { PluginsController } from './plugins/plugins.controller.js';
import { ProfileController } from './profile/profile.controller.js';
import { TwoFactorController } from './profile/two-factor.controller.js';
import { PasskeysController } from './profile/passkeys.controller.js';
import { SecuritySettingsController } from './settings/security.controller.js';
import { PageCacheService } from './public/page-cache.service.js';
import { PublicService } from './public/public.service.js';
import { LocalesController } from './settings/locales.controller.js';
import { MailSettingsController } from './settings/mail-settings.controller.js';
import { SitesController } from './settings/sites.controller.js';
import { SettingsController } from './settings/settings.controller.js';
import { SettingsService } from './settings/settings.service.js';
import { SiteResolverService } from './tenancy/site-resolver.service.js';
import { UsersController } from './users/users.controller.js';
import { RolesController } from './users/roles.controller.js';
import { RolesService } from './users/roles.service.js';
import { UsersService } from './users/users.service.js';

@Global()
@Module({})
class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.logLevel,
            // Readable logs in development; JSON everywhere else.
            transport:
              config.env === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-csrf-token"]',
            ],
            autoLogging: {
              ignore: (req) => req.url?.startsWith('/health/') ?? false,
            },
          },
        }),
        DatabaseModule,
      ],
      controllers: [
        HealthController,
        AdminController,
        AuthController,
        UsersController,
        RolesController,
        ProfileController,
        TwoFactorController,
        PasskeysController,
        TokensController,
        SecuritySettingsController,
        OEmbedController,
        StructureController,
        ThemesController,
        RedirectsController,
        EntriesController,
        MediaController,
        TermsController,
        SettingsController,
        LocalesController,
        MailSettingsController,
        SitesController,
        MenusController,
        PluginsController,
      ],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
        AuditService,
        AuthService,
        EntriesService,
        IdentityService,
        TwoFactorService,
        PasskeyService,
        ApiTokenService,
        RolesService,
        StructureService,
        ThemesService,
        LoginThrottleService,
        MailService,
        MediaService,
        MenusService,
        PageCacheService,
        PluginHost,
        PluginRoutes,
        PluginServicesProvider,
        PublicService,
        SchedulerService,
        SettingsService,
        SessionService,
        SiteResolverService,
        TermsService,
        UserTokenService,
        UsersService,
      ],
    };
  }
}
