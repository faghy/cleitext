import { definePlugin, type PluginContext } from '@cleitext/plugin-sdk';
import { challengeHtml } from './challenge';
import {
  adminSources,
  isTrusted,
  messageFor,
  normalizeConfig,
  protects,
  type CaptchaConfig,
} from './config';
import { cloudflareStatus, verifySubmission, type HttpSend } from './verify';

/**
 * Captcha (official plugin, shipped on its own): Cloudflare Turnstile or
 * Google reCAPTCHA on every form of the site, through the core's
 * `form.challenge` and `form.verify` filters (plugin API 1.38). The core's
 * forms ask by themselves; plugins with forms ask through `ctx.forms`.
 */

const CONFIG_KEY = 'config';
const SECRET = 'secret';
const FALLBACK_SECRET = 'fallback_secret';

interface SiteState {
  config: CaptchaConfig;
  secret: string | null;
  fallbackSecret: string | null;
}

/** Settings of a site, remembered a few seconds: the challenge is asked on every page with a form. */
function siteStates(ctx: PluginContext) {
  const memo = new Map<string, { state: Promise<SiteState>; at: number }>();
  return {
    get(siteId: string): Promise<SiteState> {
      const known = memo.get(siteId);
      if (known && Date.now() - known.at < 10_000) return known.state;
      const state = (async () => ({
        config: normalizeConfig(await ctx.storage.get(siteId, CONFIG_KEY)),
        secret: await ctx.secrets.get(siteId, SECRET),
        fallbackSecret: await ctx.secrets.get(siteId, FALLBACK_SECRET),
      }))();
      memo.set(siteId, { state, at: Date.now() });
      if (memo.size > 1000) memo.clear();
      state.catch(() => memo.delete(siteId));
      return state;
    },
    forget(siteId: string) {
      memo.delete(siteId);
    },
  };
}

/** The keys are set: the protection is on. */
const active = (state: SiteState) => Boolean(state.config.siteKey && state.secret);

export default definePlugin({
  setup(ctx) {
    const states = siteStates(ctx);
    const http: HttpSend = (request) => ctx.http.send(request);
    const cloudflareDown = cloudflareStatus(http);

    ctx.hooks.filter('form.challenge', async (html, context) => {
      const state = await states.get(context.siteId);
      if (!active(state) || !protects(state.config, context)) return html;
      return html + challengeHtml(state.config, context, ctx.assets.url('captcha.js'));
    });

    // The admin's Content Security Policy lets the sign-in widget load.
    ctx.hooks.filter('form.sources', async (sources, context) => {
      const state = await states.get(context.siteId);
      if (!active(state)) return sources;
      const mine = adminSources(state.config);
      return {
        script: [...sources.script, ...mine.script],
        frame: [...sources.frame, ...mine.frame],
      };
    });

    ctx.hooks.filter('form.verify', async (result, context) => {
      // Another plugin refused it already.
      if (result && !result.ok) return result;
      const state = await states.get(context.siteId);
      if (!active(state) || !protects(state.config, context)) return result;
      if (isTrusted(context.ip, state.config.trustedIps)) return result;
      const outcome = await verifySubmission(
        state.config,
        { secret: state.secret!, fallbackSecret: state.fallbackSecret },
        {
          form: context.form,
          fields: context.fields,
          ip: context.ip,
          ...(context.host ? { host: context.host } : {}),
        },
        http,
        cloudflareDown,
      );
      if (outcome.ok) {
        if (outcome.via === 'failsafe')
          ctx.log.warn('Submission let through by the failsafe', { form: context.form });
        return { ok: true };
      }
      ctx.log.info('Submission refused', { form: context.form, reason: outcome.reason });
      return { ok: false, message: messageFor(state.config, context.locale) };
    });

    // Settings. Secret keys are never sent back: only whether they are set.
    const view = async (siteId: string) => {
      const state = await states.get(siteId);
      return {
        config: state.config,
        secrets: { secret: Boolean(state.secret), fallbackSecret: Boolean(state.fallbackSecret) },
      };
    };
    ctx.routes.api({
      method: 'GET',
      path: '/settings',
      capability: 'manage_settings',
      handler: async (request) => ({ body: await view(request.siteId) }),
    });
    ctx.routes.api({
      method: 'PUT',
      path: '/settings',
      capability: 'manage_settings',
      async handler(request) {
        const body = (request.body ?? {}) as {
          config?: unknown;
          secrets?: Record<string, unknown>;
        };
        const config = normalizeConfig(body.config);
        const changes: [name: string, value: string | null][] = [];
        for (const [field, name] of [
          ['secret', SECRET],
          ['fallbackSecret', FALLBACK_SECRET],
        ] as const) {
          const value = body.secrets?.[field];
          // null removes a key; an empty string keeps it as it is.
          if (value === null) changes.push([name, null]);
          else if (typeof value === 'string' && /^[\w-]{10,200}$/.test(value.trim()))
            changes.push([name, value.trim()]);
          else if (typeof value === 'string' && value.trim())
            return { status: 400, body: { message: 'Invalid secret key.' } };
        }
        await ctx.storage.set(request.siteId, CONFIG_KEY, config);
        for (const [name, value] of changes) {
          if (value === null) await ctx.secrets.delete(request.siteId, name);
          else await ctx.secrets.set(request.siteId, name, value);
        }
        states.forget(request.siteId);
        // Cached pages hold the old widget.
        await ctx.cache.invalidate(request.siteId, ['site']);
        return { body: await view(request.siteId) };
      },
    });
  },
});
