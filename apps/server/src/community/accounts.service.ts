import {
  findLogin,
  newId,
  roles,
  siteMembers,
  sites,
  superAdmins,
  users,
  withContext,
  type DatabaseClient,
  type SiteTransaction,
} from '@cleitext/db';
import type { CoreSettings } from '@cleitext/shared';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { ClientInfo } from '../auth/auth.service.js';
import { hashPassword, verifyPassword } from '../auth/crypto.js';
import { assertPasswordNotBreached } from '../auth/password-policy.js';
import { SessionService, UserTokenService } from '../auth/session.service.js';
import { DATABASE } from '../database/database.module.js';
import { MailService } from '../mail/mail.service.js';
import { PageCacheService } from '../public/page-cache.service.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { allow, say, slugify } from './limits.js';

const VERIFY_TTL_MS = 48 * 3600 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Capabilities a sign-up may never get, whatever the default role says. */
const NEVER_ON_SIGN_UP = [
  'manage_users',
  'promote_users',
  'manage_settings',
  'manage_plugins',
  'activate_plugins',
  'manage_themes',
  'edit_theme_settings',
  'manage_content_types',
  'manage_taxonomies',
  'unfiltered_html',
  'view_audit_log',
  'manage_sites',
];

export interface VerifyMeta {
  siteId: string;
  /** Someone with an account elsewhere joins this site. */
  join?: boolean;
}

export interface PublicProfile {
  id: string;
  email: string;
  displayName: string;
  bio: string;
  website: string | null;
  slug: string | null;
}

export type RegisterOutcome =
  { kind: 'verify' } | { kind: 'signed-in'; userId: string; token: string; expiresAt: Date };

/**
 * Accounts made by visitors (RF-USR-11): sign-up with the site's default
 * role, email confirmation, the public profile and leaving the site.
 */
@Injectable()
export class AccountsService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseClient,
    private readonly settings: SettingsService,
    private readonly sessions: SessionService,
    private readonly tokens: UserTokenService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly plugins: PluginHost,
    private readonly cache: PageCacheService,
  ) {}

  /**
   * Creates an account, or asks to confirm the address. The answer is the
   * same whether the address is new or not, so it cannot reveal accounts.
   */
  async register(
    siteId: string,
    input: { displayName: string; email: string; password: string; acceptTerms: boolean },
    client: ClientInfo & { locale: string },
  ): Promise<RegisterOutcome> {
    const settings = await this.settings.getCore(siteId);
    if (!settings.registration)
      throw new ForbiddenException(
        say(
          client.locale,
          'Sign-ups are closed on this site.',
          'Le iscrizioni a questo sito sono chiuse.',
        ),
      );
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!displayName)
      throw new BadRequestException(say(client.locale, 'Write your name.', 'Scrivi il tuo nome.'));
    if (!EMAIL_RE.test(email) || email.length > 200) {
      throw new BadRequestException(
        say(
          client.locale,
          'This email address is not valid.',
          'Questo indirizzo email non è valido.',
        ),
      );
    }
    if (settings.termsPage && !input.acceptTerms) {
      throw new BadRequestException(
        say(client.locale, 'Accept the terms to sign up.', 'Accetta le condizioni per iscriverti.'),
      );
    }
    if (input.password.length < 8 || input.password.length > 200) {
      throw new BadRequestException(
        say(
          client.locale,
          'Choose a password of at least 8 characters.',
          'Scegli una password di almeno 8 caratteri.',
        ),
      );
    }
    assertPasswordNotBreached(input.password);
    if (
      !allow(`register:ip:${client.ip}`, 5, 3600_000) ||
      !allow(`register:email:${email}`, 3, 3600_000)
    ) {
      throw new HttpException(
        say(
          client.locale,
          'Too many sign-ups from here: try again later.',
          'Troppe iscrizioni da qui: riprova più tardi.',
        ),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const existing = await findLogin(this.database.db, email);
    const siteName = await this.siteName(siteId);
    if (existing) {
      const member = await withContext(
        this.database.db,
        { siteId, userId: existing.userId },
        async (tx) => {
          const [row] = await tx
            .select({ userId: siteMembers.userId })
            .from(siteMembers)
            .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, existing.userId)));
          return Boolean(row);
        },
      );
      if (member) {
        await this.mail.send(
          {
            to: email,
            subject: say(
              client.locale,
              `You already have an account on ${siteName}`,
              `Hai già un account su ${siteName}`,
            ),
            text: [
              say(
                client.locale,
                `Someone tried to sign up on ${siteName} with ${email}, which already has an account.`,
                `Qualcuno ha provato a iscriversi a ${siteName} con ${email}, che ha già un account.`,
              ),
              '',
              say(client.locale, 'Sign in here:', 'Accedi qui:'),
              `${client.origin}/account/login`,
              say(
                client.locale,
                'Forgot the password? Choose a new one here:',
                'Password dimenticata? Scegline una nuova qui:',
              ),
              `${client.origin}/account/lost-password`,
            ].join('\n'),
          },
          siteId,
        );
      } else {
        // An account of another site joins this one once the address is confirmed.
        const token = await this.tokens.issue({
          kind: 'email_verify',
          userId: existing.userId,
          ttlMs: VERIFY_TTL_MS,
          meta: { siteId, join: true } satisfies VerifyMeta,
        });
        await this.sendVerify(siteId, email, token, siteName, client);
      }
      return { kind: 'verify' };
    }

    const passwordHash = await hashPassword(input.password);
    const userId = newId();
    const pending = settings.verifyEmail;
    await withContext(this.database.db, { siteId }, async (tx) => {
      const role = await this.signUpRole(tx, siteId, settings);
      await this.insertUser(tx, {
        id: userId,
        email,
        displayName,
        passwordHash,
        status: pending ? 'pending' : 'active',
        emailVerifiedAt: pending ? null : new Date(),
        locale: client.locale.startsWith('it') ? 'it' : 'en',
      });
      await tx.insert(siteMembers).values({ siteId, userId, roleId: role.id });
      await this.audit.record(tx, {
        siteId,
        userId,
        action: 'user.registered',
        targetType: 'user',
        targetId: userId,
        meta: { email, role: role.slug },
        ip: client.ip,
      });
    });
    await this.plugins.emit(
      'user.registered',
      { user: { id: userId, email, displayName } },
      siteId,
      userId,
    );

    if (pending) {
      const token = await this.tokens.issue({
        kind: 'email_verify',
        userId,
        ttlMs: VERIFY_TTL_MS,
        meta: { siteId } satisfies VerifyMeta,
      });
      await this.sendVerify(siteId, email, token, siteName, client);
      return { kind: 'verify' };
    }
    const session = await this.sessions.create({
      userId,
      remember: false,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    return { kind: 'signed-in', userId, ...session };
  }

  /** Confirms an address: the account becomes active (or joins the site) and signs in. */
  async verify(siteId: string, token: string, client: ClientInfo & { locale: string }) {
    const record = await this.tokens.peek('email_verify', token);
    const meta = record?.meta as VerifyMeta | undefined;
    const gone = new HttpException(
      say(
        client.locale,
        'This link is invalid or has expired.',
        'Questo link non è valido o è scaduto.',
      ),
      HttpStatus.GONE,
    );
    if (!record || meta?.siteId !== siteId) throw gone;
    if (!(await this.tokens.consume('email_verify', token))) throw gone;
    const settings = await this.settings.getCore(siteId);
    await withContext(this.database.db, { siteId, userId: record.userId }, async (tx) => {
      if (meta.join) {
        const role = await this.signUpRole(tx, siteId, settings);
        await tx
          .insert(siteMembers)
          .values({ siteId, userId: record.userId, roleId: role.id })
          .onConflictDoNothing();
      }
      await tx
        .update(users)
        .set({
          emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
          status: sql`case when ${users.status} = 'pending' then 'active' else ${users.status} end`,
        })
        .where(eq(users.id, record.userId));
      await this.audit.record(tx, {
        siteId,
        userId: record.userId,
        action: 'user.email.verified',
        ip: client.ip,
      });
    });
    const session = await this.sessions.create({
      userId: record.userId,
      remember: false,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    return { userId: record.userId, ...session };
  }

  async profile(siteId: string, userId: string): Promise<PublicProfile | null> {
    return withContext(this.database.db, { siteId, userId }, async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      return user
        ? {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            bio: user.bio,
            website: user.website,
            slug: user.slug,
          }
        : null;
    });
  }

  /** Name, bio and website of one's own account, from the site's profile page. */
  async updateProfile(
    siteId: string,
    userId: string,
    input: { displayName: string; bio: string; website: string },
    locale: string,
  ): Promise<void> {
    const displayName = input.displayName.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!displayName)
      throw new BadRequestException(say(locale, 'Write your name.', 'Scrivi il tuo nome.'));
    const website = input.website.trim();
    if (website && !/^https?:\/\/[^\s]+$/i.test(website)) {
      throw new BadRequestException(
        say(locale, 'The website must start with https://', 'Il sito deve iniziare con https://'),
      );
    }
    await withContext(this.database.db, { siteId, userId }, (tx) =>
      tx
        .update(users)
        .set({
          displayName,
          bio: input.bio.trim().slice(0, 2000),
          website: website ? website.slice(0, 300) : null,
        })
        .where(eq(users.id, userId)),
    );
    await this.cache.invalidate(siteId, [`author:${userId}`]);
  }

  async changePassword(
    siteId: string,
    userId: string,
    input: { current: string; password: string },
    locale: string,
  ): Promise<void> {
    if (input.password.length < 8)
      throw new BadRequestException(
        say(
          locale,
          'Choose a password of at least 8 characters.',
          'Scegli una password di almeno 8 caratteri.',
        ),
      );
    assertPasswordNotBreached(input.password);
    await withContext(this.database.db, { siteId, userId }, async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, input.current))) {
        throw new BadRequestException(
          say(
            locale,
            'The current password is not correct.',
            'La password attuale non è corretta.',
          ),
        );
      }
      await tx
        .update(users)
        .set({ passwordHash: await hashPassword(input.password) })
        .where(eq(users.id, userId));
      await this.audit.record(tx, { siteId, userId, action: 'user.password.changed' });
    });
  }

  /**
   * Leaves the site: the membership goes, and the whole account when it
   * belongs to no other site. Comments stay, without the link to the account.
   */
  async deleteAccount(
    siteId: string,
    userId: string,
    password: string,
    locale: string,
  ): Promise<void> {
    await withContext(this.database.db, { siteId, userId }, async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId));
      if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
        throw new BadRequestException(
          say(locale, 'The password is not correct.', 'La password non è corretta.'),
        );
      }
      const [admin] = await tx.select().from(superAdmins).where(eq(superAdmins.userId, userId));
      const [membership] = await tx
        .select({ caps: roles.capabilities })
        .from(siteMembers)
        .innerJoin(roles, eq(roles.id, siteMembers.roleId))
        .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, userId)));
      if (admin || membership?.caps.includes('manage_users')) {
        throw new ForbiddenException(
          say(
            locale,
            'Administrators remove their account from the admin.',
            'Gli amministratori rimuovono il loro account dall’amministrazione.',
          ),
        );
      }
      await this.audit.record(tx, {
        siteId,
        userId,
        action: 'user.account.deleted',
        targetType: 'user',
        targetId: userId,
      });
      await tx
        .delete(siteMembers)
        .where(and(eq(siteMembers.siteId, siteId), eq(siteMembers.userId, userId)));
    });
    await this.sessions.revokeAll(userId);
    // No other site? The account goes too (cleitext_delete_orphan_user runs as owner).
    await this.database.db.execute(sql`select cleitext_delete_orphan_user(${userId}::uuid)`);
  }

  private async signUpRole(tx: SiteTransaction, siteId: string, settings: CoreSettings) {
    const candidates = await tx
      .select()
      .from(roles)
      .where(
        and(
          or(isNull(roles.siteId), eq(roles.siteId, siteId)),
          or(eq(roles.slug, settings.defaultRole), eq(roles.slug, 'subscriber')),
        ),
      );
    const wanted =
      candidates.find((r) => r.slug === settings.defaultRole && r.siteId === siteId) ??
      candidates.find((r) => r.slug === settings.defaultRole);
    // A default role with powers over the site is never given to strangers.
    const safe =
      wanted && !wanted.capabilities.some((c) => NEVER_ON_SIGN_UP.includes(c))
        ? wanted
        : candidates.find((r) => r.slug === 'subscriber');
    if (!safe) throw new BadRequestException('The site has no role for new accounts.');
    return safe;
  }

  /** New user with a unique public slug (taken slugs get a short suffix). */
  private async insertUser(
    tx: SiteTransaction,
    values: {
      id: string;
      email: string;
      displayName: string;
      passwordHash: string;
      status: 'active' | 'pending';
      emailVerifiedAt: Date | null;
      locale: string;
    },
  ): Promise<void> {
    const base = slugify(values.displayName);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`;
      try {
        // A nested transaction (savepoint): a taken slug does not spoil the outer one.
        await tx.transaction((inner) => inner.insert(users).values({ ...values, slug }));
        return;
      } catch (error) {
        const cause = ((error as { cause?: unknown }).cause ?? error) as {
          code?: string;
          constraint_name?: string;
        };
        if (cause.code !== '23505' || cause.constraint_name !== 'users_slug_unique') throw error;
      }
    }
    throw new HttpException('Could not create the account: try again.', HttpStatus.CONFLICT);
  }

  private async sendVerify(
    siteId: string,
    email: string,
    token: string,
    siteName: string,
    client: ClientInfo & { locale: string },
  ) {
    await this.mail.send(
      {
        to: email,
        subject: say(
          client.locale,
          `Confirm your email for ${siteName}`,
          `Conferma la tua email per ${siteName}`,
        ),
        text: [
          say(
            client.locale,
            `Thank you for signing up on ${siteName}.`,
            `Grazie per esserti iscritto a ${siteName}.`,
          ),
          '',
          say(
            client.locale,
            'Confirm your address by opening this link within 48 hours:',
            'Conferma il tuo indirizzo aprendo questo link entro 48 ore:',
          ),
          `${client.origin}/account/verify?token=${token}`,
          '',
          say(
            client.locale,
            'If you did not sign up, ignore this email.',
            'Se non ti sei iscritto tu, ignora questa email.',
          ),
        ].join('\n'),
      },
      siteId,
    );
  }

  private async siteName(siteId: string): Promise<string> {
    return withContext(this.database.db, { siteId }, async (tx) => {
      const [site] = await tx.select({ name: sites.name }).from(sites).where(eq(sites.id, siteId));
      return site?.name ?? 'Cleitext';
    });
  }
}
