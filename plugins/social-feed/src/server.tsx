import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  defineBlock,
  definePlugin,
  type FieldDefinition,
  type PluginContext,
  type RouteRequest,
  type RouteResponse,
} from '@cleitext/plugin-sdk';
import {
  ADMIN_PAGE_PATH,
  cleanSecret,
  cleanToken,
  normalizeConfig,
  validRedirectUri,
} from './config';
import {
  CACHE_TAG,
  channelView,
  choosePage,
  connectFacebookToken,
  connectInstagram,
  disconnect,
  fetchChannel,
  fetchSoon,
  loadCache,
  loadConfig,
  loadState,
  offerPages,
  pendingPages,
  refreshTokens,
  runScheduled,
  saveConfig,
  SECRET,
  type FeedDeps,
} from './feed';
import { databaseImages, keyOfFile, MEDIA_ROUTE } from './images';
import {
  facebookAuthorizeUrl,
  facebookExchangeCode,
  instagramAuthorizeUrl,
  instagramExchangeCode,
  instagramLongLived,
  MetaError,
} from './meta';
import { mergeFeeds } from './normalize';
import { columnsOf, MAX_RENDERED, renderFeed, type FeedAttrs, type FeedData } from './render';
import { BASE_CSS, instanceCss } from './styles';
import {
  CHANNELS,
  type Channel,
  type FeedCache,
  type FeedConfig,
  type SettingsView,
  type SocialProfile,
} from './types';

/**
 * Social Feed (official plugin, shipped on its own): the latest posts of an
 * Instagram professional account and of a Facebook Page, through Meta's
 * official APIs and the site owner's own Meta app. Tokens and app secrets
 * are plugin secrets, never sent to the browser; a scheduled task refreshes
 * the Instagram token before it expires and fetches the posts, whose
 * pictures are copied to the site. The Social feed block shows them.
 */

const OAUTH_KEY = 'oauth';
/** The sign-in must come back within this time. */
const OAUTH_TTL = 15 * 60 * 1000;

interface OAuthPending {
  state: string;
  channel: Channel;
  userId: string;
  redirectUri: string;
  createdAt: string;
}

const isChannel = (value: unknown): value is Channel =>
  value === 'instagram' || value === 'facebook';

const body = (request: RouteRequest) =>
  (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;

const failure = (error: unknown): RouteResponse => {
  if (error instanceof MetaError) return { status: 400, body: { message: error.message } };
  throw error;
};

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// ---- Block -----------------------------------------------------------------------------

const ATTRIBUTES: FieldDefinition[] = [
  {
    name: 'source',
    type: 'select',
    label: { en: 'Posts from', it: 'Post da' },
    options: [
      {
        value: 'all',
        label: { en: 'Instagram and Facebook, by date', it: 'Instagram e Facebook, per data' },
      },
      { value: 'instagram', label: { en: 'Instagram only', it: 'Solo Instagram' } },
      { value: 'facebook', label: { en: 'Facebook only', it: 'Solo Facebook' } },
    ],
    default: 'all',
  },
  {
    name: 'layout',
    type: 'select',
    label: { en: 'Layout', it: 'Disposizione' },
    options: [
      { value: 'grid', label: { en: 'Grid', it: 'Griglia' } },
      { value: 'carousel', label: { en: 'Carousel', it: 'Carosello' } },
      { value: 'list', label: { en: 'List', it: 'Elenco' } },
    ],
    default: 'grid',
  },
  {
    name: 'columns',
    type: 'number',
    responsive: true,
    label: { en: 'Columns', it: 'Colonne' },
    min: 1,
    max: 8,
    default: { desktop: 3, tablet: 3, mobile: 2 },
    showIf: { field: 'layout', not: 'list' },
  },
  {
    name: 'count',
    type: 'number',
    label: { en: 'Posts shown', it: 'Post mostrati' },
    help: {
      en: 'With "Load more", how many more each click shows.',
      it: 'Con "Carica altri", quanti altri ne mostra ogni clic.',
    },
    min: 1,
    max: 50,
    default: 9,
  },
  {
    name: 'gap',
    type: 'number',
    label: { en: 'Space between posts', it: 'Spazio tra i post' },
    min: 0,
    max: 48,
    unit: 'px',
    default: 8,
  },
  {
    name: 'aspect',
    type: 'select',
    label: { en: 'Pictures', it: 'Immagini' },
    options: [
      { value: 'square', label: { en: 'Square', it: 'Quadrate' } },
      { value: 'portrait', label: { en: 'Portrait (4:5)', it: 'Verticali (4:5)' } },
      { value: 'original', label: { en: 'As posted', it: 'Come pubblicate' } },
    ],
    default: 'square',
  },
  {
    name: 'header',
    type: 'boolean',
    label: {
      en: 'Header with picture, name and followers',
      it: 'Intestazione con immagine, nome e follower',
    },
    default: true,
  },
  {
    name: 'follow',
    type: 'boolean',
    label: { en: 'Follow button', it: 'Pulsante Segui' },
    default: true,
    showIf: { field: 'header', equals: true },
  },
  {
    name: 'followLabel',
    type: 'text',
    maxLength: 60,
    label: { en: 'Follow button text', it: 'Testo del pulsante Segui' },
    help: {
      en: 'Empty: "Follow on Instagram" (or Facebook).',
      it: 'Vuoto: "Segui su Instagram" (o Facebook).',
    },
    showIf: {
      all: [
        { field: 'header', equals: true },
        { field: 'follow', equals: true },
      ],
    },
  },
  {
    name: 'caption',
    type: 'boolean',
    label: { en: 'Show the caption', it: 'Mostra la didascalia' },
    default: false,
  },
  {
    name: 'captionLength',
    type: 'number',
    label: { en: 'Caption length (characters)', it: 'Lunghezza della didascalia (caratteri)' },
    min: 20,
    max: 2200,
    default: 120,
    showIf: { field: 'caption', equals: true },
  },
  {
    name: 'date',
    type: 'boolean',
    label: { en: 'Show the date', it: 'Mostra la data' },
    default: false,
  },
  {
    name: 'likes',
    type: 'boolean',
    label: { en: 'Show likes and comments', it: 'Mostra Mi piace e commenti' },
    default: false,
  },
  {
    name: 'loadMore',
    type: 'boolean',
    label: { en: '"Load more" button', it: 'Pulsante "Carica altri"' },
    default: true,
    showIf: { field: 'layout', not: 'carousel' },
  },
  {
    name: 'loadMoreLabel',
    type: 'text',
    maxLength: 60,
    label: { en: '"Load more" text', it: 'Testo di "Carica altri"' },
    showIf: {
      all: [
        { field: 'loadMore', equals: true },
        { field: 'layout', not: 'carousel' },
      ],
    },
  },
  {
    name: 'lightbox',
    type: 'boolean',
    label: {
      en: 'Open posts in a window on the page (lightbox)',
      it: 'Apri i post in una finestra sulla pagina (lightbox)',
    },
    help: {
      en: 'Off: posts open on Instagram or Facebook.',
      it: 'Spento: i post si aprono su Instagram o Facebook.',
    },
    default: true,
  },
];

const AI_GUIDE = `The **social-feed/feed** block shows the latest posts of the site's Instagram account and Facebook Page, fetched by the Social Feed plugin (connected in Settings → Social feed; never write posts or their pictures by hand). Attributes: \`source\` (\`all\`, \`instagram\`, \`facebook\`), \`layout\` (\`grid\`, \`carousel\`, \`list\`), \`columns\` (\`{ "desktop": 3, "tablet": 3, "mobile": 2 }\`), \`count\` (posts shown, 1–50), \`header\` and \`follow\` (profile and follow button), \`caption\`, \`date\`, \`likes\`, \`loadMore\`, \`lightbox\` (booleans). Example: \`{ "type": "social-feed/feed", "attrs": { "source": "instagram", "layout": "grid", "count": 6, "columns": { "desktop": 3, "mobile": 2 } } }\`. It renders nothing until an account is connected.`;

// ---- Plugin ----------------------------------------------------------------------------

export default definePlugin({
  setup(ctx: PluginContext) {
    /** What blocks read, remembered a few seconds per site: a page may hold several feeds. */
    const snapshots = new Map<
      string,
      {
        at: number;
        value: Promise<{
          config: FeedConfig;
          caches: Record<Channel, FeedCache | null>;
          connected: Record<Channel, boolean>;
        }>;
      }
    >();
    const deps: FeedDeps = {
      http: (request) => ctx.http.send(request),
      storage: ctx.storage,
      secrets: ctx.secrets,
      images: databaseImages(ctx),
      async invalidate(siteId) {
        snapshots.delete(siteId);
        await ctx.cache.invalidate(siteId, [CACHE_TAG]);
      },
      log: ctx.log,
      now: () => new Date(),
    };

    const snapshot = (siteId: string) => {
      const known = snapshots.get(siteId);
      if (known && Date.now() - known.at < 10_000) return known.value;
      const value = (async () => {
        const config = await loadConfig(deps, siteId);
        const caches = {} as Record<Channel, FeedCache | null>;
        const connected = {} as Record<Channel, boolean>;
        for (const channel of CHANNELS) {
          caches[channel] = await loadCache(deps, siteId, channel);
          connected[channel] = (await loadState(deps, siteId, channel)).connected;
        }
        return { config, caches, connected };
      })();
      snapshots.set(siteId, { at: Date.now(), value });
      if (snapshots.size > 1000) snapshots.clear();
      value.catch(() => snapshots.delete(siteId));
      return value;
    };

    ctx.blocks.register(
      defineBlock<FeedAttrs, FeedData>({
        type: 'social-feed/feed',
        title: { en: 'Social feed', it: 'Feed social' },
        description: {
          en: 'The latest posts of your Instagram account and Facebook Page, as a grid, a carousel or a list.',
          it: 'Gli ultimi post del tuo account Instagram e della tua Pagina Facebook, a griglia, carosello o elenco.',
        },
        icon: 'instagram',
        category: 'embed',
        attributes: ATTRIBUTES,
        async load(attrs, context) {
          context.tag(CACHE_TAG);
          const { config, caches, connected } = await snapshot(context.siteId);
          const wanted: Channel[] =
            attrs.source === 'instagram' || attrs.source === 'facebook'
              ? [attrs.source]
              : [...CHANNELS];
          const channels = wanted.filter((c) => config[c].enabled);
          const posts = mergeFeeds(
            channels.map((c) => caches[c]?.posts ?? []),
            MAX_RENDERED,
          );
          return {
            posts,
            profiles: channels
              .map((c) => caches[c]?.profile)
              .filter((p): p is SocialProfile => Boolean(p)),
            media: config.media,
            consentCategory: config.consentCategory,
            connected: channels.some((c) => connected[c]),
          };
        },
        css: ({ attrs, block }) =>
          `${BASE_CSS}\n${instanceCss(block.id, columnsOf(attrs.columns), Math.min(Math.max(Number(attrs.gap) || 0, 0), 48))}`,
        render: ({ attrs, data, block, context }) =>
          renderFeed({
            attrs,
            data,
            blockId: block.id,
            locale: context.locale,
            ...(context.preview ? { preview: true } : {}),
          }),
      }),
    );

    ctx.assets.enqueue({ file: 'feed.js', when: ({ html }) => html.includes('data-cx-sfeed') });

    // Copies of the pictures, served by the site: their address changes with their content.
    ctx.routes.public({
      method: 'GET',
      path: `${MEDIA_ROUTE}/:file`,
      async handler(request) {
        const key = keyOfFile(request.params.file ?? '');
        if (!key) return { status: 404, body: 'Not found', contentType: 'text/plain' };
        const image = await deps.images.get(request.siteId, key);
        if (!image) return { status: 404, body: 'Not found', contentType: 'text/plain' };
        return {
          body: image.bytes,
          contentType: image.mime,
          headers: {
            'cache-control': 'public, max-age=31536000, immutable',
            'x-content-type-options': 'nosniff',
          },
        };
      },
    });

    // Every ten minutes: tokens to refresh, feeds whose time has come.
    ctx.schedule.every('refresh', 10, async (siteId) => {
      try {
        await runScheduled(deps, siteId);
      } catch (error) {
        ctx.log.warn('The scheduled refresh failed', { siteId, error: String(error) });
      }
    });

    // Pictures loaded from Meta's servers, only when the site does not copy them.
    ctx.privacy.declareTrackers(async (siteId) => {
      const config = await loadConfig(deps, siteId);
      if (config.media !== 'hotlink' || (!config.instagram.enabled && !config.facebook.enabled))
        return [];
      return [
        {
          id: 'social-feed.meta',
          name: 'Instagram, Facebook (pictures)',
          provider: 'Meta Platforms Ireland Ltd',
          category: config.consentCategory,
          requiresConsent: true,
          cookies: [],
          purpose: {
            en: 'The pictures of our Instagram and Facebook posts are loaded from Meta’s servers, which receive the address of your device.',
            it: 'Le immagini dei nostri post di Instagram e Facebook sono caricate dai server di Meta, che ricevono l’indirizzo del tuo dispositivo.',
          },
          transfersOutsideEu: true,
          privacyPolicyUrl: 'https://privacycenter.instagram.com/policy',
        },
      ];
    });

    ctx.ai?.addContext({ title: 'Social feed', markdown: () => AI_GUIDE });

    // ---- Settings and connections ------------------------------------------------------

    const view = async (siteId: string): Promise<SettingsView> => {
      const channels = {} as SettingsView['channels'];
      for (const channel of CHANNELS) channels[channel] = await channelView(deps, siteId, channel);
      return {
        config: await loadConfig(deps, siteId),
        secrets: {
          instagramAppSecret: Boolean(await ctx.secrets.get(siteId, SECRET.instagramAppSecret)),
          facebookAppSecret: Boolean(await ctx.secrets.get(siteId, SECRET.facebookAppSecret)),
        },
        channels,
        pages: await pendingPages(deps, siteId),
        redirectPath: ADMIN_PAGE_PATH,
      };
    };
    const capability = 'manage_settings';

    ctx.routes.api({
      method: 'GET',
      path: '/settings',
      capability,
      handler: async (request) => ({ body: await view(request.siteId) }),
    });

    ctx.routes.api({
      method: 'PUT',
      path: '/settings',
      capability,
      async handler(request) {
        const input = body(request);
        const before = await loadConfig(deps, request.siteId);
        const config = normalizeConfig(input.config);
        const secrets = (input.secrets ?? {}) as Record<string, unknown>;
        const changes: [string, string | null][] = [];
        for (const [field, name] of [
          ['instagramAppSecret', SECRET.instagramAppSecret],
          ['facebookAppSecret', SECRET.facebookAppSecret],
        ] as const) {
          const value = secrets[field];
          // null removes it; an empty string keeps it.
          if (value === null) changes.push([name, null]);
          else if (typeof value === 'string' && value.trim()) {
            const clean = cleanSecret(value);
            if (!clean)
              return {
                status: 400,
                body: { message: 'An app secret is 32 letters and digits (0–9, a–f).' },
              };
            changes.push([name, clean]);
          }
        }
        await saveConfig(deps, request.siteId, config);
        for (const [name, value] of changes) {
          if (value === null) await ctx.secrets.delete(request.siteId, name);
          else await ctx.secrets.set(request.siteId, name, value);
        }
        // A new number of posts or way of showing pictures: fetch again at the next run.
        if (before.count !== config.count || before.media !== config.media)
          await fetchSoon(deps, request.siteId);
        await deps.invalidate(request.siteId);
        return { body: await view(request.siteId) };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/oauth/start',
      capability,
      async handler(request) {
        const input = body(request);
        if (!isChannel(input.channel))
          return { status: 400, body: { message: 'Unknown channel.' } };
        const channel = input.channel;
        const redirectUri = validRedirectUri(input.redirectUri);
        if (!redirectUri)
          return {
            status: 400,
            body: {
              message: `Meta needs the site over https and the address of this page (${ADMIN_PAGE_PATH}).`,
            },
          };
        const config = await loadConfig(deps, request.siteId);
        const appId = config[channel].appId;
        const secretName =
          channel === 'instagram' ? SECRET.instagramAppSecret : SECRET.facebookAppSecret;
        if (!appId || !(await ctx.secrets.get(request.siteId, secretName)))
          return {
            status: 400,
            body: { message: 'Save the app ID and the app secret first.' },
          };
        const state = randomBytes(24).toString('base64url');
        const pending: OAuthPending = {
          state,
          channel,
          userId: request.user!.id,
          redirectUri,
          createdAt: new Date().toISOString(),
        };
        await ctx.storage.set(request.siteId, OAUTH_KEY, pending);
        const url =
          channel === 'instagram'
            ? instagramAuthorizeUrl(appId, redirectUri, state)
            : facebookAuthorizeUrl(
                appId,
                redirectUri,
                state,
                config.instagram.enabled && config.instagram.via === 'facebook',
              );
        return { body: { url } };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/oauth/callback',
      capability,
      async handler(request) {
        const input = body(request);
        const pending = await ctx.storage.get<OAuthPending>(request.siteId, OAUTH_KEY);
        const state = typeof input.state === 'string' ? input.state : '';
        const code = typeof input.code === 'string' ? input.code.trim() : '';
        // Checked before anything else, and used once.
        if (
          !pending ||
          !state ||
          !sameText(state, pending.state) ||
          pending.userId !== request.user!.id ||
          Date.now() - Date.parse(pending.createdAt) > OAUTH_TTL
        )
          return {
            status: 400,
            body: {
              message: 'This sign-in is not the one started here, or it took too long. Try again.',
            },
          };
        await ctx.storage.delete(request.siteId, OAUTH_KEY);
        if (!code || code.length > 2000)
          return { status: 400, body: { message: 'Meta sent no sign-in code.' } };
        const config = await loadConfig(deps, request.siteId);
        const now = new Date();
        try {
          if (pending.channel === 'instagram') {
            const secret = await ctx.secrets.get(request.siteId, SECRET.instagramAppSecret);
            if (!config.instagram.appId || !secret)
              return {
                status: 400,
                body: { message: 'Save the app ID and the app secret first.' },
              };
            const app = { appId: config.instagram.appId, secret };
            const short = await instagramExchangeCode(deps.http, app, code, pending.redirectUri);
            const long = await instagramLongLived(deps.http, secret, short.token, now);
            await connectInstagram(deps, request.siteId, long.token, {
              method: 'oauth',
              expiresAt: long.expiresAt,
            });
            return { body: { channel: 'instagram', pages: [] } };
          }
          const secret = await ctx.secrets.get(request.siteId, SECRET.facebookAppSecret);
          if (!config.facebook.appId || !secret)
            return { status: 400, body: { message: 'Save the app ID and the app secret first.' } };
          const grant = await facebookExchangeCode(
            deps.http,
            { appId: config.facebook.appId, secret },
            code,
            pending.redirectUri,
            now,
          );
          const offered = await offerPages(deps, request.siteId, grant.token);
          return { body: { channel: 'facebook', pages: offered.pages } };
        } catch (error) {
          return failure(error);
        }
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/facebook/page',
      capability,
      async handler(request) {
        const pageId = body(request).pageId;
        if (typeof pageId !== 'string' || !/^\d{1,30}$/.test(pageId))
          return { status: 400, body: { message: 'Choose a Page.' } };
        try {
          await choosePage(deps, request.siteId, pageId);
        } catch (error) {
          return failure(error);
        }
        return { body: await view(request.siteId) };
      },
    });

    // A token pasted by hand, when the sign-in cannot be used.
    ctx.routes.api({
      method: 'POST',
      path: '/token',
      capability,
      async handler(request) {
        const input = body(request);
        if (!isChannel(input.channel))
          return { status: 400, body: { message: 'Unknown channel.' } };
        const token = cleanToken(input.token);
        if (!token)
          return { status: 400, body: { message: 'This does not look like an access token.' } };
        try {
          if (input.channel === 'instagram') {
            await connectInstagram(deps, request.siteId, token, {
              method: 'manual',
              expiresAt: null,
            });
          } else {
            await connectFacebookToken(deps, request.siteId, token);
          }
        } catch (error) {
          return failure(error);
        }
        return { body: await view(request.siteId) };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/refresh',
      capability,
      async handler(request) {
        const input = body(request);
        const channels = isChannel(input.channel) ? [input.channel] : [...CHANNELS];
        await refreshTokens(deps, request.siteId);
        for (const channel of channels) {
          const state = await loadState(deps, request.siteId, channel);
          if (state.connected) await fetchChannel(deps, request.siteId, channel);
        }
        return { body: await view(request.siteId) };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/disconnect',
      capability,
      async handler(request) {
        const channel = body(request).channel;
        if (!isChannel(channel)) return { status: 400, body: { message: 'Unknown channel.' } };
        await disconnect(deps, request.siteId, channel);
        return { body: await view(request.siteId) };
      },
    });
  },
});
