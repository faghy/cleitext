/* eslint-disable @typescript-eslint/no-explicit-any -- JSON answers of the REST API, read field by field. */
import { ADMIN_PATH, labelText } from '@cleitext/shared';
import type { CxdBlock, CxdDocument } from '@cleitext/blocks';
import { htmlToCxd } from '@cleitext/blocks/html';
import { BLOCK_GUIDE, CLEITEXT_GUIDE } from './guide.js';
import { ToolError } from './errors.js';
import { fetchPublicFile } from './fetch-public.js';
import { BLOCK_EDITOR, type SiteAi } from './site-ai.js';

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
  /** Editors, guide sections and tools of the site's plugins (plugin API 1.40). */
  ai: SiteAi;
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

/** The fields of an entry the tools change, besides its body and custom fields. */
function entryFields(args: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (typeof args.title === 'string') fields.title = args.title;
  if (typeof args.slug === 'string') fields.slug = args.slug;
  if (typeof args.excerpt === 'string') fields.excerpt = args.excerpt;
  if (typeof args.parent_id === 'string') fields.parentId = args.parent_id;
  if (typeof args.featured_media_id === 'string') fields.featuredMediaId = args.featured_media_id;
  return fields;
}

/** The editor of a document: `blocks` for the block editor (also without `editor`). */
export function editorOf(document: CxdDocument | undefined): string {
  return document?.editor?.id || BLOCK_EDITOR;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Custom fields to save: the current ones with the given groups or fields
 * changed (the REST API replaces them all). Groups are merged one level deep.
 */
function mergedFields(current: unknown, changes: unknown): Record<string, unknown> | undefined {
  if (changes === undefined) return undefined;
  if (!isRecord(changes)) throw new ToolError('"fields" is an object, e.g. {"seo": {…}}.');
  const merged: Record<string, unknown> = isRecord(current) ? { ...current } : {};
  for (const [key, value] of Object.entries(changes)) {
    merged[key] = isRecord(value) && isRecord(merged[key]) ? { ...merged[key], ...value } : value;
  }
  return merged;
}

/** Where a body goes: the entry's editor, with the page settings it keeps. */
interface Target {
  editor: string;
  /** `document.editor.data` to keep (page settings), when the editor stays the same. */
  data?: Record<string, unknown>;
  locale: string;
  type: string;
}

/** Blocks from `content` (block markup or HTML) or `blocks` (CXD); undefined without a body. */
function blocksFrom(args: Record<string, unknown>): CxdBlock[] | undefined {
  if (typeof args.content === 'string') return htmlToCxd(args.content).blocks;
  if (Array.isArray(args.blocks)) return args.blocks as CxdBlock[];
  return undefined;
}

/**
 * The document to save for a body sent by the assistant, in the target
 * editor: blocks stay blocks in the block editor, and are converted by the
 * plugin of another editor; `native` documents are checked by it. Never
 * saved in another editor than the target (an error explains instead).
 */
async function documentFor(
  ctx: ToolContext,
  args: Record<string, unknown>,
  target: Target,
): Promise<CxdDocument | undefined> {
  const given = ['content', 'blocks', 'native'].filter((key) => args[key] !== undefined);
  if (given.length > 1) throw new ToolError(`Send only one of ${given.join(', ')}.`);
  if (args.native !== undefined && !Array.isArray(args.native)) {
    throw new ToolError('"native" is an array: the top-level elements of the document.');
  }
  const blocks = blocksFrom(args);
  const native = args.native as CxdBlock[] | undefined;
  const meta: { data?: Record<string, unknown> } = target.data ? { data: target.data } : {};
  const context = { locale: target.locale, type: target.type };
  if (target.editor === BLOCK_EDITOR) {
    if (native) {
      throw new ToolError(
        'This entry uses the block editor: send "content" (block markup or HTML) or "blocks".',
      );
    }
    if (!blocks) return undefined;
    return {
      schema: 1,
      blocks,
      ...(meta.data !== undefined ? { editor: { id: BLOCK_EDITOR, ...meta } } : {}),
    };
  }
  let document: CxdDocument;
  if (native) {
    document = await ctx.ai.validate(
      target.editor,
      { schema: 1, blocks: native, editor: { id: target.editor, ...meta } },
      context,
    );
  } else if (blocks) {
    document = await ctx.ai.fromBlocks(target.editor, blocks, context);
  } else {
    return undefined;
  }
  // Page settings of the editor are kept unless the plugin set its own.
  return {
    ...document,
    editor: {
      ...meta,
      ...document.editor,
      id: target.editor,
    },
  };
}

/** Checks that an editor can be used for a content type on this site. */
async function assertEditor(ctx: ToolContext, editor: string, type: string, why = '') {
  const editors = await ctx.ai.editors(type);
  if (editors.some((e) => e.id === editor)) return;
  const known = editors.map((e) => `"${e.id}"`).join(', ');
  throw new ToolError(
    `The editor "${editor}"${why} is not available to assistants for "${type}" entries on this site. Available: ${known}.`,
  );
}

interface EntryView {
  id: string;
  type: string;
  locale: string;
  title: string;
  slug: string;
  status: string;
  publishedAt: string | null;
  parentId?: string | null;
  hasUnpublishedChanges?: boolean;
  revision?: {
    document?: CxdDocument;
    excerpt?: string | null;
    featuredMediaId?: string | null;
    fields?: Record<string, unknown>;
  };
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
    edit_url: `${ctx.origin}${ADMIN_PATH}/entries/${entry.id}`,
  };
}

const contentInput = {
  content: string(
    'The body as WordPress block markup (recommended for the block editor) or plain HTML; see get_block_guide. Replaces the whole body. On entries of another editor (e.g. Fresco) it is converted to that editor.',
  ),
  blocks: {
    type: 'array',
    description:
      'Alternatively, the body as Cleitext blocks (CXD), as get_entry returns them for the block editor. Converted like "content" on entries of another editor.',
    items: { type: 'object' },
  },
  native: {
    type: 'array',
    description:
      'Alternatively, for entries of another editor (e.g. Fresco): the body in that editor’s own format, as get_entry returns it in "native" and its guide describes (get_block_guide). Checked by the editor.',
    items: { type: 'object' },
  },
  fields: {
    type: 'object',
    description:
      'Custom fields by group, e.g. {"seo": {"title": "…", "description": "…"}}: the fields of each content type are listed by get_site. Only the given groups and fields change.',
  },
  excerpt: string('A short summary (search results, social cards).'),
  slug: string('The address, e.g. "about-us"; derived from the title when omitted.'),
  featured_media_id: string('Featured image: the id of a media item (upload_image).'),
  parent_id: string('Parent page id, for hierarchical pages.'),
};

/**
 * Saves the changes the assistant asked for on an entry, in its editor: the
 * body is converted or checked for it, page settings and custom fields not
 * named stay as they are.
 */
async function saveChanges(
  ctx: ToolContext,
  id: string,
  args: Record<string, unknown>,
  changes: Record<string, unknown>,
): Promise<EntryView> {
  const entry = await ok<EntryView>(ctx.api('GET', `/entries/${id}`));
  const current = entry.revision?.document;
  const from = editorOf(current);
  const editor = typeof args.editor === 'string' && args.editor ? args.editor : from;
  const target: Target = {
    editor,
    locale: entry.locale,
    type: entry.type,
    ...(editor === from && current?.editor?.data !== undefined
      ? { data: current.editor.data }
      : {}),
  };
  if (editor !== from) await assertEditor(ctx, editor, entry.type);
  let document = await documentFor(ctx, args, target);
  if (!document && editor !== from) {
    // A move to another editor without a new body: the body is converted.
    const blocks =
      from === BLOCK_EDITOR
        ? (current?.blocks ?? [])
        : await ctx.ai.toBlocks(from, current!, { locale: entry.locale, type: entry.type });
    document = await documentFor(ctx, { blocks }, target);
  }
  const fields = mergedFields(entry.revision?.fields, args.fields);
  const body = {
    ...changes,
    ...(document ? { document } : {}),
    ...(fields ? { fields } : {}),
  };
  if (Object.keys(body).length === 0) throw new ToolError('Nothing to change.');
  return ok<EntryView>(ctx.api('PATCH', `/entries/${id}`, body));
}

/** Custom fields of a content type, as `group.field (type) — label`, for get_site. */
function fieldList(type: Record<string, any>): string[] {
  const describe = (name: string, field: Record<string, any>) => {
    const extra = [field.type, field.maxLength ? `max ${field.maxLength}` : '']
      .filter(Boolean)
      .join(', ');
    const label = labelText(field.label ?? name, 'en');
    return `${name} (${extra})${label && label !== name ? ` — ${label}` : ''}`;
  };
  return [
    ...((type.fields ?? []) as Record<string, any>[]).map((f) => describe(f.name, f)),
    ...((type.fieldGroups ?? []) as Record<string, any>[]).flatMap((group) =>
      ((group.fields ?? []) as Record<string, any>[]).map((f) =>
        describe(`${group.id}.${f.name}`, f),
      ),
    ),
  ];
}

export const TOOLS: Tool[] = [
  {
    name: 'get_site',
    title: 'Site overview',
    description:
      'The site, its languages, content types (with the editor new entries use and their custom fields, e.g. SEO), the editors, theme and menus, and who you act as. Call it first.',
    scope: 'read',
    inputSchema: { type: 'object', properties: {} },
    async run(ctx) {
      const me = await ok<Record<string, any>>(ctx.api('GET', '/auth/me'));
      const types = await ok<Array<Record<string, any>>>(ctx.api('GET', '/content-types'));
      const languages = await ctx.api('GET', '/ext/multilingual/languages');
      const theme = await ctx.api('GET', '/themes/current');
      const menus = await ctx.api('GET', '/menus');
      const editors = await ctx.ai.editors();
      const contentTypes = [];
      for (const t of types) {
        contentTypes.push({
          slug: t.slug,
          name: labelText(t.name, me.site?.defaultLocale ?? 'en'),
          hierarchical: t.hierarchical || undefined,
          supports: t.supports,
          editor: await ctx.ai.defaultEditor(t.slug),
          fields: fieldList(t),
        });
      }
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
        content_types: contentTypes,
        editors: editors.map((e) => ({
          id: e.id,
          title: e.title,
          ...(e.plugin ? { plugin: e.plugin } : {}),
          ...(e.types ? { types: e.types } : {}),
          send:
            e.id === BLOCK_EDITOR
              ? 'content or blocks'
              : [
                  e.convertsBlocks ? 'content or blocks (converted)' : '',
                  e.acceptsNative ? 'native' : '',
                ]
                  .filter(Boolean)
                  .join(', ') || 'nothing (not writable by assistants)',
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
      'The guide to writing for this site: Cleitext’s rules, how to write with the editor (the block editor or another, e.g. Fresco), what plugins add, the theme’s sections and classes, and the site’s patterns (ready-made sections). Read it before creating content, for the editor of the entry.',
    scope: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        editor: string(
          'The editor to write with, e.g. "blocks" or "fresco" (get_site: editors); by default the one new entries of `type` use.',
        ),
        type: string('The content type to write, e.g. "page" (default) or "article".'),
      },
    },
    async run(ctx, args) {
      const type = typeof args.type === 'string' ? args.type : 'page';
      const editor =
        typeof args.editor === 'string' && args.editor
          ? args.editor
          : await ctx.ai.defaultEditor(type);
      const editors = await ctx.ai.editors();
      const info = editors.find((e) => e.id === editor);
      if (!info) {
        throw new ToolError(
          `No editor "${editor}" for assistants on this site. Available: ${editors.map((e) => `"${e.id}"`).join(', ')}.`,
        );
      }
      const me = await ok<Record<string, any>>(ctx.api('GET', '/auth/me'));
      const blocks = await ctx.api('GET', '/blocks');
      const guide = await ctx.api('GET', '/themes/active/guide');
      const patterns = await ctx.api('GET', '/patterns');
      const parts = [CLEITEXT_GUIDE];

      if (editor === BLOCK_EDITOR) {
        parts.push(BLOCK_GUIDE);
      } else {
        const own = await ctx.ai.guide(editor, { locale: me.site?.defaultLocale ?? 'en', type });
        parts.push(
          `# Writing with ${info.title} (editor "${editor}")\n\n` +
            `Entries made with ${info.title} keep \`editor: "${editor}"\`: the tools keep it, and people go on editing them in ${info.title}.\n` +
            (info.acceptsNative
              ? `Send the body in its own format with \`native\` (what get_entry returns in \`native\`).\n`
              : '') +
            (info.convertsBlocks
              ? `\`content\` (block markup or HTML) and \`blocks\` are accepted too and converted to ${info.title}; call get_block_guide with editor "blocks" for their format.\n`
              : '') +
            `\n${own ?? ''}`,
        );
      }
      const others = editors.filter((e) => e.id !== editor);
      if (others.length > 0) {
        parts.push(
          `## Other editors of the site\n\n${others
            .map((e) => `- ${e.title} ("${e.id}")`)
            .join(
              '\n',
            )}\n\nRead their guide with get_block_guide and \`editor\` before changing their entries.`,
        );
      }
      if (blocks.status === 200 && (blocks.data as unknown[]).length > 0) {
        const own = (blocks.data as Array<Record<string, any>>).filter(
          (b) => editor === BLOCK_EDITOR || b.plugin !== info.plugin,
        );
        if (own.length > 0) {
          parts.push(
            '## Blocks of plugins\n\n' +
              own
                .map(
                  (b) =>
                    `- ${b.type} (${b.plugin}): ${b.title}${b.description ? ` — ${b.description}` : ''}`,
                )
                .join('\n'),
          );
        }
      }
      for (const section of await ctx.ai.sections()) {
        parts.push(`## ${section.title} (plugin ${section.plugin})\n\n${section.markdown}`);
      }
      const theme = guide.data as { name?: string; guide?: string } | undefined;
      if (guide.status === 200 && theme?.guide)
        parts.push(`## The theme: ${theme.name}\n\n${theme.guide}`);
      if (patterns.status === 200 && (patterns.data as unknown[]).length > 0) {
        parts.push(
          '## Patterns of the site\n\nReady-made sections, in blocks: read one with get_pattern and reuse it' +
            (editor === BLOCK_EDITOR
              ? ''
              : ` (send it as \`blocks\`: it is converted to ${info.title})`) +
            '.\n\n' +
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
    description:
      'One entry (the current revision), to read or to change: its editor, its body (`blocks` for the block editor; `native` in the format of another editor such as Fresco), excerpt, featured image and custom fields.',
    scope: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        id: string('The entry id.'),
        as_blocks: {
          type: 'boolean',
          description:
            'For entries of another editor: the body converted to blocks, to read it (layout and styles are left out). Change such entries with `native` instead.',
        },
      },
      required: ['id'],
    },
    async run(ctx, args) {
      const entry = await ok<EntryView>(
        ctx.api('GET', `/entries/${encodeURIComponent(String(args.id))}`),
      );
      const document = entry.revision?.document;
      const editor = editorOf(document);
      const body: Record<string, unknown> = {};
      if (editor === BLOCK_EDITOR) {
        body.blocks = document?.blocks ?? [];
      } else if (args.as_blocks === true) {
        body.blocks = await ctx.ai.toBlocks(editor, document!, {
          locale: entry.locale,
          type: entry.type,
        });
        body.note = `Converted from ${editor} to read it: to change the page, send "native" (or "content"/"blocks", which replace the layout).`;
      } else {
        body.native = document?.blocks ?? [];
        if (document?.editor?.data !== undefined) body.editor_settings = document.editor.data;
      }
      return {
        ...entrySummary(ctx, entry),
        editor,
        excerpt: entry.revision?.excerpt ?? null,
        featured_media_id: entry.revision?.featuredMediaId ?? null,
        parent_id: entry.parentId ?? null,
        fields: entry.revision?.fields ?? {},
        has_unpublished_changes: entry.hasUnpublishedChanges ?? false,
        ...body,
      };
    },
  },
  {
    name: 'create_entry',
    title: 'Create a page or post',
    description:
      'Creates a page, post or other entry as a DRAFT (never published by this tool), in the editor new entries of its type use (or `editor`). With translation_of, creates the translation of an existing entry in another language. Returns the links to edit and preview it.',
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
          'Id of the entry this one translates (needs the Multilingual plugin). The translation keeps the editor of the original.',
        ),
        editor: string(
          'The editor of the entry: "blocks" or another from get_site (editors). Default: the one new entries of this type use (get_site: content_types.editor).',
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
        // The copy keeps the original's editor; the body follows it.
        await saveChanges(ctx, id, args, fields);
      } else {
        const type = typeof args.type === 'string' ? args.type : 'page';
        const me = await ok<Record<string, any>>(ctx.api('GET', '/auth/me'));
        const locale = typeof args.locale === 'string' ? args.locale : me.site?.defaultLocale;
        const chosen = typeof args.editor === 'string' && args.editor;
        const editor = chosen || (await ctx.ai.defaultEditor(type));
        await assertEditor(
          ctx,
          editor,
          type,
          chosen ? '' : ' (the default editor of this type, Settings → Writing)',
        );
        const document =
          (await documentFor(ctx, args, { editor, locale, type })) ??
          // Without a body the entry still opens in its editor.
          (editor === BLOCK_EDITOR ? undefined : { schema: 1, blocks: [], editor: { id: editor } });
        const custom = mergedFields({}, args.fields);
        const created = await ok<EntryView>(
          ctx.api('POST', '/entries', {
            type,
            ...(typeof args.locale === 'string' ? { locale: args.locale } : {}),
            ...fields,
            ...(document ? { document } : {}),
            ...(custom ? { fields: custom } : {}),
          }),
        );
        id = created.id;
      }
      const entry = await ok<EntryView>(ctx.api('GET', `/entries/${id}`));
      const preview_url = await previewUrl(ctx, id);
      return {
        ...entrySummary(ctx, entry),
        editor: editorOf(entry.revision?.document),
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
      'Changes the title, address, excerpt, featured image, custom fields or body of an entry. The entry keeps its editor (e.g. Fresco) unless `editor` is given. The body is replaced as a whole: read it first with get_entry to keep what should stay. On a published entry the change is saved as a new revision.',
    scope: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        id: string('The entry id.'),
        title: string('The new title.'),
        editor: string(
          'Move the entry to another editor ("blocks" or one from get_site): its body is converted when no new body is given. Omit it to keep the current editor.',
        ),
        ...contentInput,
      },
      required: ['id'],
    },
    async run(ctx, args) {
      const id = encodeURIComponent(String(args.id));
      const entry = await saveChanges(ctx, id, args, entryFields(args));
      const preview_url = await previewUrl(ctx, id);
      return {
        ...entrySummary(ctx, entry),
        editor: editorOf(entry.revision?.document),
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
  {
    name: 'list_comments',
    title: 'List comments',
    description:
      'Comments of the site, newest first: those waiting for approval (status "pending"), approved ones, spam or trash. Needs the right to moderate comments.',
    scope: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        status: string('pending, approved, spam or trash; all but trash when omitted.'),
        search: string('Words to look for in the text, the name or the email.'),
        page: { type: 'integer', minimum: 1, default: 1 },
      },
    },
    async run(ctx, args) {
      const query = new URLSearchParams({ page: String(args.page ?? 1) });
      if (args.status) query.set('status', String(args.status));
      if (args.search) query.set('search', String(args.search));
      const list = await ok<Record<string, any>>(ctx.api('GET', `/comments?${query}`));
      return {
        counts: list.counts,
        total: list.total,
        comments: (list.items as Record<string, any>[]).map((c) => ({
          id: c.id,
          entry_id: c.entryId,
          entry_title: c.entryTitle,
          parent_id: c.parentId,
          status: c.status,
          author: c.authorName,
          email: c.authorEmail,
          website: c.authorUrl,
          content: c.content,
          created_at: c.createdAt,
        })),
      };
    },
  },
  {
    name: 'moderate_comments',
    title: 'Moderate comments',
    description:
      'Approves comments (they appear on the site), holds them back, marks them as spam or moves them to the trash.',
    scope: 'publish',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'Comment ids.' },
        status: string('approved, pending, spam or trash.', {
          enum: ['approved', 'pending', 'spam', 'trash'],
        }),
      },
      required: ['ids', 'status'],
    },
    async run(ctx, args) {
      return ok(ctx.api('POST', '/comments/status', { ids: args.ids, status: args.status }));
    },
  },
  {
    name: 'reply_to_comment',
    title: 'Reply to a comment',
    description:
      'Publishes a reply from the connected user under a comment; a comment waiting for approval is approved too.',
    scope: 'publish',
    inputSchema: {
      type: 'object',
      properties: {
        id: string('The comment answered.'),
        content: string('The reply, as plain text (paragraphs separated by blank lines).'),
      },
      required: ['id', 'content'],
    },
    async run(ctx, args) {
      const reply = await ok<Record<string, any>>(
        ctx.api('POST', `/comments/${encodeURIComponent(String(args.id))}/reply`, {
          content: args.content,
        }),
      );
      return { id: reply.id, status: 'approved' };
    },
  },
];

/** An absolute preview link: the assistant shows it to the user outside the site. */
async function previewUrl(ctx: ToolContext, id: string): Promise<string | null> {
  const preview = await ctx.api('POST', `/entries/${id}/preview`, {});
  if (preview.status !== 200) return null;
  return new URL((preview.data as { url: string }).url, ctx.origin).toString();
}

/** What the connection's scopes allow (read ⊂ write; publish needs its own scope). */
export function allowed(tool: Pick<Tool, 'scope'>, scopes: string[]): boolean {
  if (tool.scope === 'read') return scopes.includes('read') || scopes.includes('write');
  return scopes.includes(tool.scope);
}

/** The core's tools and those of the site's active plugins (plugin API 1.40). */
export async function siteTools(ctx: ToolContext): Promise<Tool[]> {
  const extra = (await ctx.ai.tools()).filter((t) => !TOOLS.some((core) => core.name === t.name));
  return [
    ...TOOLS,
    ...extra.map((t): Tool => ({
      name: t.name,
      title: t.title,
      description: t.description,
      scope: t.scope,
      inputSchema: t.inputSchema,
      run: (_ctx, args) => t.run(args),
    })),
  ];
}

export function toolList(scopes: string[], tools: Tool[] = TOOLS) {
  return tools
    .filter((t) => allowed(t, scopes))
    .map((t) => ({
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
export const ASSISTANT_INSTRUCTIONS = `You are connected to a Cleitext site, a CMS like WordPress.
Start with get_site, then read get_block_guide before writing: it has Cleitext's rules, the guide
of the editor the entry uses (the block editor, or another such as the Fresco page builder),
the theme's sections and classes and the site's patterns. Every entry keeps its editor: write in
that editor's format, never turn a page into one big HTML block, and keep it editable by people
who do not write code. Everything you create is a draft: share the preview link, and publish only
when the user asks. Write in the language of each entry; fill in the excerpt, the featured image
and the SEO fields when the site has them.`;

/** Runs a tool for the assistant; problems come back as text it can act on. */
export async function callTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
  onFailure?: (error: unknown) => void,
): Promise<{ text: string; isError: boolean }> {
  let tool = TOOLS.find((t) => t.name === name);
  try {
    tool ??= (await siteTools(ctx)).find((t) => t.name === name);
  } catch (error) {
    onFailure?.(error);
  }
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
