import { definePlugin, type PluginContext } from '@cleitext/plugin-sdk';
import { normalizeConfig, renderPage, secondsUntil, type MaintenanceConfig } from './page';

/**
 * Maintenance (official plugin, shipped on its own): while the site is in
 * maintenance mode (Settings → General, or `cleitext site:maintenance`),
 * visitors get this page instead of the theme's, with status 503. Signed-in
 * users still see the site.
 */

const KEY = 'config';

async function configOf(ctx: PluginContext, siteId: string): Promise<MaintenanceConfig> {
  return normalizeConfig(await ctx.storage.get(siteId, KEY));
}

export default definePlugin({
  setup(ctx) {
    ctx.hooks.filter('render.maintenance', async (page, context) => {
      // Another plugin answered first (lower priority): keep its page.
      if (page) return page;
      const config = await configOf(ctx, context.siteId);
      const retryAfter = secondsUntil(config.returnAt);
      return {
        html: renderPage({
          config,
          locale: context.locale,
          defaultLocale: context.defaultLocale,
          site: context.site,
        }),
        ...(retryAfter ? { retryAfter } : {}),
      };
    });

    ctx.routes.api({
      method: 'GET',
      path: '/config',
      capability: 'manage_settings',
      handler: async (request) => ({ body: await configOf(ctx, request.siteId) }),
    });

    ctx.routes.api({
      method: 'PUT',
      path: '/config',
      capability: 'manage_settings',
      async handler(request) {
        const config = normalizeConfig(request.body);
        await ctx.storage.set(request.siteId, KEY, config);
        return { body: config };
      },
    });
  },
});
