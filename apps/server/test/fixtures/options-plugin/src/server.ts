import { definePlugin, type FieldDefinition, type FieldValues } from '@cleitext/plugin-sdk';

/**
 * Options pages and WordPress meta from a plugin (plugin API 1.48): an
 * options page of its own, its values read and saved through the plugin
 * API, and an `import.wxrMeta` filter that maps ACF-like meta (fields in
 * `acf-field` items, values with `_<name>` references) into a field group,
 * entry and term values, an options page and its values.
 */
export default definePlugin({
  setup(ctx) {
    ctx.fields.addOptionsPage?.({
      slug: 'options-kit-social',
      title: { en: 'Social profiles', it: 'Profili social' },
      parent: '/settings',
      icon: 'settings',
      fields: [{ name: 'instagram', type: 'url', label: 'Instagram' }],
    });

    ctx.routes.api({
      method: 'GET',
      path: '/options',
      capability: 'edit_entries',
      async handler(request) {
        const values = await ctx.fields.options!(request.siteId, request.query.page ?? '', {
          ...(request.query.locale ? { locale: request.query.locale } : {}),
        });
        return { body: values };
      },
    });
    ctx.routes.api({
      method: 'POST',
      path: '/options',
      capability: 'edit_entries',
      async handler(request) {
        const body = request.body as { page: string; values: FieldValues };
        try {
          return { body: await ctx.fields.updateOptions!(request.siteId, body.page, body.values) };
        } catch (error) {
          return { status: 400, body: { error: String(error) } };
        }
      },
    });
    ctx.routes.api({
      method: 'GET',
      path: '/pages',
      capability: 'edit_entries',
      async handler(request) {
        return { body: (await ctx.fields.optionsPages!(request.siteId)).map((p) => p.slug) };
      },
    });

    ctx.hooks.filter('import.wxrMeta', (result, context) => {
      // ACF's fields: `acf-field` items, settings serialized in their content.
      const fields = new Map<string, FieldDefinition>();
      for (const item of context.items) {
        if (item.type !== 'acf-field') continue;
        const settings = context.unserialize(item.content) as Record<string, unknown> | undefined;
        const type =
          settings?.type === 'number' ? 'number' : settings?.type === 'image' ? 'media' : 'text';
        fields.set(item.name, { name: item.excerpt, type, label: item.title } as FieldDefinition);
      }
      const group = context.items.find((item) => item.type === 'acf-field-group');
      const entries: Record<string, FieldValues> = {};
      for (const item of context.items) {
        if (!item.imported) continue;
        const values: FieldValues = {};
        for (const [key, value] of Object.entries(item.meta)) {
          const field = key.startsWith('_') ? undefined : fields.get(item.meta[`_${key}`] ?? '');
          if (!field) continue;
          values[field.name] =
            field.type === 'number'
              ? Number(value)
              : field.type === 'media'
                ? { $media: `att:${value}` }
                : value;
        }
        if (Object.keys(values).length > 0) entries[item.ref] = { acf: values };
      }
      const terms: Record<string, FieldValues> = {};
      for (const term of context.terms) {
        if (term.imported && term.meta.color)
          terms[term.ref] = { 'acf-term': { color: term.meta.color } };
      }
      const withMeta = context.terms.filter((t) => Object.keys(t.meta).length > 0).length;
      return {
        ...result,
        entries: { ...result.entries, ...entries },
        terms: { ...result.terms, ...terms },
        fieldGroups: [
          ...result.fieldGroups,
          {
            id: 'acf',
            title: group?.title ?? 'Imported',
            location: [[{ param: 'contentType', operator: '==', value: 'article' }]],
            fields: [...fields.values()],
          },
          {
            id: 'acf-term',
            title: 'Imported term fields',
            location: [[{ param: 'taxonomy', operator: '==', value: 'category' }]],
            fields: [{ name: 'color', type: 'color', label: 'Color' }],
          },
        ],
        optionsPages: [
          ...result.optionsPages,
          {
            slug: 'acf-options',
            title: 'Imported options',
            fields: [{ name: 'phone', type: 'text', label: 'Phone' }],
          },
        ],
        options: [...result.options, { page: 'acf-options', fields: { phone: '010 555' } }],
        warnings: [
          ...result.warnings,
          `options-kit saw ${context.items.length} items (${fields.size} ACF fields), ${context.terms.length} terms (${withMeta} with meta), options: ${context.options === null ? 'none' : 'some'}, in ${context.locale}`,
        ],
      };
    });
  },
});
