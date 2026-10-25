import {
  defineBlock,
  definePlugin,
  type CustomField,
  type CxdBlock,
  type FieldDefinition,
  type FieldValues,
} from '@cleitext/plugin-sdk';

/** What the actions saw, read back by the tests. */
const events: unknown[] = [];

const field = (name: string, type: string, label: string, extra: object = {}) =>
  ({ name, type, label, ...extra }) as FieldDefinition;

/** The card's template: core blocks bound to the block's own data (its row). */
const TEMPLATE: CxdBlock[] = [
  {
    id: 'card-title',
    type: 'core/heading',
    v: 1,
    attrs: {
      level: 3,
      metadata: {
        bindings: { content: { source: 'cleitext/field', args: { key: 'row.field:title' } } },
      },
    },
    content: [{ text: 'No title' }],
  },
  { id: 'card-photo', type: 'cleitext/field', v: 1, attrs: { source: 'row.field:photo' } },
  {
    id: 'card-items',
    type: 'cleitext/field-rows',
    v: 1,
    attrs: { source: 'row.field:items' },
    children: [
      {
        id: 'card-item',
        type: 'core/paragraph',
        v: 1,
        attrs: {
          metadata: {
            bindings: { content: { source: 'cleitext/field', args: { key: 'row.field:label' } } },
          },
        },
      },
    ],
  },
  {
    id: 'card-raw',
    type: 'core/html',
    v: 1,
    attrs: { content: '<b>ok</b><script>bad()</script>' },
  },
];

interface CardAttrs {
  title?: string;
  photo?: string;
  items?: { label: string }[];
}

export default definePlugin({
  setup(ctx) {
    // A list of the plugin whose rows hold fields (plugin API 1.49).
    ctx.fields.registerType({
      type: 'c3-kit/rows',
      kind: 'list',
      rows: (f) => ({
        kind: 'fields',
        fields: ((f as CustomField).settings?.fields as FieldDefinition[] | undefined) ?? [],
      }),
    });
    ctx.fields.addGroup({
      id: 'c3-kit-sections',
      title: 'Sections',
      location: [[{ param: 'contentType', operator: '==', value: 'page' }]],
      fields: [
        field('sections', 'c3-kit/rows', 'Sections', {
          settings: {
            fields: [
              field('heading', 'text', 'Heading'),
              field('picture', 'media', 'Picture'),
              field('links', 'list', 'Links', { fields: [field('url', 'url', 'Address')] }),
            ],
          },
        }),
      ],
    });
    // The fields of the card block, from a group with a `block` rule.
    ctx.fields.addGroup({
      id: 'c3-kit-card',
      title: 'Card',
      location: [[{ param: 'block', operator: '==', value: 'c3-kit/card' }]],
      fields: [
        field('title', 'text', 'Title'),
        field('photo', 'media', 'Photo'),
        field('items', 'list', 'Items', { fields: [field('label', 'text', 'Label')] }),
      ],
    });
    // Kept for old content, left out of pickers.
    ctx.dynamic.registerSource({
      id: 'c3-kit:old',
      label: 'Old source',
      type: 'text',
      hidden: true,
      resolve: () => 'From the old source',
    });

    ctx.blocks.register(
      defineBlock<CardAttrs, string>({
        type: 'c3-kit/card',
        title: 'Card',
        schema: 'json',
        async load(attrs, context) {
          const { fields } = await ctx.fields.blockFields!(context.siteId, 'c3-kit/card');
          const media = attrs.photo ? await context.loadMedia!([attrs.photo]) : new Map();
          const photo = attrs.photo ? media.get(attrs.photo) : undefined;
          const row: FieldValues = {
            title: attrs.title ?? null,
            photo: photo ? { id: photo.id, url: photo.url, alt: photo.alt || 'Card photo' } : null,
            items: attrs.items ?? [],
          };
          return context.renderBlocks!(TEMPLATE, { row, fields });
        },
        render: ({ data }) => (
          <div className="c3-card" dangerouslySetInnerHTML={{ __html: data }} />
        ),
      }),
    );

    ctx.hooks.on('term.saved', ({ term, previous }) => {
      events.push({ action: 'term.saved', name: term.name, fields: term.fields, previous });
    });
    ctx.hooks.on('user.saved', ({ user, previous }) => {
      events.push({ action: 'user.saved', id: user.id, fields: user.fields, previous });
    });

    ctx.routes.api({
      method: 'GET',
      path: '/events',
      capability: 'edit_entries',
      handler: () => ({ body: events }),
    });
    ctx.routes.api({
      method: 'GET',
      path: '/block-fields',
      capability: 'edit_entries',
      async handler(request) {
        const found = await ctx.fields.blockFields!(request.siteId, request.query.name ?? '');
        return {
          body: { fields: found.fields.map((f) => f.name), groups: found.groups.map((g) => g.id) },
        };
      },
    });
    ctx.routes.api({
      method: 'GET',
      path: '/theme',
      capability: 'edit_entries',
      async handler(request) {
        const { siteId, query } = request;
        return {
          body: {
            active: await ctx.themes.active!(siteId),
            files: await ctx.themes.files!(siteId, query.dir ?? ''),
            file: query.file ? await ctx.themes.readFile!(siteId, query.file) : null,
          },
        };
      },
    });
    ctx.routes.api({
      method: 'GET',
      path: '/resolve',
      capability: 'edit_entries',
      async handler(request) {
        return {
          body: {
            value: await ctx.dynamic.resolve(request.siteId, request.query.id ?? '', {
              locale: 'en',
            }),
          },
        };
      },
    });
  },
});
