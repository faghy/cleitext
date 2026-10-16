import { definePlugin, type PluginContext } from '@cleitext/plugin-sdk';
import { cloudflareRule, edgeHeaders } from './protocol';
import { cloudflareCheck, cloudflarePurge, varnishBan, type PurgeResult } from './purge';

/**
 * Edge cache (official plugin, shipped on its own): public pages served by
 * Varnish or Cloudflare in front of Cleitext, and purged from them as soon
 * as they change, by tag (plugin API 1.9: `cache.headers`, `cache.invalidated`).
 */

interface Settings {
  varnish: boolean;
  varnish_url: string;
  cloudflare: boolean;
  cloudflare_zone: string;
  ttl: number;
}

interface LogEntry {
  at: string;
  /** `all`, or the tags purged. */
  what: string;
  results: PurgeResult[];
}

const TOKEN = 'cloudflareToken';
const DELAY_MS = 1500;

const settingsCache = new Map<string, { at: number; value: Settings }>();
const hosts = new Map<string, Set<string>>();
const pending = new Map<string, { tags: Set<string>; timer: NodeJS.Timeout }>();

async function settingsOf(ctx: PluginContext, siteId: string, fresh = false): Promise<Settings> {
  const cached = settingsCache.get(siteId);
  if (!fresh && cached && Date.now() - cached.at < 30_000) return cached.value;
  const s = await ctx.settings.get(siteId);
  const value: Settings = {
    varnish: s.varnish === true,
    varnish_url: typeof s.varnish_url === 'string' ? s.varnish_url.trim() : '',
    cloudflare: s.cloudflare === true,
    cloudflare_zone: typeof s.cloudflare_zone === 'string' ? s.cloudflare_zone.trim() : '',
    ttl: Math.min(Math.max(Math.round(Number(s.ttl) || 3600), 60), 31_536_000),
  };
  settingsCache.set(siteId, { at: Date.now(), value });
  return value;
}

/** The hosts the site is served on, learnt from its pages: Varnish purges by host. */
async function hostsOf(ctx: PluginContext, siteId: string): Promise<Set<string>> {
  let set = hosts.get(siteId);
  if (!set) {
    set = new Set((await ctx.storage.get<string[]>(siteId, 'hosts')) ?? []);
    hosts.set(siteId, set);
  }
  return set;
}

async function remember(ctx: PluginContext, siteId: string, host: string): Promise<void> {
  const set = await hostsOf(ctx, siteId);
  if (set.has(host) || !/^[a-z0-9.-]{1,253}$/i.test(host)) return;
  set.add(host);
  await ctx.storage.set(siteId, 'hosts', [...set].slice(-20));
}

/** Purges now: the pages with these tags, or the whole site (`tags` null). */
async function purge(ctx: PluginContext, siteId: string, tags: string[] | null): Promise<LogEntry> {
  const cfg = await settingsOf(ctx, siteId, true);
  const results: PurgeResult[] = [];
  if (cfg.varnish && cfg.varnish_url) {
    for (const host of await hostsOf(ctx, siteId)) {
      results.push(await varnishBan(cfg.varnish_url, host, tags));
    }
  }
  if (cfg.cloudflare && cfg.cloudflare_zone) {
    const token = await ctx.secrets.get(siteId, TOKEN);
    if (token) {
      results.push(await cloudflarePurge(cfg.cloudflare_zone, token, siteId, tags ?? ['site']));
    } else {
      results.push({
        target: 'cloudflare',
        ok: false,
        detail: '',
        error: 'No API token: set it in Edge cache.',
      });
    }
  }
  const entry: LogEntry = {
    at: new Date().toISOString(),
    what: tags ? tags.join(' ') : 'all',
    results,
  };
  if (results.length > 0) {
    const log = (await ctx.storage.get<LogEntry[]>(siteId, 'log')) ?? [];
    await ctx.storage.set(siteId, 'log', [entry, ...log].slice(0, 30));
    for (const r of results.filter((x) => !x.ok)) {
      ctx.log.warn('A cache could not be purged', { siteId, target: r.target, error: r.error });
    }
  }
  return entry;
}

/**
 * Changes close together become one purge, sent after they are saved: the
 * first change opens a short window, the next ones join it (a fixed window,
 * so continuous editing never postpones the purge).
 */
function schedule(ctx: PluginContext, siteId: string, tags: string[]): void {
  const current = pending.get(siteId);
  if (current) {
    for (const tag of tags) current.tags.add(tag);
    return;
  }
  const set = new Set(tags);
  const timer = setTimeout(() => {
    pending.delete(siteId);
    const all = set.has('site');
    void purge(ctx, siteId, all ? null : [...set]).catch((error: unknown) =>
      ctx.log.error('Purge failed', { siteId, error: String(error) }),
    );
  }, DELAY_MS);
  timer.unref();
  pending.set(siteId, { tags: set, timer });
}

/** The VCL rules the server needs for Cleitext sites (the README explains them). */
export const VCL = `# vcl_recv — Cleitext: never cache the admin, the API, previews and signed-in users
if (req.url ~ "^/(api/|admin|cl-admin|__preview)" || req.http.Cookie ~ "cleitext_session=") {
    return (pass);
}
if (req.method == "BAN") {
    if (!client.ip ~ purge_allowed) { return (synth(403, "Not allowed")); }
    if (req.http.x-cleitext-ban) {
        ban("obj.http.x-cleitext-host == " + req.http.host +
            " && obj.http.x-cleitext-tags ~ " + req.http.x-cleitext-ban);
    } else {
        ban("obj.http.x-cleitext-host == " + req.http.host);
    }
    return (synth(200, "Banned"));
}

# vcl_backend_response — Cleitext pages: keep the tags, respect s-maxage and Set-Cookie
if (beresp.http.x-cleitext-tags) {
    set beresp.http.x-cleitext-host = bereq.http.host;
    if (beresp.http.Set-Cookie ~ "cleitext_" || beresp.http.Cache-Control ~ "(private|no-cache|no-store)") {
        set beresp.uncacheable = true;
        set beresp.ttl = 120s;
        return (deliver);
    }
    return (deliver);
}

# vcl_deliver — only for Varnish
unset resp.http.x-cleitext-tags;
unset resp.http.x-cleitext-host;`;

export default definePlugin({
  setup(ctx) {
    ctx.settings.define(
      [
        {
          name: 'ttl',
          type: 'number',
          min: 60,
          max: 31_536_000,
          default: 3600,
          label: {
            en: 'Keep pages in the cache for (seconds)',
            it: 'Tieni le pagine in cache per (secondi)',
          },
          help: {
            en: 'They are purged as soon as they change, so this can be long. Browsers still check every time.',
            it: 'Vengono svuotate appena cambiano, quindi può essere lungo. I browser controllano comunque ogni volta.',
          },
        },
        {
          name: 'varnish',
          type: 'boolean',
          default: false,
          label: { en: 'Varnish in front of the site', it: 'Varnish davanti al sito' },
        },
        {
          name: 'varnish_url',
          type: 'text',
          maxLength: 200,
          label: {
            en: 'Varnish address for purging',
            it: 'Indirizzo di Varnish per lo svuotamento',
          },
          help: {
            en: 'Reachable from this server, e.g. http://10.0.0.200:6081. Its VCL needs the rules in Edge cache.',
            it: 'Raggiungibile da questo server, es. http://10.0.0.200:6081. La sua VCL deve avere le regole in Cache esterna.',
          },
        },
        {
          name: 'cloudflare',
          type: 'boolean',
          default: false,
          label: { en: 'Cloudflare caches the pages', it: 'Cloudflare mette in cache le pagine' },
        },
        {
          name: 'cloudflare_zone',
          type: 'text',
          maxLength: 64,
          label: { en: 'Cloudflare Zone ID', it: 'Zone ID di Cloudflare' },
          help: {
            en: 'In the Overview of the domain on Cloudflare. The API token goes in Edge cache.',
            it: 'Nella Panoramica del dominio su Cloudflare. Il token API va in Cache esterna.',
          },
        },
      ],
      { title: { en: 'Edge cache', it: 'Cache esterna' } },
    );

    // Pages going into Cleitext's page cache: the same headers for the caches in front.
    ctx.hooks.filter('cache.headers', async (headers, context) => {
      const cfg = await settingsOf(ctx, context.siteId);
      if (!cfg.varnish && !cfg.cloudflare) return headers;
      await remember(ctx, context.siteId, context.host);
      return {
        ...headers,
        ...edgeHeaders(
          { varnish: cfg.varnish, cloudflare: cfg.cloudflare, ttl: cfg.ttl },
          context.siteId,
          context.status,
          context.tags,
        ),
      };
    });

    ctx.hooks.on('cache.invalidated', ({ tags }, { siteId }) => {
      // New settings are read again at once (saving them invalidates the whole site).
      if (tags.includes('site')) settingsCache.delete(siteId);
      schedule(ctx, siteId, tags);
    });

    ctx.routes.api({
      method: 'GET',
      path: '/status',
      capability: 'manage_settings',
      async handler(request) {
        const cfg = await settingsOf(ctx, request.siteId, true);
        const known = [...(await hostsOf(ctx, request.siteId))];
        return {
          body: {
            settings: cfg,
            cloudflareToken: Boolean(await ctx.secrets.get(request.siteId, TOKEN)),
            hosts: known,
            log: (await ctx.storage.get<LogEntry[]>(request.siteId, 'log')) ?? [],
            vcl: VCL,
            cloudflareRule: known.length > 0 ? cloudflareRule(known) : null,
          },
        };
      },
    });

    ctx.routes.api({
      method: 'PUT',
      path: '/cloudflare-token',
      capability: 'manage_settings',
      async handler(request) {
        const token = String((request.body as { token?: unknown })?.token ?? '').trim();
        if (!/^[\w-]{20,200}$/.test(token)) {
          return { status: 400, body: { message: 'This is not a Cloudflare API token.' } };
        }
        const problem = await cloudflareCheck(token);
        if (problem) return { status: 400, body: { message: `Cloudflare: ${problem}` } };
        await ctx.secrets.set(request.siteId, TOKEN, token);
        return { body: { ok: true } };
      },
    });

    ctx.routes.api({
      method: 'DELETE',
      path: '/cloudflare-token',
      capability: 'manage_settings',
      async handler(request) {
        await ctx.secrets.delete(request.siteId, TOKEN);
        return { body: { ok: true } };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/purge',
      capability: 'manage_settings',
      async handler(request) {
        return { body: await purge(ctx, request.siteId, null) };
      },
    });

    // What a visitor gets: the cache headers of the home page, asked twice.
    ctx.routes.api({
      method: 'POST',
      path: '/check',
      capability: 'manage_settings',
      async handler(request) {
        const host = (request.headers.host ?? '').split(':')[0]!.toLowerCase();
        const proto = request.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https';
        const seen: Record<string, string>[] = [];
        try {
          for (let i = 0; i < 2; i++) {
            const res = await fetch(`${proto}://${host}/`, { signal: AbortSignal.timeout(2000) });
            await res.arrayBuffer();
            const picked: Record<string, string> = { status: String(res.status) };
            res.headers.forEach((value, name) => {
              if (
                /^(age|cache-control|cdn-cache-control|cf-cache-status|x-cache|x-varnish|via)$|cache/i.test(
                  name,
                )
              ) {
                picked[name] = value;
              }
            });
            seen.push(picked);
          }
        } catch (error) {
          return { body: { error: (error as Error).message, seen } };
        }
        return { body: { seen } };
      },
    });
  },
});
