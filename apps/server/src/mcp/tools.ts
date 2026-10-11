/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers of the REST API, read field by field. */
import type { CxdBlock } from '@cleitext/blocks';
import { htmlToCxd } from '../transfer/html-to-cxd.js';
import { BLOCK_GUIDE } from './guide.js';
import { ToolError } from './errors.js';
import { fetchPublicFile } from './fetch-public.js';

export { ToolError };

/**
 * The tools an AI assistant gets through MCP (RF-AI-01). Each one is a thin
 * layer over the REST API, called with the assistant's own token: roles,
 * validation of blocks, revisions and the activity log work as in the admin.
 */

export interface ApiResult {
  status: number;
  data: unknown;
}

export interface ToolContext {
  /** The REST API of this site, as the connected user. */
  api(method: string, path: string, body?: unknown): Promise<ApiResult>;
  /** Uploads a file to the media library, as the connected user. */
  upload(filename: string, data: Buffer): Promise<ApiResult>;
  /** https://<site host> */
  origin: string;
  scopes: string[];
}

type Scope = 'read' | 'write' | 'publish';

interface Tool {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  inputSchema: Record<string, unknown>;
  run(ctx: ToolContext, args: Record<string, unknown>): Promise<unknown>;
}

const string = (description: string, extra: Record<string, unknown> = {}) => ({
  type: 'string',
  description,
  ...extra,
});

/** The REST answer, or a ToolError with the problem's details for the assistant. */
async function ok<T>(result: Promise<ApiResult>): Promise<T> {
  const { status, data } = await result;
  if (status >= 200 && status < 300) return data as T;
  const problem = (data ?? {}) as { title?: string; detail?: string; errors?: unknown };
  const details = problem.errors ? ` ${JSON.stringify(problem.errors).slice(0, 2000)}` : '';
  throw new ToolError(`${problem.detail ?? problem.title ?? `HTTP ${status}`}${details}`);
}

/** Block markup or HTML → document; or blocks given as CXD. */
function documentFrom(
  args: Record<string, unknown>,
): { schema: number; blocks: CxdBlock[] } | undefined {
  if (typeof args.content === 'string') return htmlToCxd(args.content);
  if (Array.isArray(args.blocks)) return { schema: 1, blocks: args.blocks as CxdBlock[] };
  return undefined;
}

function entryFields(args: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (typeof args.title === 'string') fields.title = args.title;
  if (typeof args.slug === 'string') fields.slug = args.slug;
  if (typeof args.excerpt === 'string') fields.excerpt = args.excerpt;
  if (typeof args.parent_id === 'string') fields.parentId = args.parent_id;
  if (typeof args.featured_media_id === 'string') fields.featuredMediaId = args.featured_media_id;
  const document = documentFrom(args);
  if (document) fields.document = document;
  return fields;
}

interface EntryView {
  id: string;
  type: string;
  locale: string;
  title: string;
  slug: string;
  status: string;
  publishedAt: string | null;
  hasUnpublishedChanges?: boolean;
  revision?: { document?: { blocks: CxdBlock[] }; excerpt?: string | null };
}

function entrySummary(ctx: ToolContext, entry: EntryView) {
  return {
    id: entry.id,
    type: entry.type,
    locale: entry.locale,
    title: entry.title,
    slug: entry.slug,
    status: entry.status,
    published_at: entry.publishedAt,
    edit_url: `${ctx.origin}/admin/entries/${entry.id}`,
  };
}

const contentInput = {
  content: string(
    'The body as WordPress block markup (recommended) or plain HTML; see get_block_guide. Replaces the whole body.',
  ),
  blocks: {
    type: 'array',
    description: 'Alternatively, the body as Cleitext blocks (CXD), as returned by get_entry.',
    items: { type: 'object' },
  },
  excerpt: string('A short summary (search results, social cards).'),
  slug: string('The address, e.g. "about-us"; derived from the title when omitted.'),
  featured_media_id: string('Featured image: the id of a media item (upload_image).'),
  parent_id: string('Parent page id, for hierarchical pages.'),
};

export const TOOLS: Tool[] = [
  {
    name: 'get_site',
    title: 'Site overview',
    description:
      'The site, its languages, content types, theme and menus, and who you act as. Call it first.',
    scope: 'read',
    inputSchema: { type: 'object', properties: {} },
    async run(ctx) {
      const me = await ok<Record<string, any>>(ctx.api('GET', '/auth/me'));
      const types = await ok<Array<Record<string, any>>>(ctx.api('GET', '/content-types'));
      const languages = await ctx.api('GET', '/ext/multilingual/languages');
      const theme = await ctx.api('GET', '/themes/current');
      const menus = await ctx.api('GET', '/menus');
      return {
        site: { name: me.site?.name, url: ctx.origin, default_language: me.site?.defaultLocale },
        you: {
          name: me.user?.displayName,
          role: me.role?.name ?? (me.user?.isSuperAdmin ? 'Super admin' : null),
          can: (me.capabilities as string[] | undefined)?.filter((c) =>
            ['edit_entries', 'publish_entries', 'upload_media', 'manage_menus'].includes(c),
          ),
          token_scopes: ctx.scopes,
        },
        languages:
          languages.status === 200
            ? (languages.data as Array<Record<string, any>>).map((l) => ({
                code: l.code,
                name: l.name,
                default: l.isDefault,
                prefix: l.prefix || '/',
              }))
            : [{ code: me.site?.defaultLocale, default: true }],
        content_types: types.map((t) => ({
          slug: t.slug,
          name: t.name,
          hierarchical: t.hierarchical ?? undefined,
        })),
        theme: theme.status === 200 ? theme.data : null,
        menus:
          menus.status === 200
            ? (menus.data as Array<Record<string, any>>).map((m) => ({
                id: m.id,
                name: m.name,
                locale: m.locale,
                location: m.location,
              }))
            : [],
      };
    },
  },
  {
    name: 'get_block_guide',
    title: 'How to write content',
    description:
      'How to write pages and posts for this site: the block format, the core blocks, the blocks of plugins, the theme’s sections and classes, and the site’s patterns (ready-made sections). Read it before creating content.',
    scope: 'read',
    inputSchema: { type: 'object', properties: {} },
    async run(ctx) {
      const blocks = await ctx.api('GET', '/blocks');
      const guide = await ctx.api('GET', '/themes/active/guide');
      const patterns = await ctx.api('GET', '/patterns');
      const parts = [BLOCK_GUIDE];
      if (blocks.status === 200 && (blocks.data as unknown[]).length > 0) {
        parts.push(
          '## Blocks of plugins\n\n' +
            (blocks.data as Array<Record<string, any>>)
              .map(
                (b) =>
                  `- ${b.type} (${b.plugin}): ${b.title}${b.description ? ` — ${b.description}` : ''}`,
              )
              .join('\n'),
        );
      }
      const theme = guide.data as { name?: string; guide?: string } | undefined;
      if (guide.status === 200 && theme?.guide)
        parts.push(`## The theme: ${theme.name}\n\n${theme.guide}`);
      if (patterns.status === 200 && (patterns.data as unknown[]).length > 0) {
        parts.push(
          '## Patterns of the site\n\nReady-made sections: read one with get_pattern and reuse its blocks.\n\n' +
            (patterns.data as Array<Record<string, any>>)
              .map((p) => `- ${p.title} (id ${p.id})`)
              .join('\n'),
        );
      }
      return parts.join('\n\n');
    },
  },
  {
    name: 'get_pattern',
    title: 'Read a pattern',
    description: 'The blocks of one of the site’s patterns, to reuse in a page.',
    scope: 'read',
    inputSchema: {
      type: 'object',
      properties: { id: string('The pattern id (from get_block_guide).') },
      required: ['id'],
    },
    async run(ctx, args) {
      const list = await ok<Array<Record<string, any>>>(ctx.api('GET', '/patterns'));
      const pattern = list.find((p) => p.id === args.id);
      if (!pattern) throw new ToolError('No pattern with this id.');
      return { id: pattern.id, title: pattern.title, blocks: pattern.document?.blocks ?? [] };
    },
  },
  {
    name: 'list_entries',
    title: 'List pages or posts',
    description:
      'Pages, posts or other entries, newest first; filter by type, language, status or words.',
    scope: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        type: string('Content type: "page", "article" (posts) or another from get_site.', {
          default: 'page',
        }),
        locale: string('Language code, e.g. "en".'),
        status: string('draft, published, scheduled, pending, private or trash.'),
        search: string('Words to look for.'),
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    },
    async run(ctx, args) {
      const query = new URLSearchParams({
        type: String(args.type ?? 'page'),
        limit: String(args.limit ?? 20),
      });
      if (args.locale) query.set('locale', String(args.locale));
      if (args.status) query.set('status', String(args.status));
      if (args.search) query.set('q', String(args.search));
      const list = await ok<{ items: EntryView[] }>(ctx.api('GET', `/entries?${query}`));
      return list.items.map((e) => entrySummary(ctx, e));
    },
  },
  {
    name: 'get_entry',
    title: 'Read a page or post',
    description: 'One entry with its blocks (the current revision), to read or to change.',
    scope: 'read',
    inputSchema: { type: 'object', properties: { id: string('The entry id.') }, required: ['id'] },
    async run(ctx, args) {
      const entry = await ok<EntryView>(
        ctx.api('GET', `/entries/${encodeURIComponent(String(args.id))}`),
      );
      return {
        ...entrySummary(ctx, entry),
        excerpt: entry.revision?.excerpt ?? null,
        has_unpublished_changes: entry.hasUnpublishedChanges ?? false,
        blocks: entry.revision?.document?.blocks ?? [],
      };
    },
  },
  {
    name: 'create_entry',
    title: 'Create a page or post',
    description:
      'Creates a page, post or other entry as a DRAFT (never published by this tool). With translation_of, creates the translation of an existing entry in another language. Returns the links to edit and preview it.',
    scope: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        type: string('Content type: "page", "article" (posts) or another from get_site.', {
          default: 'page',
        }),
        title: string('The title.'),
        locale: string('Language code; the default language when omitted.'),
        translation_of: string(
          'Id of the entry this one translates (needs the Multilingual plugin).',
        ),
        ...contentInput,
      },
      required: ['title'],
    },
    async run(ctx, args) {
      const fields = entryFields(args);
      let id: string;
      if (typeof args.translation_of === 'string') {
        if (typeof args.locale !== 'string')
          throw new ToolError('Give the locale of the translation.');
        const created = await ok<{ id: string }>(
          ctx.api(
            'POST',
            `/ext/multilingual/translations/entry/${encodeURIComponent(args.translation_of)}`,
            {
              locale: args.locale,
            },
          ),
        );
        id = created.id;
        await ok(ctx.api('PATCH', `/entries/${id}`, fields));
      } else {
        const created = await ok<EntryView>(
          ctx.api('POST', '/entries', {
            type: typeof args.type === 'string' ? args.type : 'page',
            ...(typeof args.locale === 'string' ? { locale: args.locale } : {}),
            ...fields,
          }),
        );
        id = created.id;
      }
      const entry = await ok<EntryView>(ctx.api('GET', `/entries/${id}`));
      const preview_url = await previewUrl(ctx, id);
      return {
        ...entrySummary(ctx, entry),
        blocks_count: entry.revision?.document?.blocks.length ?? 0,
        preview_url,
        next: 'Show the preview to the user; publish only when they ask (publish_entry).',
      };
    },
  },
  {
    name: 'update_entry',
    title: 'Change a page or post',
    description:
      'Changes the title, address, excerpt, featured image or body of an entry. The body is replaced as a whole: read it first with get_entry to keep what should stay. On a published entry the change is saved as a new revision.',
    scope: 'write',
    inputSchema: {
      type: 'object',
      properties: { id: string('The entry id.'), title: string('The new title.'), ...contentInput },
      required: ['id'],
    },
    async run(ctx, args) {
      const id = encodeURIComponent(String(args.id));
      const fields = entryFields(args);
      if (Object.keys(fields).length === 0) throw new ToolError('Nothing to change.');
      const entry = await ok<EntryView>(ctx.api('PATCH', `/entries/${id}`, fields));
      const preview_url = await previewUrl(ctx, id);
      return {
        ...entrySummary(ctx, entry),
        preview_url,
      };
    },
  },
  {
    name: 'get_preview_link',
    title: 'Preview link',
    description: 'A temporary link that shows the entry as visitors will see it, drafts included.',
    scope: 'write',
    inputSchema: { type: 'object', properties: { id: string('The entry id.') }, required: ['id'] },
    async run(ctx, args) {
      const url = await previewUrl(ctx, encodeURIComponent(String(args.id)));
      if (!url) throw new ToolError('No preview for this entry: check the id.');
      return { url };
    },
  },
  {
    name: 'publish_entry',
    title: 'Publish',
    description:
      'Publishes an entry on the site. Only when the user explicitly asked to publish it; needs the "publish" permission of the connection.',
    scope: 'publish',
    inputSchema: { type: 'object', properties: { id: string('The entry id.') }, required: ['id'] },
    async run(ctx, args) {
      const entry = await ok<EntryView>(
        ctx.api('POST', `/entries/${encodeURIComponent(String(args.id))}/publish`, {
          visibility: 'public',
        }),
      );
      return entrySummary(ctx, entry);
    },
  },
  {
    name: 'upload_image',
    title: 'Upload an image',
    description:
      'Adds an image to the media library from a public https address (JPEG, PNG, WebP, GIF, AVIF), with its alternative text. Use the returned id and url in core/image blocks or as featured image.',
    scope: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        url: string('Public https address of the image.'),
        alt: string('Alternative text: what the image shows, for people who cannot see it.'),
        locale: string('Language of the alternative text; the default language when omitted.'),
      },
      required: ['url', 'alt'],
    },
    async run(ctx, args) {
      const file = await fetchPublicFile(String(args.url));
      const media = await ok<{ id: string; url: string; locale?: string }>(
        ctx.upload(file.filename, file.data),
      );
      if (typeof args.alt === 'string' && args.alt.trim()) {
        const me = await ok<Record<string, any>>(ctx.api('GET', '/auth/me'));
        const locale =
          typeof args.locale === 'string' ? args.locale : (me.site?.defaultLocale ?? 'en');
        await ok(ctx.api('PATCH', `/media/${media.id}`, { alt: { [locale]: args.alt.trim() } }));
      }
      return { id: media.id, url: media.url };
    },
  },
  {
    name: 'list_media',
    title: 'Find images',
    description: 'Images and files of the media library, searched by name or alternative text.',
    scope: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        search: string('Words to look for.'),
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    },
    async run(ctx, args) {
      const query = new URLSearchParams({ limit: String(args.limit ?? 20) });
      if (args.search) query.set('q', String(args.search));
      const list = await ok<{ items: Array<Record<string, any>> }>(
        ctx.api('GET', `/media?${query}`),
      );
      return list.items.map((m) => ({
        id: m.id,
        url: m.url,
        filename: m.filename,
        alt: m.alt,
        mime: m.mimeType,
      }));
    },
  },
  {
    name: 'set_menu',
    title: 'Set a menu',
    description:
      'Replaces the items of the menu shown at a theme location (e.g. "primary") in a language; creates the menu if needed. Items link to entries or addresses and can have children.',
    scope: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        location: string('Theme location, from get_site (theme.menuLocations).', {
          default: 'primary',
        }),
        locale: string('Language of the menu; the default language when omitted.'),
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entry_id: string('Link to this entry.'),
              url: string('Or link to this address.'),
              label: string('Text of the item (the entry title when omitted).'),
              children: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
      required: ['items'],
    },
    async run(ctx, args) {
      const location = typeof args.location === 'string' ? args.location : 'primary';
      const me = await ok<Record<string, any>>(ctx.api('GET', '/auth/me'));
      const locale = typeof args.locale === 'string' ? args.locale : me.site?.defaultLocale;
      const menus = await ok<Array<Record<string, any>>>(ctx.api('GET', '/menus'));
      let menu = menus.find((m) => m.location === location && (!m.locale || m.locale === locale));
      if (!menu) {
        menu = await ok<Record<string, any>>(
          ctx.api('POST', '/menus', { name: `${location} (${locale})`, locale, location }),
        );
      }
      const convert = (items: unknown): unknown[] =>
        (Array.isArray(items) ? items : []).map((raw) => {
          const item = raw as Record<string, unknown>;
          return {
            kind: item.entry_id ? 'entry' : 'url',
            ...(item.entry_id ? { entryId: item.entry_id } : { url: item.url }),
            label: typeof item.label === 'string' ? item.label : null,
            children: convert(item.children),
          };
        });
      await ok(ctx.api('PUT', `/menus/${menu.id}/items`, { items: convert(args.items) }));
      return { menu_id: menu.id, location, locale };
    },
  },
];

/** What the connection's scopes allow (read ⊂ write; publish needs its own scope). */
/** An absolute preview link: the assistant shows it to the user outside the site. */
async function previewUrl(ctx: ToolContext, id: string): Promise<string | null> {
  const preview = await ctx.api('POST', `/entries/${id}/preview`, {});
  if (preview.status !== 200) return null;
  return new URL((preview.data as { url: string }).url, ctx.origin).toString();
}

export function allowed(tool: Tool, scopes: string[]): boolean {
  if (tool.scope === 'read') return scopes.includes('read') || scopes.includes('write');
  return scopes.includes(tool.scope);
}

export function toolList(scopes: string[]) {
  return TOOLS.filter((t) => allowed(t, scopes)).map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: {
      title: t.title,
      readOnlyHint: t.scope === 'read',
      destructiveHint: false,
      idempotentHint: t.scope === 'read',
      openWorldHint: t.name === 'upload_image',
    },
  }));
}

/** How an assistant should work on the site, sent when it connects. */
export const ASSISTANT_INSTRUCTIONS = `You are connected to a Cleitext site, a CMS with a block editor like WordPress.
Start with get_site, then read get_block_guide before writing: pages and posts are made of
blocks, and the theme has its own sections and patterns. Everything you create is a draft:
share the preview link, and publish only when the user asks. People edit your work in the
block editor afterwards, so keep it made of blocks, in the language of each entry.`;

/** Runs a tool for the assistant; problems come back as text it can act on. */
export async function callTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
  onFailure?: (error: unknown) => void,
): Promise<{ text: string; isError: boolean }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { text: `Unknown tool: ${name}`, isError: true };
  if (!allowed(tool, ctx.scopes)) {
    return {
      text: `This connection may not use ${name}: it needs the "${tool.scope}" permission.`,
      isError: true,
    };
  }
  try {
    const data = await tool.run(ctx, args);
    return {
      text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      isError: false,
    };
  } catch (error) {
    if (error instanceof ToolError) return { text: error.message, isError: true };
    onFailure?.(error);
    return { text: 'The tool failed on the server. Try again later.', isError: true };
  }
}
