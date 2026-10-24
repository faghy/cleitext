import {
  defineBlock,
  definePlugin,
  type BlockLoadContext,
  type PluginContext,
  type RouteRequest,
} from '@cleitext/plugin-sdk';
import { randomBytes } from 'node:crypto';
import { allLayers, cleanTitle, LIMITS, mediaIdsOf, normalizeSlider } from './model/normalize';
import { expandPosts, fillTemplate, type PostItem } from './model/posts';
import { templateSlider, quickSlider, TEMPLATES, type QuickSlide } from './model/templates';
import type { Link, SliderData, SliderRecord } from './model/types';
import { installServerApi, sliderLimit, type DioramaServerApi } from './pro';
import { BASE_CSS } from './render/base-css';
import {
  mergeDecorators,
  SliderView,
  type RenderDecorator,
  type RenderInput,
  type RenderMedia,
} from './render/render';
import { databaseStore, UUID, summaryOf, type Store } from './store';
import {
  BLOCK_TYPE,
  blockFromShortcode,
  exportSliders,
  importedSliders,
  replaceShortcodes,
} from './transfer';

/**
 * Diorama (official plugin, shipped on its own): sliders and hero sections.
 * Sliders live in the plugin's table, one JSON document each; the
 * `diorama/slider` block shows one on a page (the block editor, Fresco,
 * themes' block areas), and so does the `[diorama id="…"]` shortcode. The
 * free plugin keeps one slider per site; Diorama Pro lifts the limit
 * through the server API in `pro.ts`.
 */

const CAPABILITY = 'manage_diorama';
const CACHE_TAG = 'diorama';

interface BlockAttrs {
  /** The slider's id (or alias). */
  slider?: string;
  /** Its alias, used when the id is not found (e.g. after an import into another site). */
  alias?: string;
}

interface BlockData {
  record: SliderRecord | null;
  slider: SliderData | null;
  media: [string, RenderMedia][];
  links: Record<string, string>;
}

const body = (request: RouteRequest) =>
  (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;

/** The scope of a slider's CSS: a short form of its id. */
export const keyOf = (id: string) => id.replace(/-/g, '').slice(0, 10);

const LIMIT_TEXT = {
  en: 'The free version of Diorama keeps one slider per site, with as many slides as you like. Diorama Pro gives you as many sliders as you need.',
  it: 'La versione gratuita di Diorama tiene uno slider per sito, con tutte le slide che vuoi. Diorama Pro ti dà tutti gli slider che ti servono.',
};

const AI_GUIDE = `Sliders are made in the admin with **Diorama** (Diorama → the slider editor): never imitate one with images and columns. Show a slider with the **diorama/slider** block: \`{ "type": "diorama/slider", "attrs": { "slider": "<slider id>", "alias": "<alias>" } }\`. The ids and aliases of the site's sliders are listed by \`GET /api/v1/ext/diorama/options\`. A WordPress-style shortcode \`[diorama alias="home"]\` alone in a paragraph also works.`;

function pageLinks(slider: SliderData): string[] {
  const ids = new Set<string>();
  const add = (link: Link) => {
    if (link.kind === 'page' && link.entryId) ids.add(link.entryId);
  };
  for (const slide of slider.slides) {
    add(slide.link);
    for (const layer of allLayers(slide.layers)) add(layer.content.link);
  }
  return [...ids].slice(0, 30);
}

/** The latest posts, as the template slide fills them in. */
async function latestPosts(slider: SliderData, context: BlockLoadContext): Promise<PostItem[]> {
  if (slider.source.kind !== 'posts') return [];
  const { entries } = await context.query({
    type: 'article',
    limit: slider.source.count,
    ...(slider.source.category
      ? { terms: { taxonomy: 'category', slugs: [slider.source.category] } }
      : {}),
  });
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    url: entry.url,
    excerpt: entry.excerpt ?? '',
    publishedAt: entry.publishedAt,
    author: entry.author?.displayName ?? '',
    category: entry.terms?.category?.[0]?.name ?? '',
    image: (entry.featuredImage ?? entry.image ?? null) as RenderMedia | null,
  }));
}

/** Sliders that got a new id on import (their old id was taken on this server), by old id. */
const MOVED_KEY = 'moved';

async function findSlider(
  store: Store,
  siteId: string,
  attrs: BlockAttrs,
  moved: () => Promise<Record<string, string>>,
): Promise<SliderRecord | null> {
  const ref = String(attrs.slider ?? '').trim();
  const alias = String(attrs.alias ?? '').trim();
  if (UUID.test(ref)) {
    const byId = await store.get(siteId, ref);
    if (byId) return byId;
    const now = (await moved())[ref];
    if (now) {
      const byNewId = await store.get(siteId, now);
      if (byNewId) return byNewId;
    }
  } else if (ref) {
    const byAlias = await store.byAlias(siteId, ref);
    if (byAlias) return byAlias;
  }
  if (alias) return store.byAlias(siteId, alias);
  // No slider chosen yet: the site's first (the free version has one).
  if (!ref) return (await store.list(siteId))[0] ?? null;
  return null;
}

function uidOf(blockId: string): string {
  return `dio-${blockId.replace(/[^\w-]/g, '').slice(0, 40) || randomBytes(4).toString('hex')}`;
}

export default definePlugin({
  setup(ctx: PluginContext) {
    const store = databaseStore(ctx);
    const api: DioramaServerApi = installServerApi({
      list: (siteId) => store.list(siteId),
      async get(siteId, ref) {
        if (UUID.test(ref)) return store.get(siteId, ref);
        return ref ? store.byAlias(siteId, ref) : null;
      },
    });
    const warn = (message: string) => ctx.log.warn(message);

    ctx.access.defineCapability(CAPABILITY, {
      label: { en: 'Manage sliders (Diorama)', it: 'Gestire gli slider (Diorama)' },
      roles: ['administrator', 'editor'],
    });

    const invalidate = (siteId: string) => ctx.cache.invalidate(siteId, [CACHE_TAG]);

    /** The slider as a page draws it: posts filled in, extensions applied, media and links. */
    async function prepare(
      record: SliderRecord,
      context: BlockLoadContext,
    ): Promise<Omit<BlockData, 'record'>> {
      let slider = record.data;
      const extraMedia: RenderMedia[] = [];
      if (slider.source.kind === 'posts') {
        const expanded = expandPosts(slider, await latestPosts(slider, context), context.locale);
        slider = expanded.slider;
        extraMedia.push(...expanded.media);
      } else {
        // A content source of another plugin (Diorama Pro), named in `ext.source.kind`.
        const kind = (slider.ext.source as { kind?: unknown } | undefined)?.kind;
        const provider = api.sources.find((p) => p.id === kind);
        if (provider) {
          try {
            const expanded = fillTemplate(
              slider,
              await provider.load(record, context),
              context.locale,
            );
            slider = expanded.slider;
            extraMedia.push(...expanded.media);
          } catch (error) {
            warn(`The Diorama source ${provider.id} failed: ${String(error)}`);
          }
        }
      }
      for (const hook of api.beforeRender) {
        try {
          slider = await hook(slider, { siteId: context.siteId, locale: context.locale });
        } catch (error) {
          warn(`A Diorama extension failed before rendering: ${String(error)}`);
        }
      }
      const ids = new Set(mediaIdsOf(slider));
      for (const fn of api.media) {
        try {
          for (const id of fn(slider)) ids.add(id);
        } catch (error) {
          warn(`A Diorama extension failed to list media: ${String(error)}`);
        }
      }
      const media = new Map<string, RenderMedia>(extraMedia.map((m) => [m.id, m]));
      const wanted = [...ids].filter((id) => !media.has(id));
      if (wanted.length > 0 && context.loadMedia) {
        for (const [id, item] of await context.loadMedia(wanted)) media.set(id, item);
      }
      const links: Record<string, string> = {};
      for (const id of pageLinks(slider)) {
        const entry = await ctx.content.get(context.siteId, id);
        if (entry && entry.status === 'published' && entry.url) links[id] = entry.url;
      }
      return { slider, media: [...media], links };
    }

    ctx.blocks.register(
      defineBlock<BlockAttrs, BlockData>({
        type: BLOCK_TYPE,
        title: { en: 'Slider (Diorama)', it: 'Slider (Diorama)' },
        description: {
          en: 'A slider or a hero section made with Diorama.',
          it: 'Uno slider o una sezione hero fatta con Diorama.',
        },
        icon: 'slides',
        category: 'media',
        attributes: [
          {
            name: 'slider',
            type: 'text',
            maxLength: 80,
            label: { en: 'Slider', it: 'Slider' },
            help: {
              en: 'The slider’s id or its short name (Diorama → the slider).',
              it: 'L’id dello slider o il suo nome breve (Diorama → lo slider).',
            },
          },
          { name: 'alias', type: 'text', maxLength: 80, label: 'Alias', hidden: true },
        ],
        async load(attrs, context) {
          context.tag(CACHE_TAG);
          const record = await findSlider(
            store,
            context.siteId,
            attrs,
            async () =>
              (await ctx.storage.get<Record<string, string>>(context.siteId, MOVED_KEY)) ?? {},
          );
          if (!record) return { record: null, slider: null, media: [], links: {} };
          return { record, ...(await prepare(record, context)) };
        },
        css: () => BASE_CSS,
        render({ data, block, context }) {
          const t = context.locale.toLowerCase().startsWith('it');
          if (!data.record || !data.slider || data.slider.slides.length === 0) {
            if (!context.preview) return null;
            return (
              <div
                style={{
                  padding: '1.25rem 1.5rem',
                  border: '1px dashed #94a3b8',
                  borderRadius: 8,
                  background: '#f8fafc',
                  color: '#1e293b',
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: 15,
                }}
              >
                {data.record
                  ? t
                    ? 'Questo slider non ha ancora slide: aggiungile in Diorama.'
                    : 'This slider has no slides yet: add them in Diorama.'
                  : t
                    ? 'Scegli uno slider di Diorama.'
                    : 'Choose a Diorama slider.'}
              </div>
            );
          }
          const input: RenderInput = {
            slider: data.slider,
            scope: keyOf(data.record.id),
            uid: uidOf(block.id),
            title: data.record.title,
            alias: data.record.alias,
            sliderId: data.record.id,
            locale: context.locale,
            media: new Map(data.media),
            links: data.links,
          };
          const decorators: (RenderDecorator | undefined)[] = [];
          for (const decorator of api.decorators) {
            try {
              decorators.push(decorator(input));
            } catch (error) {
              warn(`A Diorama decorator failed: ${String(error)}`);
            }
          }
          input.decorate = mergeDecorators(decorators);
          for (const renderer of api.renderers) {
            try {
              const out = renderer(input);
              if (out !== undefined) return out;
            } catch (error) {
              warn(`A Diorama renderer failed: ${String(error)}`);
            }
          }
          return <SliderView {...input} />;
        },
      }),
    );

    // The runtime, only on pages with a slider (and Pro's files, when it adds some).
    ctx.assets.enqueue({ file: 'diorama.js', when: ({ html }) => html.includes('data-dio=') });

    // `[diorama id="…"]` standing alone in a paragraph, a shortcode or an HTML block.
    ctx.hooks.filter('render.blocks', (blocks) => replaceShortcodes(blocks));
    // … and out of the page's description, as WordPress strips shortcodes from excerpts.
    ctx.hooks.filter('render.head', (head) => {
      if (
        !head.description?.includes('[diorama') &&
        !Object.values(head.og ?? {}).some((v) => v.includes('[diorama'))
      )
        return head;
      const strip = (value: string) =>
        value
          .replace(/\[diorama\b[^\]]*\]/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      return {
        ...head,
        description: strip(head.description ?? ''),
        og: Object.fromEntries(Object.entries(head.og ?? {}).map(([k, v]) => [k, strip(v)])),
      };
    });
    // … and in WordPress pages, on import (plugin API 1.36).
    ctx.hooks.filter(
      'import.shortcode',
      (blocks, { tag, attrs }) =>
        blocks ??
        (tag === 'diorama'
          ? (() => {
              const block = blockFromShortcode(attrs, `b_${randomBytes(8).toString('hex')}`);
              return block ? [block] : null;
            })()
          : null),
    );

    // Sliders move with the site (`cleitext export` / `import`, plugin API 1.46).
    ctx.hooks.filter('export.pluginData', async (data, { siteId }) => {
      const records = await store.list(siteId);
      return records.length > 0 ? { ...data, [ctx.plugin.slug]: exportSliders(records) } : data;
    });
    ctx.hooks.filter('import.pluginData', async (result, { siteId, slug, data, userId }) => {
      if (slug !== ctx.plugin.slug) return result;
      const warnings: string[] = [];
      let count = 0;
      for (const item of importedSliders(data)) {
        const sliderData = normalizeSlider(item.data);
        const existing = UUID.test(item.id) ? await store.get(siteId, item.id) : null;
        if (existing) {
          await store.update(siteId, existing.id, { title: item.title, data: sliderData });
        } else {
          try {
            await store.create(siteId, {
              id: item.id,
              title: item.title,
              alias: item.alias,
              data: sliderData,
              userId: userId || null,
            });
          } catch {
            // The id belongs to a slider of another site of this server: a new one, which the
            // imported pages find through the old id.
            const created = await store.create(siteId, {
              title: item.title,
              alias: item.alias,
              data: sliderData,
              userId: userId || null,
            });
            const moved = (await ctx.storage.get<Record<string, string>>(siteId, MOVED_KEY)) ?? {};
            await ctx.storage.set(siteId, MOVED_KEY, { ...moved, [item.id]: created.id });
          }
        }
        count++;
      }
      await invalidate(siteId);
      warnings.push(`Diorama: ${count} slider${count === 1 ? '' : 's'} imported.`);
      return { warnings: [...(result?.warnings ?? []), ...warnings] };
    });

    // Background videos from YouTube or Vimeo: declared to the privacy plugin, held until consent.
    ctx.privacy.declareTrackers(async (siteId) => {
      const sources = new Set<string>();
      for (const record of await store.list(siteId)) {
        for (const slide of record.data.slides) {
          if (slide.background.kind === 'video' && slide.background.video.source !== 'mp4')
            sources.add(slide.background.video.source);
        }
      }
      const out = [];
      if (sources.has('youtube'))
        out.push({
          id: 'diorama.youtube',
          name: 'YouTube (background videos)',
          provider: 'Google Ireland Ltd',
          category: 'marketing' as const,
          requiresConsent: true,
          cookies: [],
          purpose: {
            en: 'Background videos of our sliders come from YouTube (in its privacy-enhanced mode), which receives the address of your device.',
            it: 'I video di sfondo dei nostri slider arrivano da YouTube (nella modalità che tutela la privacy), che riceve l’indirizzo del tuo dispositivo.',
          },
          transfersOutsideEu: true,
          privacyPolicyUrl: 'https://policies.google.com/privacy',
        });
      if (sources.has('vimeo'))
        out.push({
          id: 'diorama.vimeo',
          name: 'Vimeo (background videos)',
          provider: 'Vimeo.com, Inc.',
          category: 'marketing' as const,
          requiresConsent: true,
          cookies: [],
          purpose: {
            en: 'Background videos of our sliders come from Vimeo (without tracking), which receives the address of your device.',
            it: 'I video di sfondo dei nostri slider arrivano da Vimeo (senza tracciamento), che riceve l’indirizzo del tuo dispositivo.',
          },
          transfersOutsideEu: true,
          privacyPolicyUrl: 'https://vimeo.com/privacy',
        });
      return out;
    });

    ctx.ai?.addContext({ title: 'Sliders (Diorama)', markdown: () => AI_GUIDE });

    // ---- Admin API -----------------------------------------------------------------

    const overview = async (siteId: string) => {
      const records = await store.list(siteId);
      const limit = await sliderLimit(api, siteId, warn);
      return {
        sliders: records.map(summaryOf),
        count: records.length,
        limit: Number.isFinite(limit) ? limit : null,
        canCreate: records.length < limit,
        upgradeUrl: api.upgradeUrl,
      };
    };

    /** Refused with a gentle invitation when the site has all the sliders it may have. */
    const limitReached = async (request: RouteRequest) => {
      const limit = await sliderLimit(api, request.siteId, warn);
      if ((await store.count(request.siteId)) < limit) return null;
      return {
        status: 409,
        body: {
          code: 'limit',
          message: LIMIT_TEXT.en,
          messages: LIMIT_TEXT,
          limit,
          upgradeUrl: api.upgradeUrl,
        },
      };
    };

    ctx.routes.api({
      method: 'GET',
      path: '/sliders',
      capability: CAPABILITY,
      handler: async (request) => ({ body: await overview(request.siteId) }),
    });

    ctx.routes.api({
      method: 'GET',
      path: '/sliders/:id',
      capability: CAPABILITY,
      async handler(request) {
        const record = await store.get(request.siteId, request.params.id ?? '');
        return record ? { body: record } : { status: 404, body: { message: 'Slider not found.' } };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/sliders',
      capability: CAPABILITY,
      async handler(request) {
        const refused = await limitReached(request);
        if (refused) return refused;
        const input = body(request);
        let data: SliderData;
        let title = typeof input.title === 'string' ? input.title : '';
        if (typeof input.template === 'string') {
          const fromTemplate = templateSlider(input.template);
          if (!fromTemplate) return { status: 400, body: { message: 'Unknown template.' } };
          data = fromTemplate;
          title ||= TEMPLATES.find((t) => t.id === input.template)!.name;
        } else if (Array.isArray(input.quick)) {
          const items = (input.quick as QuickSlide[]).slice(0, LIMITS.slides);
          data = quickSlider(items);
          if (data.slides.length === 0)
            return { status: 400, body: { message: 'Choose at least one picture.' } };
        } else {
          data = normalizeSlider(input.data ?? {});
        }
        if (JSON.stringify(data).length > LIMITS.bytes)
          return { status: 413, body: { message: 'This slider is too large.' } };
        const record = await store.create(request.siteId, {
          title: cleanTitle(title),
          data,
          userId: request.user?.id ?? null,
        });
        await invalidate(request.siteId);
        return { status: 201, body: record };
      },
    });

    ctx.routes.api({
      method: 'PUT',
      path: '/sliders/:id',
      capability: CAPABILITY,
      async handler(request) {
        const input = body(request);
        const data = input.data !== undefined ? normalizeSlider(input.data) : undefined;
        if (data && JSON.stringify(data).length > LIMITS.bytes)
          return { status: 413, body: { message: 'This slider is too large.' } };
        const record = await store.update(request.siteId, request.params.id ?? '', {
          ...(typeof input.title === 'string' ? { title: input.title } : {}),
          ...(typeof input.alias === 'string' ? { alias: input.alias } : {}),
          ...(data ? { data } : {}),
        });
        if (!record) return { status: 404, body: { message: 'Slider not found.' } };
        await invalidate(request.siteId);
        return { body: record };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/sliders/:id/duplicate',
      capability: CAPABILITY,
      async handler(request) {
        const source = await store.get(request.siteId, request.params.id ?? '');
        if (!source) return { status: 404, body: { message: 'Slider not found.' } };
        const refused = await limitReached(request);
        if (refused) return refused;
        const record = await store.create(request.siteId, {
          title: `${source.title} (copy)`,
          data: normalizeSlider({ ...source.data, slides: source.data.slides }),
          userId: request.user?.id ?? null,
        });
        return { status: 201, body: record };
      },
    });

    ctx.routes.api({
      method: 'DELETE',
      path: '/sliders/:id',
      capability: CAPABILITY,
      async handler(request) {
        const gone = await store.remove(request.siteId, request.params.id ?? '');
        if (!gone) return { status: 404, body: { message: 'Slider not found.' } };
        await invalidate(request.siteId);
        return { body: { ok: true } };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/templates',
      capability: CAPABILITY,
      handler: async () => ({
        body: TEMPLATES.map(({ id, name, description, swatch }) => ({
          id,
          name,
          description,
          swatch,
        })),
      }),
    });

    // The site's sliders, for the block editor's and Fresco's slider pickers.
    ctx.routes.api({
      method: 'GET',
      path: '/options',
      capability: 'edit_entries',
      async handler(request) {
        const records = await store.list(request.siteId);
        return {
          body: records.map((r) => ({
            value: r.id,
            label: r.title,
            alias: r.alias,
            type: r.data.type,
          })),
        };
      },
    });

    // A few posts for the editor's preview of a slider showing the latest posts.
    ctx.routes.api({
      method: 'GET',
      path: '/posts-sample',
      capability: CAPABILITY,
      async handler(request) {
        const count = Math.min(Math.max(Number(request.query.count) || 5, 1), 20);
        const posts = await ctx.content.find(request.siteId, { type: 'article', limit: count });
        const items: PostItem[] = posts.map((p) => ({
          id: p.id,
          title: p.title,
          url: p.url,
          excerpt: typeof p.fields.excerpt === 'string' ? p.fields.excerpt : '',
          publishedAt: p.publishedAt,
          author: '',
          category: '',
          image: null,
        }));
        return { body: items };
      },
    });
  },
});
