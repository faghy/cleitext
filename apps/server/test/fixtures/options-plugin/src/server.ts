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

    // ACF blocks become a block of the plugin, with refs in its attributes (plugin API 1.49).
    ctx.blocks.register({
      type: 'options-kit/quote',
      title: 'Quote',
      schema: 'json',
      render: () => null,
    });
    ctx.hooks.filter('import.block', (blocks, { name, attrs }) => {
      if (blocks || name !== 'acf/quote') return blocks;
      const data = (attrs.data ?? {}) as Record<string, unknown>;
      return [
        {
          id: `quote-${Math.random().toString(36).slice(2, 10)}`,
          type: 'options-kit/quote',
          v: 1,
          attrs: {
            text: String(data.text ?? ''),
            who: { $user: 'user:marta' },
            topic: { $term: 'category:news' },
            photo: { $media: 'att:30' },
          },
        },
      ];
    });

    ctx.hooks.filter('import.wxrMeta', (result, context) => {
      // ACF's fields: `acf-field` items, settings serialized in their content.
      const fields = new Map<string, FieldDefinition>();
      for (const item of context.items) {
        if (item.type !== 'acf-field') continue;
        const settings = context.unserialize(item.content) as Record<string, unknown> | undefined;
        const type =
          settings?.type === 'number'
            ? 'number'
            : settings?.type === 'image'
              ? 'media'
              : settings?.type === 'user'
                ? 'user'
                : 'text';
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
                : field.type === 'user'
                  ? // WordPress's user id, as the export's author (plugin API 1.49).
                    {
                      $user:
                        context.authors.find((a) => String(a.id) === value)?.ref ?? 'user:none',
                    }
                  : value;
        }
        if (Object.keys(values).length > 0) entries[item.ref] = { acf: values };
      }
      const terms: Record<string, FieldValues> = {};
      for (const term of context.terms) {
        if (term.imported && term.meta.color)
          terms[term.ref] = {
            'acf-term': {
              color: term.meta.color,
              // A person known by email only: the member of the site with it.
              curator: { $user: `user:${term.meta.curator ?? ''}` },
            },
          };
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
            fields: [
              { name: 'color', type: 'color', label: 'Color' },
              { name: 'curator', type: 'user', label: 'Curator' },
            ],
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
        // ACF's post types and taxonomies (plugin API 1.49).
        contentTypes: [
          ...(result.contentTypes ?? []),
          { slug: 'book', name: { en: 'Books' }, hierarchical: true },
        ],
        taxonomies: [
          ...(result.taxonomies ?? []),
          { slug: 'genre', name: { en: 'Genres' }, contentTypes: ['book'] },
        ],
        warnings: [
          ...result.warnings,
          `options-kit saw authors ${context.authors.map((a) => `${a.id}=${a.ref}`).join(',')} and types ${JSON.stringify(context.types)} ${JSON.stringify(context.taxonomies)}`,
          `options-kit saw ${context.items.length} items (${fields.size} ACF fields), ${context.terms.length} terms (${withMeta} with meta), options: ${context.options === null ? 'none' : 'some'}, in ${context.locale}`,
        ],
      };
    });
  },
});
