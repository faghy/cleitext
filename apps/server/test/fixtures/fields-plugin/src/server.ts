import { definePlugin, type CustomField } from '@cleitext/plugin-sdk';
import { z } from 'zod';

/**
 * Custom fields from a plugin (plugin API 1.47): a "rating" field type, a
 * group in code with rules, groups computed per site, a check before saving
 * and a dynamic source; a route reads the dynamic sources for the tests.
 */
export default definePlugin({
  setup(ctx) {
    ctx.fields.registerType({
      type: 'fields-kit/rating',
      settings: z.object({ max: z.number().int().min(1).max(10).optional() }),
      value: (field) =>
        z
          .number()
          .int()
          .min(1)
          .max(Number(((field as CustomField).settings as { max?: number } | undefined)?.max ?? 5)),
      format: (value) => ({ stars: Number(value), text: '★'.repeat(Number(value)) }),
      index: (value) => Number(value),
      export: (value) => value,
      kind: 'number',
    });
    // As before 1.47: by content type.
    ctx.content.registerFieldGroup({
      id: 'fields-kit-legacy',
      title: 'Legacy',
      types: ['article'],
      fields: [{ name: 'note', type: 'text', label: 'Note' }],
    });
    // With rules: pages of the "wide" template, or any entry of a category.
    ctx.fields.addGroup({
      id: 'fields-kit-review',
      title: 'Review',
      position: 'main',
      order: 5,
      location: [[{ param: 'template', operator: '==', value: 'wide' }]],
      fields: [
        { name: 'score', type: 'fields-kit/rating', label: 'Score', settings: { max: 3 } },
        { name: 'code', type: 'text', label: 'Code' },
      ],
    });
    ctx.fields.provideGroups((siteId) => [
      {
        id: 'fields-kit-term',
        title: `Term extras of ${siteId.slice(0, 4)}`,
        location: [[{ param: 'taxonomy', operator: '==', value: 'category' }]],
        fields: [{ name: 'color', type: 'color', label: 'Color', required: true }],
      },
    ]);
    ctx.hooks.filter('entry.validate', (errors, context) => {
      const review = context.fields['fields-kit-review'] as { code?: unknown } | undefined;
      return review?.code === 'bad'
        ? [...errors, { path: 'fields.fields-kit-review.code', message: 'Not this code.' }]
        : errors;
    });
    ctx.dynamic.registerSource({
      id: 'fields-kit:hello',
      label: 'Hello',
      type: 'text',
      resolve: ({ locale }) => `Hello (${locale})`,
    });
    ctx.routes.api({
      method: 'GET',
      path: '/resolve',
      capability: 'edit_entries',
      async handler(request) {
        const value = await ctx.dynamic.resolve(request.siteId, request.query.id ?? '', {
          locale: 'en',
          ...(request.query.entry ? { entry: { id: request.query.entry } } : {}),
          ...(request.query.term ? { term: { id: request.query.term } } : {}),
          ...(request.query.user ? { user: { id: request.query.user } } : {}),
        });
        return { body: { value: value ?? null } };
      },
    });
    ctx.routes.api({
      method: 'GET',
      path: '/groups',
      capability: 'edit_entries',
      async handler(request) {
        const groups = await ctx.fields.matching(request.siteId, {
          object: 'entry',
          contentType: request.query.type ?? 'page',
          template: request.query.template ?? null,
        });
        return { body: groups.map((g) => g.id) };
      },
    });
    ctx.routes.api({
      method: 'POST',
      path: '/site-group',
      capability: 'edit_entries',
      async handler(request) {
        const saved = await ctx.fields.siteGroups.save(request.siteId, request.body as never);
        return { body: saved };
      },
    });
  },
});
