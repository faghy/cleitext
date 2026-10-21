import { HttpException, Injectable, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import { AuthService } from '../auth/auth.service.js';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { clearSessionCookie, setSessionCookie } from '../auth/cookies.js';
import { verifySameOrigin } from '../auth/auth.guard.js';
import { AccountsService } from './accounts.service.js';
import { CommentsService } from './comments.service.js';
import { LikesService } from './likes.service.js';
import { say } from './limits.js';

/** `/it/account/login` → locale prefix `/it` and action `account/login`. */
const ACTION_RE = /^(\/[a-z]{2}(?:-[a-z]{2,4})?)?\/(account\/[a-z0-9-]+|comments|likes)$/i;
const VISITOR_COOKIE = 'cleitext_visitor';

type Body = Record<string, unknown>;
const text = (body: Body, key: string, max = 2000) => {
  const value = body[key];
  return typeof value === 'string' ? value.slice(0, max) : '';
};

/** A same-site path to go back to, never another site. */
export function safePath(value: string, fallback: string): string {
  return /^\/(?![/\\])[^\s]*$/.test(value) ? value : fallback;
}

/** Adds query parameters to a path, keeping its hash at the end. */
export function withQuery(path: string, params: Record<string, string>, hash = ''): string {
  const [base, oldHash] = path.split('#');
  const url = new URL(base ?? '/', 'http://local');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const h = hash || (oldHash ? `#${oldHash}` : '');
  return `${url.pathname}${url.search}${h}`;
}

/**
 * Forms of the public site (RF-USR-11, RF-COM): sign in, sign up, password,
 * profile, comments and likes. Each answers with a redirect (forms without
 * JavaScript) or JSON when asked (`Accept: application/json`).
 */
@Injectable()
export class CommunityPublic {
  private readonly logger = new Logger('Community');

  constructor(
    private readonly accounts: AccountsService,
    private readonly auth: AuthService,
    private readonly comments: CommentsService,
    private readonly likes: LikesService,
    private readonly plugins: PluginHost,
  ) {}

  /** True when the path is one of these forms (and it was handled). */
  async handlePost(
    request: FastifyRequest,
    reply: FastifyReply,
    siteId: string,
    defaultLocale: string,
    knownLocales: string[],
  ): Promise<boolean> {
    const path = new URL(request.url, 'http://local').pathname;
    const match = ACTION_RE.exec(path);
    if (!match) return false;
    const prefix = match[1] && knownLocales.includes(match[1].slice(1)) ? match[1] : '';
    if (match[1] && !prefix) return false;
    const locale = prefix ? prefix.slice(1) : defaultLocale;
    const action = match[2]!;
    const base = `${prefix}/account`;
    const json = (request.headers.accept ?? '').includes('application/json');
    void reply.header('cache-control', 'private, no-store').header('x-cache', 'BYPASS');
    try {
      verifySameOrigin(request);
    } catch {
      await reply.code(403).type('text/plain; charset=utf-8').send('Forbidden');
      return true;
    }
    const body = (request.body ?? {}) as Body;
    const origin = `${request.protocol}://${request.host}`;
    const client = {
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
      origin,
      locale,
    };
    const go = async (location: string, data: Record<string, unknown> = {}) => {
      if (json) await reply.code(200).send({ ok: true, redirect: location, ...data });
      else await reply.code(303).header('location', location).send();
    };
    const fail = async (location: string, message: string, status = 400) => {
      if (json) await reply.code(status).send({ ok: false, message });
      else await reply.code(303).header('location', location).send();
    };
    const message = (error: unknown) => {
      if (error instanceof HttpException) {
        return String((error.getResponse() as { message?: unknown })?.message ?? error.message);
      }
      this.logger.error(error);
      return say(locale, 'Something went wrong: try again.', 'Qualcosa è andato storto: riprova.');
    };
    const statusOf = (error: unknown) => (error instanceof HttpException ? error.getStatus() : 500);
    // Bots: they fill in the hidden field, or post in under two seconds.
    const isBot = () => {
      if (text(body, 'homepage')) return true;
      const ts = Number(text(body, 'ts'));
      return Number.isFinite(ts) && ts > 0 && Date.now() - ts < 2000;
    };

    /**
     * Bot protection from a plugin (`form.verify`, plugin API 1.38): the
     * refusal's message, or null when the submission may go on.
     */
    const refused = async (form: string): Promise<string | null> => {
      const result = await this.plugins.formVerify({
        siteId,
        form,
        locale,
        fields: body,
        ip: request.ip,
        host: request.hostname,
        signedIn: Boolean(request.auth && !request.auth.apiToken),
      });
      if (result.ok) return null;
      return (
        result.message ??
        say(
          locale,
          'Please confirm that you are not a robot, then try again.',
          'Conferma di non essere un robot, poi riprova.',
        )
      );
    };

    let handled = true;
    const run = async (): Promise<void> => {
      switch (action) {
        case 'account/login': {
          const redirect = safePath(text(body, 'redirect'), base);
          const email = text(body, 'email', 200).trim();
          const blocked = await refused('core/login');
          if (blocked)
            return void (await fail(
              withQuery(`${base}/login`, { error: blocked, email, redirect }),
              blocked,
            ));
          try {
            const result = await this.auth.login(
              siteId,
              {
                email,
                password: text(body, 'password', 300),
                remember: text(body, 'remember') === '1',
              },
              client,
            );
            if ('twoFactorRequired' in result) {
              return void (await go(
                withQuery(`${base}/login`, { step: '2fa', challenge: result.challenge, redirect }),
              ));
            }
            setSessionCookie(request, reply, result.token, {
              remember: text(body, 'remember') === '1',
              expiresAt: result.expiresAt,
            });
            return void (await go(redirect));
          } catch (error) {
            return void (await fail(
              withQuery(`${base}/login`, { error: message(error), email, redirect }),
              message(error),
              statusOf(error),
            ));
          }
        }
        case 'account/twofactor': {
          const redirect = safePath(text(body, 'redirect'), base);
          try {
            const result = await this.auth.loginTwoFactor(
              siteId,
              { challenge: text(body, 'challenge', 200), code: text(body, 'code', 30).trim() },
              client,
            );
            setSessionCookie(request, reply, result.token, {
              remember: result.remember,
              expiresAt: result.expiresAt,
            });
            return void (await go(redirect));
          } catch (error) {
            return void (await fail(
              withQuery(`${base}/login`, {
                step: '2fa',
                challenge: text(body, 'challenge', 200),
                redirect,
                error: message(error),
              }),
              message(error),
              statusOf(error),
            ));
          }
        }
        case 'account/register': {
          if (isBot()) return void (await go(`${base}/register?sent=1`));
          const values = { name: text(body, 'name', 80), email: text(body, 'email', 200) };
          const blocked = await refused('core/register');
          if (blocked)
            return void (await fail(
              withQuery(`${base}/register`, { error: blocked, ...values }),
              blocked,
            ));
          try {
            const result = await this.accounts.register(
              siteId,
              {
                displayName: values.name,
                email: values.email,
                password: text(body, 'password', 300),
                acceptTerms: text(body, 'terms') === '1',
              },
              client,
            );
            if (result.kind === 'verify') return void (await go(`${base}/register?sent=1`));
            setSessionCookie(request, reply, result.token, {
              remember: false,
              expiresAt: result.expiresAt,
            });
            return void (await go(`${base}?welcome=1`));
          } catch (error) {
            return void (await fail(
              withQuery(`${base}/register`, { error: message(error), ...values }),
              message(error),
              statusOf(error),
            ));
          }
        }
        case 'account/lost-password': {
          const email = text(body, 'email', 200).trim();
          const blocked = await refused('core/lost-password');
          if (blocked)
            return void (await fail(
              withQuery(`${base}/lost-password`, { error: blocked }),
              blocked,
            ));
          if (email)
            await this.auth.forgotPassword(
              siteId,
              email,
              client,
              `${origin}${base}/reset-password`,
            );
          return void (await go(`${base}/lost-password?sent=1`));
        }
        case 'account/reset-password': {
          const token = text(body, 'token', 200);
          const blocked = await refused('core/reset-password');
          if (blocked)
            return void (await fail(
              withQuery(`${base}/reset-password`, { token, error: blocked }),
              blocked,
            ));
          try {
            await this.auth.resetPassword(
              siteId,
              { token, password: text(body, 'password', 300) },
              client,
            );
            return void (await go(
              withQuery(`${base}/login`, {
                notice: say(
                  locale,
                  'Your password has been changed: sign in.',
                  'La password è stata cambiata: accedi.',
                ),
              }),
            ));
          } catch (error) {
            return void (await fail(
              withQuery(`${base}/reset-password`, { token, error: message(error) }),
              message(error),
              statusOf(error),
            ));
          }
        }
        case 'account/logout': {
          if (request.auth && !request.auth.apiToken)
            await this.auth.logout(siteId, request.auth, request.ip);
          clearSessionCookie(request, reply);
          return void (await go(prefix || '/'));
        }
        case 'account/profile':
        case 'account/password':
        case 'account/delete': {
          const viewer = request.auth;
          if (!viewer || viewer.apiToken)
            return void (await fail(
              `${base}/login`,
              say(locale, 'Sign in first.', 'Accedi prima.'),
              401,
            ));
          try {
            if (action === 'account/profile') {
              await this.accounts.updateProfile(
                siteId,
                viewer.userId,
                {
                  displayName: text(body, 'name', 80),
                  bio: text(body, 'bio', 2000),
                  website: text(body, 'website', 300),
                },
                locale,
              );
              return void (await go(
                withQuery(base, { notice: say(locale, 'Profile saved.', 'Profilo salvato.') }),
              ));
            }
            if (action === 'account/password') {
              await this.accounts.changePassword(
                siteId,
                viewer.userId,
                { current: text(body, 'current', 300), password: text(body, 'password', 300) },
                locale,
              );
              return void (await go(
                withQuery(base, { notice: say(locale, 'Password changed.', 'Password cambiata.') }),
              ));
            }
            await this.accounts.deleteAccount(
              siteId,
              viewer.userId,
              text(body, 'password', 300),
              locale,
            );
            clearSessionCookie(request, reply);
            return void (await go(prefix || '/'));
          } catch (error) {
            return void (await fail(
              withQuery(base, { error: message(error) }),
              message(error),
              statusOf(error),
            ));
          }
        }
        case 'comments': {
          const back = safePath(text(body, 'back', 500), prefix || '/');
          const viewer = request.auth && !request.auth.apiToken ? request.auth : null;
          // Signed-in people are known: the bot traps are for guests.
          if (!viewer && isBot())
            return void (await go(withQuery(back, { comment: 'pending' }, '#comments')));
          const blocked = await refused('core/comment');
          if (blocked)
            return void (await fail(
              withQuery(back, { 'comment-error': blocked }, '#respond'),
              blocked,
            ));
          try {
            const result = await this.comments.post(
              siteId,
              {
                entryId: text(body, 'entry', 64),
                parentId: text(body, 'parent', 64) || null,
                content: text(body, 'comment', 10_000),
                authorName: text(body, 'name', 120),
                authorEmail: text(body, 'email', 200),
                authorUrl: text(body, 'url', 300),
                notifyReplies: text(body, 'notify') === '1',
              },
              viewer
                ? {
                    userId: viewer.userId,
                    displayName: viewer.displayName,
                    email: viewer.email,
                    capabilities: viewer.capabilities,
                  }
                : null,
              client,
            );
            const hash = result.status === 'approved' ? `#comment-${result.id}` : '#comments';
            return void (await go(
              withQuery(
                back,
                { comment: result.status === 'approved' ? 'posted' : 'pending' },
                hash,
              ),
              { status: result.status, id: result.id },
            ));
          } catch (error) {
            return void (await fail(
              withQuery(back, { 'comment-error': message(error) }, '#respond'),
              message(error),
              statusOf(error),
            ));
          }
        }
        case 'likes': {
          const back = safePath(text(body, 'back', 500), prefix || '/');
          const viewer = request.auth && !request.auth.apiToken ? request.auth : null;
          let key = request.cookies[VISITOR_COOKIE];
          if (!viewer && !(key && /^[A-Za-z0-9_-]{20,64}$/.test(key))) {
            key = randomBytes(24).toString('base64url');
            void reply.setCookie(VISITOR_COOKIE, key, {
              path: '/',
              httpOnly: true,
              sameSite: 'lax',
              secure: request.protocol === 'https',
              maxAge: 400 * 24 * 3600,
            });
          }
          try {
            const result = await this.likes.toggle(
              siteId,
              text(body, 'entry', 64),
              viewer ? { userId: viewer.userId } : { visitorKey: key! },
              { ip: request.ip, locale },
            );
            const label = result.liked
              ? say(locale, 'Liked', 'Ti piace')
              : say(locale, 'Like', 'Mi piace');
            return void (await go(back, { ...result, label }));
          } catch (error) {
            return void (await fail(back, message(error), statusOf(error)));
          }
        }
        default:
          handled = false;
      }
    };
    try {
      await run();
    } catch (error) {
      this.logger.error(error);
      await reply.code(500).type('text/plain; charset=utf-8').send('Internal Server Error');
    }
    return handled;
  }
}
