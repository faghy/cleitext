/**
 * Disbigle (official plugin): the site's new articles announced on the
 * fediverse through a Mastodon-compatible server (Disbigle by default),
 * which signs and delivers the posts: Cleitext is not an ActivityPub
 * server. The people mentioned as `@user@server` are notified by the server
 * and linked in the article; the replies to the post are shown under it.
 */
import {
  defineBlock,
  definePlugin,
  type PluginContext,
  type RouteRequest,
  type RouteResponse,
} from '@cleitext/plugin-sdk';
import { ADMIN_PAGE_PATH, FIELD_GROUP, normalizeConfig, normalizeInstance, SLUG } from './config';
import {
  authorizeUrl,
  exchangeCode,
  registerApp,
  revokeToken,
  ServerError,
  verifyCredentials,
  type Http,
} from './mastodon';
import { linkMentions, mentionMap, protectMentions } from './mentions';
import { codeChallenge, codeVerifier, randomState, sameText } from './pkce';
import { CSS, FediverseSection, type SectionData } from './render';
import { withAvatars } from './comments';
import { hostOf } from './config';
import { CACHE_TAG, commentsTag, Disbigle, KEY, SECRET, withAliases } from './service';
import type { Connection, OAuthPending } from './types';

const BLOCK = `${SLUG}/fediverse`;
/** The sign-in must come back within this time. */
const OAUTH_TTL = 15 * 60 * 1000;
const PENDING_SECRET = 'pending-client-secret';
const capability = 'manage_settings';

const body = (request: RouteRequest) =>
  (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;

const failure = (error: unknown): RouteResponse => {
  if (error instanceof ServerError)
    return { status: error.status === 0 ? 502 : 400, body: { message: error.message } };
  throw error;
};

export function siteHttp(ctx: PluginContext): Http {
  return async (request) => {
    const response = await ctx.http.send({
      url: request.url,
      method: request.method,
      ...(request.headers ? { headers: request.headers } : {}),
      ...(request.body !== undefined ? { body: request.body } : {}),
      timeoutMs: request.timeoutMs ?? 10_000,
    });
    return { status: response.status, text: response.text };
  };
}

export default definePlugin({
  setup(ctx: PluginContext) {
    const http = siteHttp(ctx);
    const disbigle = new Disbigle(ctx, http);

    // The editor's option, on by default: an article can stay off the fediverse.
    ctx.content.registerFieldGroup({
      id: FIELD_GROUP,
      title: { en: 'Disbigle', it: 'Disbigle' },
      types: ['article'],
      fields: [
        {
          name: 'announce',
          type: 'boolean',
          label: { en: 'Announce on Disbigle', it: 'Annuncia su Disbigle' },
          help: {
            en: 'When the article is first published, a post with its title, summary and link goes out on the fediverse, once for all its translations.',
            it: 'Alla prima pubblicazione dell’articolo esce sul fediverso un post con titolo, riassunto e link, una sola volta per tutte le sue traduzioni.',
          },
          default: true,
        },
      ],
    });

    // ---- Publishing --------------------------------------------------------------------

    ctx.hooks.on('entry.published', async ({ entry }) => {
      if (entry.type !== 'article') return;
      try {
        await disbigle.announce(entry.siteId, entry.id);
      } catch (error) {
        ctx.log.warn('The announcement could not be prepared', {
          siteId: entry.siteId,
          entryId: entry.id,
          error: String(error),
        });
      }
    });

    // Articles whose translations had time to come out, scheduled entries and retries: every minute.
    ctx.schedule.every('announce', 1, async (siteId) => {
      try {
        await disbigle.announcePending(siteId);
      } catch (error) {
        ctx.log.warn('The scheduled announcements failed', { siteId, error: String(error) });
      }
    });
    // New replies.
    ctx.schedule.every('replies', 5, async (siteId) => {
      try {
        await disbigle.refreshComments(siteId);
      } catch (error) {
        ctx.log.warn('The replies could not be refreshed', { siteId, error: String(error) });
      }
    });

    // ---- In the article ----------------------------------------------------------------

    ctx.blocks.register(
      defineBlock<Record<string, never>, SectionData | null>({
        type: BLOCK,
        title: { en: 'Fediverse comments', it: 'Commenti dal fediverso' },
        description: {
          en: 'The replies from the fediverse to the article’s Disbigle post, and the link to comment.',
          it: 'Le risposte dal fediverso al post Disbigle dell’articolo, e il link per commentare.',
        },
        icon: 'admin-comments',
        category: 'widgets',
        attributes: [],
        async load(_attrs, context) {
          const entryId = context.entry?.id ?? context.page.entry?.id;
          if (!entryId) return null;
          const record = await disbigle.published(context.siteId, entryId);
          if (!record) return null;
          context.tag(CACHE_TAG);
          context.tag(commentsTag(record.statusId!));
          const config = await disbigle.config(context.siteId);
          const comments = config.comments
            ? withAvatars(
                (await disbigle.comments(context.siteId, record, { timeoutMs: 2500 })).items,
                hostOf(record.instance),
                config.remoteAvatars,
              )
            : [];
          return { url: record.url!, comments };
        },
        css: () => CSS,
        render: ({ data, context }) =>
          data ? <FediverseSection data={data} locale={context.locale} /> : null,
      }),
    );

    // Mentions become links, and the section goes under announced articles.
    ctx.hooks.filter('render.blocks', async (blocks, context) => {
      if (context.entry.type !== 'article') return blocks;
      const record = await disbigle.published(context.siteId, context.entry.id);
      if (!record) return blocks;
      const connection = await disbigle.connection(context.siteId);
      // Also `user@disbigle.com` for an account of app.disbigle.com (domain read once).
      const mentions =
        connection && connection.instance === record.instance && record.mentions?.length
          ? withAliases(record.mentions, await disbigle.serverHosts(context.siteId, connection))
          : record.mentions;
      return [
        ...linkMentions(blocks, mentionMap(mentions)),
        { id: 'disbigle-fediverse', type: BLOCK, v: 1, attrs: {} },
      ];
    });

    // Cloudflare's Email Obfuscation would take `@user@server` for an email address.
    ctx.hooks.filter('render.html', (html) => protectMentions(html));

    ctx.ai?.addContext({
      title: 'Disbigle',
      markdown:
        'The Disbigle plugin announces each new article once on the fediverse (all its translations in one post). Mentions written as `@user@server` in an article notify those people and become links to their profiles. The option **Announce on Disbigle** (`fields.disbigle.announce`, default true) leaves an article out. Replies from the fediverse show under the article by themselves: never write them by hand.',
    });

    // ---- Settings and connection -------------------------------------------------------

    ctx.routes.api({
      method: 'GET',
      path: '/settings',
      capability,
      handler: async (request) => ({ body: await disbigle.view(request.siteId) }),
    });

    ctx.routes.api({
      method: 'PUT',
      path: '/settings',
      capability,
      async handler(request) {
        const input = body(request).config;
        const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
        if (raw.instance !== undefined && !normalizeInstance(raw.instance))
          return {
            status: 400,
            body: { message: 'The server address must be https, e.g. https://app.disbigle.com.' },
          };
        const config = normalizeConfig(input, await disbigle.config(request.siteId));
        await disbigle.saveConfig(request.siteId, config);
        await ctx.cache.invalidate(request.siteId, [CACHE_TAG]);
        return { body: await disbigle.view(request.siteId) };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/connect',
      capability,
      async handler(request) {
        const input = body(request);
        const current = await disbigle.config(request.siteId);
        const instance =
          input.instance === undefined ? current.instance : normalizeInstance(input.instance);
        if (!instance)
          return {
            status: 400,
            body: { message: 'The server address must be https, e.g. https://app.disbigle.com.' },
          };
        await disbigle.saveConfig(request.siteId, { ...current, instance });
        const site = await ctx.site(request.siteId);
        const redirectUri = `${request.origin}${ADMIN_PAGE_PATH}`;
        try {
          const app = await registerApp(http, instance, {
            clientName: `Cleitext · ${site.name}`.slice(0, 200),
            redirectUri,
            website: request.origin,
          });
          const verifier = codeVerifier();
          const state = randomState();
          await ctx.secrets.set(request.siteId, PENDING_SECRET, app.clientSecret);
          await ctx.storage.set(request.siteId, KEY.oauth, {
            state,
            verifier,
            instance,
            clientId: app.clientId,
            redirectUri,
            siteUrl: request.origin,
            userId: request.user!.id,
            createdAt: new Date().toISOString(),
          } satisfies OAuthPending);
          return {
            body: {
              url: authorizeUrl(instance, {
                clientId: app.clientId,
                redirectUri,
                challenge: codeChallenge(verifier),
                state,
              }),
            },
          };
        } catch (error) {
          return failure(error);
        }
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/callback',
      capability,
      async handler(request) {
        const input = body(request);
        const pending = await ctx.storage.get<OAuthPending>(request.siteId, KEY.oauth);
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
        await ctx.storage.delete(request.siteId, KEY.oauth);
        const clientSecret = await ctx.secrets.get(request.siteId, PENDING_SECRET);
        await ctx.secrets.delete(request.siteId, PENDING_SECRET);
        if (!code || code.length > 2000 || !clientSecret)
          return { status: 400, body: { message: 'The server sent no sign-in code.' } };
        try {
          const token = await exchangeCode(http, pending.instance, {
            clientId: pending.clientId,
            clientSecret,
            code,
            redirectUri: pending.redirectUri,
            verifier: pending.verifier,
          });
          const account = await verifyCredentials(http, pending.instance, token);
          await ctx.secrets.set(request.siteId, SECRET.token, token);
          await ctx.secrets.set(request.siteId, SECRET.clientSecret, clientSecret);
          await ctx.storage.set(request.siteId, KEY.connection, {
            instance: pending.instance,
            clientId: pending.clientId,
            accountId: account.id,
            acct: account.acct,
            accountUrl: account.url,
            connectedAt: new Date().toISOString(),
            siteUrl: pending.siteUrl,
          } satisfies Connection);
        } catch (error) {
          return failure(error);
        }
        return { body: await disbigle.view(request.siteId) };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/disconnect',
      capability,
      async handler(request) {
        const connection = await disbigle.connection(request.siteId);
        const token = await ctx.secrets.get(request.siteId, SECRET.token);
        const clientSecret = await ctx.secrets.get(request.siteId, SECRET.clientSecret);
        if (connection && token && clientSecret)
          await revokeToken(http, connection.instance, {
            clientId: connection.clientId,
            clientSecret,
            token,
          }).catch(() => undefined);
        await disbigle.disconnect(request.siteId);
        return { body: await disbigle.view(request.siteId) };
      },
    });

    // An announcement that failed, sent again by hand (same idempotency key).
    ctx.routes.api({
      method: 'POST',
      path: '/retry',
      capability,
      async handler(request) {
        const entryId = body(request).entryId;
        if (typeof entryId !== 'string' || !/^[\w-]{1,64}$/.test(entryId))
          return { status: 400, body: { message: 'Unknown article.' } };
        const result = await disbigle.announce(request.siteId, entryId, { manual: true });
        if (result === 'not-connected')
          return { status: 400, body: { message: 'Connect a Disbigle account first.' } };
        return { body: { result, view: await disbigle.view(request.siteId) } };
      },
    });
  },
});
