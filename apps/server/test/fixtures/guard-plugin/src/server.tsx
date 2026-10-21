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
      if (context.fields['guard-token'] === 'pass') return { ok: true };
      return {
        ok: false,
        message: context.locale.startsWith('it') ? 'La guardia dice no' : 'The guard says no',
      };
    });

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
        });
        return { body: { ...verdict, challenge: await ctx.forms.challenge(input) } };
      },
    });
  },
});
