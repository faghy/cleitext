import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuditService } from './audit/audit.service.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthService } from './auth/auth.service.js';
import { IdentityService } from './auth/identity.service.js';
import { LoginThrottleService } from './auth/login-throttle.service.js';
import { SessionService, UserTokenService } from './auth/session.service.js';
import { ProblemDetailsFilter } from './common/problem.js';
import { EntriesController } from './content/entries.controller.js';
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
import { ProfileController } from './profile/profile.controller.js';
import { PageCacheService } from './public/page-cache.service.js';
import { PublicService } from './public/public.service.js';
import { SettingsController } from './settings/settings.controller.js';
import { SettingsService } from './settings/settings.service.js';
import { SiteResolverService } from './tenancy/site-resolver.service.js';
import { UsersController } from './users/users.controller.js';
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
        AuthController,
        UsersController,
        ProfileController,
        EntriesController,
        MediaController,
        TermsController,
        SettingsController,
        MenusController,
      ],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
        AuditService,
        AuthService,
        EntriesService,
        IdentityService,
        LoginThrottleService,
        MailService,
        MediaService,
        MenusService,
        PageCacheService,
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
