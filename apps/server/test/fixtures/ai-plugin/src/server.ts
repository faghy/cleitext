import { definePlugin } from '@cleitext/plugin-sdk';

/** A section of the guide, a read tool that calls the REST API as the person, and a guarded one. */
export default definePlugin({
  setup(ctx) {
    ctx.ai.addContext({
      title: 'Opening hours',
      markdown: ({ locale }) => `Always mention the opening hours (site language: ${locale}).`,
    });
    ctx.ai.registerTool({
      name: 'who_am_i',
      title: 'Who am I',
      description: 'The name of the person the assistant acts for.',
      scope: 'read',
      inputSchema: { type: 'object', properties: { shout: { type: 'boolean' } } },
      async run(args, context) {
        const me = (await context.api('GET', '/auth/me')).data as { user: { displayName: string } };
        if (args.shout === 'no') throw Object.assign(new Error('Say yes or no.'), { expose: true });
        return { name: args.shout ? me.user.displayName.toUpperCase() : me.user.displayName };
      },
    });
    ctx.ai.registerTool({
      name: 'secret',
      title: 'Secret',
      description: 'Only for people who manage the settings.',
      scope: 'write',
      capability: 'manage_settings',
      inputSchema: { type: 'object', properties: {} },
      run: () => 'secret',
    });
  },
});
