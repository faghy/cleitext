import { definePlugin } from '@cleitext/plugin-sdk';

/**
 * A fake protection: the challenge is a marker with the form, the language
 * and whether the visitor is signed in; a submission passes with
 * `guard-token=pass`.
 */
export default definePlugin({
  setup(ctx) {
    ctx.hooks.filter(
      'form.challenge',
      (html, context) =>
        `${html}<input type="hidden" name="guard-form" value="${context.form}|${context.locale}|${context.signedIn ? 1 : 0}">`,
    );
    ctx.hooks.filter('form.verify', (result, context) => {
      if (result && !result.ok) return result;
      const token = context.fields['guard-token'];
      if (token === 'pass') return { ok: true };
      // The verdicts of plugin API 1.45.
      if (token === 'spam') return { ok: true, spam: true, message: 'Held as spam' };
      if (token === 'silent') return { ok: false, silent: true };
      if (token === 'challenge') return { ok: false, challenge: true, message: 'Solve it' };
      return {
        ok: false,
        message: context.locale.startsWith('it') ? 'La guardia dice no' : 'The guard says no',
      };
    });

    // The admin's CSP: only valid https origins are kept.
    ctx.hooks.filter('form.sources', (sources) => ({
      script: [...sources.script, 'https://guard.example', "'unsafe-inline'"],
      frame: [...sources.frame, 'https://guard.example/frames/', 'http://insecure.example'],
    }));

    // A plugin's own form, through ctx.forms.
    ctx.routes.public({
      method: 'POST',
      path: '/_guard/send',
      async handler(request) {
        const input = {
          siteId: request.siteId,
          form: 'guard/form',
          locale: request.locale,
          signedIn: request.user !== null,
        };
        const verdict = await ctx.forms.verify({
          ...input,
          fields: (request.body ?? {}) as Record<string, unknown>,
          ip: request.ip,
          ...((request.body as Record<string, unknown> | null)?.hold === '1' ? { hold: true } : {}),
        });
        return { body: { ...verdict, challenge: await ctx.forms.challenge(input) } };
      },
    });
  },
});
