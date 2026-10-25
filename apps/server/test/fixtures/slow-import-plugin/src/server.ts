import { definePlugin } from '@cleitext/plugin-sdk';

/** Waits longer than the test's interactive limit, then leaves a mark in the report. */
export default definePlugin({
  setup(ctx) {
    ctx.hooks.filter('import.wxrMeta', async (result, context) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        ...result,
        warnings: [...result.warnings, `Slow hook ran on ${context.items.length} items.`],
      };
    });
  },
});
