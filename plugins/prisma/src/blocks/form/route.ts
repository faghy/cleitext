import type {
  FieldDefinition,
  PluginContext,
  RouteRequest,
  RouteResponse,
} from '@cleitext/plugin-sdk';
import type { Attrs } from '../../lib/types';
import { captchaMode, safeRedirect, SITE_CAPTCHA_FORM, SUBMIT_PATH } from './schema';
import {
  checkValues,
  composeEmail,
  findForm,
  formFields,
  recipientsOf,
  returnPath,
  spamVerdict,
  valuesOf,
} from './submit';
import { formKey, tokenTime } from './token';

/**
 * Where the forms' messages arrive (a public POST route). Nothing the
 * browser sends decides where the email goes: the form is read back from
 * the saved page (entry and block id), its fields checked, and the email
 * sent to the addresses saved in it. Answers JSON to the page's script and
 * a redirect to the page without JavaScript.
 */

/** Settings of the forms (Settings → Prisma), to add to the plugin's settings. */
export const FORM_SETTINGS: FieldDefinition[] = [
  {
    name: 'formRecipient',
    type: 'text',
    maxLength: 400,
    label: { en: 'Form messages to', it: 'Messaggi dei moduli a' },
    help: {
      en: 'Email address(es), comma separated, for forms that do not set their own.',
      it: 'Indirizzi email, separati da virgole, per i moduli che non ne indicano uno.',
    },
  },
  {
    name: 'recaptchaSiteKeyV2',
    type: 'text',
    maxLength: 200,
    label: { en: 'reCAPTCHA v2 site key', it: 'Chiave del sito reCAPTCHA v2' },
  },
  {
    name: 'recaptchaSecretKeyV2',
    type: 'text',
    maxLength: 200,
    label: { en: 'reCAPTCHA v2 secret key', it: 'Chiave segreta reCAPTCHA v2' },
  },
  {
    name: 'recaptchaSiteKeyV3',
    type: 'text',
    maxLength: 200,
    label: { en: 'reCAPTCHA v3 site key', it: 'Chiave del sito reCAPTCHA v3' },
  },
  {
    name: 'recaptchaSecretKeyV3',
    type: 'text',
    maxLength: 200,
    label: { en: 'reCAPTCHA v3 secret key', it: 'Chiave segreta reCAPTCHA v3' },
  },
];

/** At most this many messages per visitor and site in the window. */
const RATE_LIMIT = { max: 10, windowMs: 10 * 60_000 };
const recent = new Map<string, number[]>();

/** Per-process limiter: enough against casual abuse on a single server. */
export function allowed(key: string, now = Date.now()): boolean {
  const times = (recent.get(key) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (times.length >= RATE_LIMIT.max) return false;
  times.push(now);
  recent.set(key, times);
  if (recent.size > 10_000) recent.clear();
  return true;
}

const one = (body: Record<string, unknown>, name: string) => valuesOf(body, name)[0] ?? '';

/**
 * Google's answer to a reCAPTCHA response: whether the visitor passed. With
 * the check on and only one of the two keys set, nothing passes (as in
 * Spectra); with neither, the check is skipped.
 */
async function captchaPassed(
  ctx: PluginContext,
  form: Attrs,
  settings: Attrs,
  response: string,
  ip: string,
): Promise<boolean> {
  const mode = captchaMode(form, settings);
  if (mode === 'broken') return false;
  if (mode === 'site') return true;
  const v = form.reCaptchaType === 'v3' ? 'V3' : 'V2';
  const site = String(
    settings[`recaptchaSiteKey${v}`] || form[`reCaptchaSiteKey${v}`] || '',
  ).trim();
  const secret = String(
    settings[`recaptchaSecretKey${v}`] || form[`reCaptchaSecretKey${v}`] || '',
  ).trim();
  if (!site && !secret) return true;
  if (!site || !secret || !response) return false;
  try {
    const answer = await ctx.http.send({
      url: 'https://www.google.com/recaptcha/api/siteverify',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response, remoteip: ip }).toString(),
      timeoutMs: 10_000,
    });
    return Boolean((JSON.parse(answer.text) as { success?: unknown }).success === true);
  } catch (error) {
    ctx.log.warn('reCAPTCHA check failed', { error: String(error) });
    return false;
  }
}

export function registerFormRoutes(ctx: PluginContext): void {
  ctx.routes.public({
    method: 'POST',
    path: SUBMIT_PATH,
    async handler(request: RouteRequest): Promise<RouteResponse> {
      const body = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<
        string,
        unknown
      >;
      const formId = one(body, '_pr_form')
        .replace(/[^A-Za-z0-9_-]/g, '')
        .slice(0, 40);
      const entryId = one(body, '_pr_entry').slice(0, 64);
      const json = (request.headers.accept ?? '').includes('application/json');
      const back = returnPath(request.headers.referer, request.origin);
      const reply = (
        ok: boolean,
        extra: {
          errors?: Record<string, string>;
          redirect?: string;
          status?: number;
          message?: string;
        } = {},
      ): RouteResponse => {
        if (json) {
          return {
            status: extra.status ?? (ok ? 200 : 400),
            body: {
              ok,
              ...(extra.errors ? { errors: extra.errors } : {}),
              ...(extra.message ? { message: extra.message } : {}),
              ...(extra.redirect ? { redirect: extra.redirect } : {}),
            },
          };
        }
        const location =
          ok && extra.redirect
            ? extra.redirect
            : `${back}#pr-form-${formId}-${ok ? 'sent' : 'error'}`;
        return { status: 303, headers: { location } };
      };

      // Bots fill the hidden field: they are told it worked.
      const honeypot = one(body, '_pr_website');
      if (!formId || !entryId) return reply(false);

      const entry = (
        await ctx.content.find(request.siteId, {
          ids: [entryId],
          status: 'any',
          withDocument: true,
          limit: 1,
        })
      )[0];
      const form = entry ? findForm(entry.document?.blocks, formId) : null;
      if (!entry || !form) return reply(false, { status: 404 });
      const attrs = (form.attrs ?? {}) as Attrs;
      const success = () =>
        reply(true, {
          ...(attrs.confirmationType === 'url' && safeRedirect(attrs.confirmationUrl)
            ? { redirect: safeRedirect(attrs.confirmationUrl) }
            : {}),
        });

      let drawnAt: number | null = null;
      try {
        drawnAt = await tokenTime(
          await formKey(ctx, request.siteId),
          entryId,
          one(body, '_pr_token'),
        );
      } catch (error) {
        ctx.log.error('Form key not available', { error: String(error) });
      }
      const verdict = spamVerdict({
        honeypot,
        drawnAt,
        now: Date.now(),
        ...(valuesOf(body, '_pr_elapsed').length ? { elapsed: one(body, '_pr_elapsed') } : {}),
      });
      if (verdict === 'bot') return success();
      if (verdict === 'quick') return reply(false, { status: 429 });
      if (!allowed(`${request.siteId}|${request.ip}`)) return reply(false, { status: 429 });

      const settings = ((await ctx.settings.get(request.siteId).catch(() => ({}))) ?? {}) as Attrs;
      if (!(await captchaPassed(ctx, attrs, settings, one(body, '_pr_captcha'), request.ip)))
        return reply(false, { status: 403 });
      if (captchaMode(attrs, settings) === 'site') {
        // The site's bot protection (Captcha plugin), when there is one.
        const site = await ctx.forms?.verify({
          siteId: request.siteId,
          form: SITE_CAPTCHA_FORM,
          locale: request.locale,
          fields: body,
          ip: request.ip,
          host: (request.headers.host ?? '').replace(/:\d+$/, ''),
          signedIn: request.user !== null,
        });
        if (site && !site.ok)
          return reply(false, { status: 403, ...(site.message ? { message: site.message } : {}) });
      }

      const checked = checkValues(formFields(form), body);
      if (Object.keys(checked.errors).length)
        return reply(false, { errors: checked.errors, status: 422 });

      if (attrs.sendAfterSubmitEmail === false) return success();
      const { to, cc, bcc } = recipientsOf(attrs, settings.formRecipient);
      if (to.length === 0) {
        ctx.log.warn('Form without recipients', { entry: entryId, form: formId });
        return reply(false, { status: 500 });
      }
      const site = await ctx.site(request.siteId).catch(() => null);
      const mail = composeEmail({
        subject: attrs.afterSubmitEmailSubject,
        entries: checked.entries,
        siteName: site?.name ?? '',
        pageUrl: entry.url ? new URL(entry.url, request.origin).href : '',
      });
      // One message per address: the mail API has no Cc/Bcc, and no
      // recipient sees the others' addresses.
      const send = (address: string) =>
        ctx.mail.send({
          siteId: request.siteId,
          to: address,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          ...(checked.replyTo ? { replyTo: checked.replyTo } : {}),
        });
      const results = await Promise.allSettled(to.map(send));
      for (const address of [...cc, ...bcc])
        await send(address).catch((error: unknown) =>
          ctx.log.error('Form copy not sent', { error: String(error) }),
        );
      if (results.some((r) => r.status === 'rejected')) {
        ctx.log.error('Form message not sent', {
          error: String(results.find((r) => r.status === 'rejected')?.reason ?? ''),
        });
        if (results.every((r) => r.status === 'rejected')) return reply(false, { status: 502 });
      }
      return success();
    },
  });
}
