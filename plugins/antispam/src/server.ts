import {
  definePlugin,
  type FormVerifyContext,
  type FormVerifyResult,
  type PluginContext,
} from '@cleitext/plugin-sdk';
import { promises as dns } from 'node:dns';
import { challengeHtml, HONEYPOT_FIELD, MARKER_FIELD, TOKEN_FIELD, TOKEN_PATH } from './challenge';
import {
  allowedScripts,
  alwaysMarked,
  formGroup,
  normalizeConfig,
  parseList,
  type AntispamConfig,
  type Outcome,
  type ParsedList,
  type QueueItem,
  type ScriptName,
} from './config';
import {
  allowlisted,
  blocklistHit,
  decide,
  extract,
  fingerprintText,
  normalizeText,
  score,
  scriptPoints,
  type Decision,
  type Scored,
  type Submission,
  type TokenState,
} from './rules';
import {
  count,
  enqueue,
  learn,
  purge,
  queueRows,
  readStats,
  removeAllRows,
  removeRows,
  rowsByEmail,
  rowsById,
  rowsByRef,
  sawText,
  senderSpam,
  textFacts,
  type NewQueueItem,
} from './store';
import { checkToken, deriveKeys, ipHash, makeToken, newSecret, textHash, type Keys } from './token';

/**
 * Antispam (official plugin, free): local checks on comments, sign-ups and
 * the forms of plugins, through the core's form protection (`form.challenge`
 * and `form.verify`, plugin API 1.38, with the spam verdicts of 1.45).
 * Nothing leaves the site: no outside service, addresses only as salted
 * hashes. Doubtful submissions are left to a captcha plugin that runs after
 * this one (Captcha), or kept in the spam queue.
 */

const CONFIG_KEY = 'config';
const SECRET = 'key';
/** Runs before the captcha plugins (default 10), so that they see the verdict. */
const EARLY = 5;
/** Runs after every other protection, to note what became of the submission. */
const LATE = 1000;

interface SiteState {
  config: AntispamConfig;
  keys: Keys;
  block: ParsedList;
  allow: ParsedList;
  scripts: Set<ScriptName> | null;
}

/** What the plugin decided about a submission, until the late handler records it. */
interface Judgement {
  decision: Decision;
  scored: Scored;
  sub: Submission;
  fingerprint: string | null;
  ipHash: string;
}

/** Fields never stored: the plugin's own and those of captchas. */
const SECRET_FIELDS = /^(cl_as|cl-captcha|cf-turnstile|g-recaptcha|h-captcha|password$|current$)/i;
/** Fields of forms that are not content, hidden in the queue. */
const HIDDEN_FIELDS =
  /^(_|cl_as|cl-captcha|cf-turnstile|g-recaptcha|h-captcha|ts$|homepage$|back$|entry$|parent$|notify$)/i;

export function storedFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let size = 0;
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_FIELDS.test(key)) continue;
    const kept =
      typeof value === 'string'
        ? value.slice(0, 10_000)
        : Array.isArray(value)
          ? value.filter((v) => typeof v === 'string').map((v: string) => v.slice(0, 2000))
          : null;
    if (kept === null) continue;
    size += key.length + JSON.stringify(kept).length;
    if (size > 64_000) break;
    out[key] = kept;
  }
  return out;
}

/** The fields worth showing in the queue. */
export function shownFields(
  fields: Record<string, unknown> | null,
): { name: string; value: string }[] {
  if (!fields) return [];
  return Object.entries(fields)
    .filter(([key]) => !HIDDEN_FIELDS.test(key))
    .map(([name, value]) => ({
      name,
      value: Array.isArray(value) ? value.join(', ') : String(value ?? ''),
    }))
    .filter((f) => f.value.trim() !== '');
}

export function spamMessage(locale: string): string {
  return locale.startsWith('it')
    ? 'Il messaggio sembra spam e non è stato inviato. Se è un errore, contattaci in un altro modo.'
    : 'Your message looks like spam and was not sent. If this is a mistake, please contact us another way.';
}

const excerpt = (text: string, max = 2000) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** Email domains with a mail server (or an address), remembered for an hour. */
function mailDomains() {
  const known = new Map<string, { ok: boolean; at: number }>();
  return async (domain: string): Promise<boolean | null> => {
    const hit = known.get(domain);
    if (hit && Date.now() - hit.at < 3600_000) return hit.ok;
    const within = <T>(p: Promise<T>) =>
      Promise.race([
        p,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
    const exists = async (lookup: () => Promise<unknown[]>) => {
      try {
        return (await within(lookup())).length > 0;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === 'ENOTFOUND' || code === 'ENODATA') return false;
        throw error;
      }
    };
    try {
      const ok =
        (await exists(() => dns.resolveMx(domain))) || (await exists(() => dns.resolve4(domain)));
      known.set(domain, { ok, at: Date.now() });
      if (known.size > 5000) known.clear();
      return ok;
    } catch {
      // The resolver did not answer: no opinion.
      return null;
    }
  };
}

/** A few token requests per address and minute: enough for people, not for floods. */
const tokenRequests = new Map<string, number[]>();
function tokenAllowed(key: string, now = Date.now()): boolean {
  const times = (tokenRequests.get(key) ?? []).filter((t) => now - t < 60_000);
  if (times.length >= 30) return false;
  times.push(now);
  tokenRequests.set(key, times);
  if (tokenRequests.size > 10_000) tokenRequests.clear();
  return true;
}

function siteStates(ctx: PluginContext) {
  const memo = new Map<string, { state: Promise<SiteState>; at: number }>();
  return {
    get(siteId: string): Promise<SiteState> {
      const known = memo.get(siteId);
      if (known && Date.now() - known.at < 10_000) return known.state;
      const state = (async () => {
        const config = normalizeConfig(await ctx.storage.get(siteId, CONFIG_KEY));
        let secret = await ctx.secrets.get(siteId, SECRET);
        if (!secret) {
          secret = newSecret();
          await ctx.secrets.set(siteId, SECRET, secret);
        }
        const locales = config.scripts === 'auto' ? (await ctx.site(siteId)).locales : [];
        return {
          config,
          keys: deriveKeys(secret),
          block: parseList(config.blocklist),
          allow: parseList(config.allowlist),
          scripts: allowedScripts(config, locales),
        };
      })();
      memo.set(siteId, { state, at: Date.now() });
      if (memo.size > 1000) memo.clear();
      state.catch(() => memo.delete(siteId));
      return state;
    },
    forget(siteId: string) {
      memo.delete(siteId);
    },
  };
}

/** The plugin checks this form for this visitor. */
function checks(config: AntispamConfig, input: { form: string; signedIn: boolean }): boolean {
  if (input.signedIn && config.skipSignedIn) return false;
  const group = formGroup(input.form);
  return group !== null && config.forms[group];
}

const field = (fields: Record<string, unknown>, name: string): string => {
  const value = fields[name];
  const text = Array.isArray(value) ? value.find((v) => typeof v === 'string') : value;
  return typeof text === 'string' ? text : '';
};

export default definePlugin({
  setup(ctx) {
    const states = siteStates(ctx);
    const hasMail = mailDomains();
    const judgements = new WeakMap<FormVerifyContext, Judgement>();
    /** Spam comments about to be created by the core, by text: their notes for the queue. */
    const pendingComments = new Map<string, { item: Omit<NewQueueItem, 'kind'>; at: number }>();

    async function judge(state: SiteState, context: FormVerifyContext): Promise<Judgement | null> {
      const { config, keys } = state;
      const sub = extract(context.fields);
      if (allowlisted(state.allow, sub, context.ip)) return null;
      const marked = field(context.fields, MARKER_FIELD) === '1';
      const token: TokenState =
        !marked && !alwaysMarked(context.form)
          ? 'unmarked'
          : checkToken(keys, field(context.fields, TOKEN_FIELD), config.minSeconds);
      const normalized = config.fingerprints ? fingerprintText(sub.text) : '';
      const fingerprint = normalized ? textHash(keys, normalized) : null;
      const sender = ipHash(keys, context.ip);
      const domain = sub.email.split('@')[1] ?? '';
      const [known, past, mx] = await Promise.all([
        fingerprint ? textFacts(ctx.db, context.siteId, fingerprint) : null,
        config.senders ? senderSpam(ctx.db, context.siteId, sender, config.retentionDays) : 0,
        config.checkMx && domain ? hasMail(domain) : null,
      ]);
      const scored = score(
        sub,
        {
          honeypot: field(context.fields, HONEYPOT_FIELD).trim() !== '',
          token,
          scripts: scriptPoints(`${sub.text}\n${sub.author}`, state.scripts),
          // This time included.
          fingerprint: known ? { ...known, seen: known.seen + 1 } : null,
          senderSpam: past,
          mx,
          blocklisted: blocklistHit(state.block, sub, context.ip),
        },
        config,
      );
      return {
        decision: decide(scored, config.thresholds),
        scored,
        sub,
        fingerprint,
        ipHash: sender,
      };
    }

    ctx.hooks.filter(
      'form.challenge',
      async (html, context) => {
        const state = await states.get(context.siteId);
        if (!checks(state.config, context)) return html;
        return html + challengeHtml(context, ctx.assets.url('antispam.js'));
      },
      { priority: EARLY },
    );

    ctx.hooks.filter(
      'form.verify',
      async (result, context): Promise<FormVerifyResult | null> => {
        // Another plugin refused it already.
        if (result && !result.ok) return result;
        try {
          const state = await states.get(context.siteId);
          if (!checks(state.config, context)) return result;
          const judgement = await judge(state, context);
          if (!judgement) return result;
          judgements.set(context, judgement);
          const message = spamMessage(context.locale);
          switch (judgement.decision) {
            case 'accept':
              return result;
            case 'challenge':
              return { ...(result ?? { ok: true }), ok: true, challenge: true };
            case 'doubtful':
              return { ok: true, spam: true, challenge: true, message };
            case 'spam':
              return { ok: true, spam: true, message };
            case 'reject':
              return { ok: false, silent: true, message };
          }
        } catch (error) {
          // A failing check never stops people.
          ctx.log.error('Check failed', { error: String(error), form: context.form });
          return result;
        }
      },
      { priority: EARLY },
    );

    // What became of the submission, once the captcha plugins spoke.
    ctx.hooks.filter(
      'form.verify',
      async (result, context) => {
        const judgement = judgements.get(context);
        if (!judgement) return result;
        judgements.delete(context);
        try {
          await record(context, judgement, result);
        } catch (error) {
          ctx.log.error('Not recorded', { error: String(error) });
        }
        return result;
      },
      { priority: LATE },
    );

    async function record(
      context: FormVerifyContext,
      judgement: Judgement,
      result: FormVerifyResult | null,
    ): Promise<void> {
      const { decision, scored } = judgement;
      // A text counts once it was taken: a retry with the captcha solved is not a repeat.
      const askedChallenge = result !== null && !result.ok && result.challenge === true;
      if (judgement.fingerprint && !askedChallenge)
        await sawText(ctx.db, context.siteId, judgement.fingerprint);
      if (decision === 'accept') return;
      const state = await states.get(context.siteId);
      let outcome: Outcome;
      if (result && !result.ok) {
        if (result.silent) outcome = 'rejected';
        else if (result.challenge) outcome = 'challenged';
        // Refused by a captcha for its own reasons: not ours to count.
        else return;
      } else if (result?.spam) outcome = context.hold ? 'held' : 'refused';
      else return; // Passed: the captcha said it is a person, or no JavaScript and nothing else.

      await count(ctx.db, context.siteId, outcome, scored.reasons);
      if (decision === 'spam' || decision === 'reject') {
        await learn(
          ctx.db,
          context.siteId,
          {
            // Texts of obvious bots become known spam; others wait for a person's decision.
            fingerprint: decision === 'reject' ? judgement.fingerprint : null,
            ipHash: state.config.senders ? judgement.ipHash : null,
          },
          'spam',
        );
      }
      if (outcome !== 'held' && outcome !== 'refused') return;
      const item = {
        form: context.form,
        locale: context.locale,
        summary: {
          author: judgement.sub.author,
          email: judgement.sub.email,
          text: excerpt(judgement.sub.text),
        },
        score: scored.score,
        reasons: scored.reasons,
        ipHash: judgement.ipHash,
        fingerprint: judgement.fingerprint,
      };
      if (outcome === 'held' && context.form === 'core/comment') {
        // The core creates the spam comment next: its id comes with `comment.created`.
        const key = `${context.siteId}|${normalizeText(field(context.fields, 'comment'))}`;
        for (const [k, v] of pendingComments)
          if (Date.now() - v.at > 60_000) pendingComments.delete(k);
        pendingComments.set(key, { item, at: Date.now() });
        return;
      }
      await enqueue(ctx.db, context.siteId, {
        ...item,
        kind: outcome === 'held' ? 'form' : 'refused',
        fields: storedFields(context.fields),
      });
    }

    ctx.hooks.on('comment.created', async ({ comment }, { siteId }) => {
      if (comment.status !== 'spam') return;
      const key = `${siteId}|${normalizeText(comment.content)}`;
      const item = pendingComments.get(key)?.item;
      if (!item) return;
      pendingComments.delete(key);
      await enqueue(ctx.db, siteId, {
        ...item,
        kind: 'comment',
        ref: comment.id,
        summary: { ...item.summary, author: comment.authorName, email: comment.authorEmail },
      });
    });

    // Decisions taken in Comments (or here) teach the filter.
    ctx.hooks.on('comment.status', async ({ comment, from }, { siteId }) => {
      const toSpam = comment.status === 'spam' && from !== 'spam';
      const fromSpam =
        from === 'spam' && (comment.status === 'approved' || comment.status === 'pending');
      if (!toSpam && !fromSpam) return;
      const state = await states.get(siteId);
      const normalized = fingerprintText(comment.content);
      const [row] = await rowsByRef(ctx.db, siteId, [comment.id]);
      await learn(
        ctx.db,
        siteId,
        {
          fingerprint: normalized ? textHash(state.keys, normalized) : null,
          ipHash: row?.ipHash ?? null,
        },
        toSpam ? 'spam' : 'ham',
      );
      if (fromSpam && row) await removeRows(ctx.db, siteId, [row.id]);
    });

    // The time token, asked by the script when the visitor starts filling a form.
    ctx.routes.public({
      method: 'GET',
      path: TOKEN_PATH,
      async handler(request) {
        const noStore = { 'cache-control': 'no-store, private' };
        if (!tokenAllowed(`${request.siteId}|${request.ip}`))
          return { status: 429, headers: noStore, body: { message: 'Too many requests.' } };
        const state = await states.get(request.siteId);
        return {
          headers: noStore,
          body: { token: makeToken(state.keys), wait: state.config.minSeconds },
        };
      },
    });

    // Every hour: the queue, senders and spam comments older than the days kept go.
    ctx.schedule.every('purge', 60, async (siteId) => {
      const { config } = await states.get(siteId);
      await purge(ctx.db, siteId, config.retentionDays);
      if (!config.purgeComments) return;
      const cutoff = Date.now() - config.retentionDays * 86_400_000;
      const old = (await ctx.comments.find(siteId, { status: 'spam', limit: 500 })).filter(
        (c) => Date.parse(c.createdAt) < cutoff,
      );
      if (old.length) await ctx.comments.remove(siteId, { ids: old.map((c) => c.id) });
    });

    // GDPR requests (Privacy plugin): what the queue holds of an email address.
    ctx.privacy.registerExporter({
      id: 'antispam',
      label: { en: 'Spam queue', it: 'Coda dello spam' },
      async export(siteId, email) {
        const rows = await rowsByEmail(ctx.db, siteId, email);
        return rows.length === 0
          ? []
          : [
              {
                id: 'antispam.queue',
                label: { en: 'Messages held as spam', it: 'Messaggi trattenuti come spam' },
                items: rows.map((r) => ({
                  form: r.form,
                  name: r.summary.author ?? '',
                  email: r.summary.email ?? '',
                  message: r.summary.text ?? '',
                  ...Object.fromEntries(shownFields(r.fields).map((f) => [f.name, f.value])),
                  received: r.createdAt.toISOString(),
                })),
              },
            ];
      },
    });
    ctx.privacy.registerEraser({
      id: 'antispam',
      label: { en: 'Spam queue', it: 'Coda dello spam' },
      async erase(siteId, email) {
        const rows = await rowsByEmail(ctx.db, siteId, email);
        await removeRows(
          ctx.db,
          siteId,
          rows.map((r) => r.id),
        );
        return { removed: rows.length, retained: 0 };
      },
    });

    // ---- Admin ------------------------------------------------------------------------

    ctx.routes.api({
      method: 'GET',
      path: '/settings',
      capability: 'manage_settings',
      async handler(request) {
        const site = await ctx.site(request.siteId);
        return {
          body: { config: (await states.get(request.siteId)).config, locales: site.locales },
        };
      },
    });
    ctx.routes.api({
      method: 'PUT',
      path: '/settings',
      capability: 'manage_settings',
      async handler(request) {
        const config = normalizeConfig((request.body as { config?: unknown } | null)?.config);
        await ctx.storage.set(request.siteId, CONFIG_KEY, config);
        states.forget(request.siteId);
        // Cached pages hold the forms' markup.
        await ctx.cache.invalidate(request.siteId, ['site']);
        const site = await ctx.site(request.siteId);
        return { body: { config, locales: site.locales } };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/queue',
      capability: 'moderate_comments',
      async handler(request) {
        const siteId = request.siteId;
        const [spamComments, rows] = await Promise.all([
          ctx.comments.find(siteId, { status: 'spam', limit: 200 }),
          queueRows(ctx.db, siteId),
        ]);
        const byRef = new Map(rows.filter((r) => r.kind === 'comment').map((r) => [r.ref, r]));
        const items: QueueItem[] = [
          ...spamComments.map((c): QueueItem => {
            const row = byRef.get(c.id);
            return {
              id: `c:${c.id}`,
              kind: 'comment',
              form: c.type === 'comment' ? 'core/comment' : c.type,
              createdAt: c.createdAt,
              author: c.authorName,
              email: row?.summary.email ?? '',
              text: c.content,
              fields: [],
              score: row ? row.score : null,
              reasons: row?.reasons ?? [],
              deliverable: true,
            };
          }),
          ...rows
            .filter((r) => r.kind !== 'comment')
            .map((r): QueueItem => ({
              id: `q:${r.id}`,
              kind: r.kind === 'form' ? 'form' : 'refused',
              form: r.form,
              createdAt: r.createdAt.toISOString(),
              author: r.summary.author ?? '',
              email: r.summary.email ?? '',
              text: r.summary.text ?? '',
              fields: shownFields(r.fields),
              score: r.score,
              reasons: r.reasons,
              deliverable: r.kind === 'form',
            })),
        ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return { body: { items } };
      },
    });

    /** `c:<id>` and `q:<id>` of a request, sorted by kind. */
    const idsOf = (body: unknown) => {
      const ids = Array.isArray((body as { ids?: unknown } | null)?.ids)
        ? ((body as { ids: unknown[] }).ids.filter((v) => typeof v === 'string') as string[])
        : [];
      const uuid = /^[0-9a-f-]{36}$/i;
      const pick = (prefix: string) =>
        ids
          .filter((id) => id.startsWith(prefix) && uuid.test(id.slice(2)))
          .map((id) => id.slice(2))
          .slice(0, 500);
      return { comments: pick('c:'), rows: pick('q:') };
    };

    ctx.routes.api({
      method: 'POST',
      path: '/queue/not-spam',
      capability: 'moderate_comments',
      async handler(request) {
        const { comments: commentIds, rows: rowIds } = idsOf(request.body);
        const userId = request.user?.id;
        let done = 0;
        if (commentIds.length)
          // Learning and the queue's notes follow with `comment.status`.
          done += await ctx.comments.setStatus(request.siteId, {
            ids: commentIds,
            status: 'approved',
            origin: request.origin,
            ...(userId ? { userId } : {}),
          });
        const failed: string[] = [];
        for (const row of await rowsById(ctx.db, request.siteId, rowIds)) {
          try {
            if (row.kind === 'form')
              await ctx.forms.release({
                siteId: request.siteId,
                form: row.form,
                locale: row.locale,
                fields: row.fields ?? {},
              });
            await learn(ctx.db, request.siteId, row, 'ham');
            await removeRows(ctx.db, request.siteId, [row.id]);
            done++;
          } catch (error) {
            ctx.log.error('Not released', { error: String(error), form: row.form });
            failed.push(`q:${row.id}`);
          }
        }
        return { body: { done, failed } };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/queue/spam',
      capability: 'moderate_comments',
      async handler(request) {
        const { comments: commentIds, rows: rowIds } = idsOf(request.body);
        const state = await states.get(request.siteId);
        const userId = request.user?.id;
        let done = 0;
        if (commentIds.length) {
          const found = (
            await ctx.comments.find(request.siteId, { status: 'spam', limit: 1000 })
          ).filter((c) => commentIds.includes(c.id));
          const notes = await rowsByRef(ctx.db, request.siteId, commentIds);
          for (const c of found) {
            const normalized = fingerprintText(c.content);
            await learn(
              ctx.db,
              request.siteId,
              {
                fingerprint: normalized ? textHash(state.keys, normalized) : null,
                ipHash: notes.find((n) => n.ref === c.id)?.ipHash ?? null,
              },
              'spam',
            );
          }
          done += await ctx.comments.remove(request.siteId, {
            ids: found.map((c) => c.id),
            ...(userId ? { userId } : {}),
          });
          await removeRows(
            ctx.db,
            request.siteId,
            notes.map((n) => n.id),
          );
        }
        const rows = await rowsById(ctx.db, request.siteId, rowIds);
        for (const row of rows) await learn(ctx.db, request.siteId, row, 'spam');
        await removeRows(
          ctx.db,
          request.siteId,
          rows.map((r) => r.id),
        );
        return { body: { done: done + rows.length } };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/queue/empty',
      capability: 'moderate_comments',
      async handler(request) {
        const userId = request.user?.id;
        const spam = await ctx.comments.find(request.siteId, { status: 'spam', limit: 500 });
        if (spam.length)
          await ctx.comments.remove(request.siteId, {
            ids: spam.map((c) => c.id),
            ...(userId ? { userId } : {}),
          });
        await removeAllRows(ctx.db, request.siteId);
        return { body: { ok: true } };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/stats',
      capability: 'moderate_comments',
      async handler(request) {
        const days = Math.min(Math.max(Number(request.query.days) || 30, 1), 90);
        return { body: await readStats(ctx.db, request.siteId, days) };
      },
    });
  },
});
