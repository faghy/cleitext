import { definePlugin } from '@cleitext/plugin-sdk';

/**
 * A fake transport, by recipient: `smtp…` goes through an SMTP server it
 * names, `local…` through one that is not allowed, `fail…` makes it throw,
 * anything else it "delivers" itself with its own sender.
 */
export default definePlugin({
  setup(ctx) {
    ctx.hooks.filter('mail.deliver', (result, { message }) => {
      if (result) return result;
      const to = message.to.join(',');
      if (to.startsWith('fail')) throw new Error('the courier is on strike');
      if (to.startsWith('smtp'))
        return { smtp: { host: 'smtp.courier.example', port: 587, security: 'starttls' } };
      if (to.startsWith('local'))
        return { smtp: { host: '127.0.0.1', port: 25, security: 'none' } };
      return { delivered: true, from: 'Courier <out@courier.example>' };
    });
  },
});
