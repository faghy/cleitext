import type { PluginContext, RouteRequest, RouteResponse } from '@cleitext/plugin-sdk';
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { coveredProducts, EMAIL_RE, ownSecret, SEAL_KEY, SLUG_RE, source, text } from './common';
import { limiter, newToken, sha256 } from './keys';
import { maskKey, portalRole, seatsInUse, unsealKey } from './licensing';
import { latestAllowed, listReleases, packageLocation } from './packages';
import { renewalUrl } from './providers';
import { activations, downloads, licenses, portalTokens, products, type Product } from './schema';

/**
 * The customer portal (Store 1.4.0) at `/my-licenses` (and `/it/my-licenses`…):
 * a customer or an agency signs in with a link emailed to the address of
 * their licenses, then sees them, the sites using them, frees seats and
 * downloads the latest versions. No password, no account.
 */

export const PORTAL_PATH = '/my-licenses';
export const PORTAL_COOKIE = 'store_portal';
/** Sign-in links live 20 minutes and work once; sessions 7 days. */
export const LINK_TTL_MS = 20 * 60_000;
export const SESSION_TTL_MS = 7 * 86_400_000;

const signInIpLimit = limiter(5, 15 * 60_000);
const signInEmailLimit = limiter(3, 60 * 60_000);
const linkLimit = limiter(20, 15 * 60_000);
const actionLimit = limiter(60, 10 * 60_000);

const S = {
  en: {
    title: 'My licenses',
    intro:
      'Sign in with the email address of your licenses (the one you bought with, or your agency’s): we email you a link, no password needed.',
    email: 'Email address',
    send: 'Email me a sign-in link',
    sent: 'If licenses are linked to this address, we have sent it a sign-in link. It works once, for 20 minutes.',
    linkBad: 'This sign-in link is not valid any more: ask for a new one.',
    tooMany: 'Too many attempts: try again in a few minutes.',
    confirm: 'Sign in to your licenses',
    confirmHint: 'Continue to see your licenses on this browser.',
    continue: 'Continue',
    signedInAs: 'Signed in as {email}.',
    signOut: 'Sign out',
    none: 'No license is linked to this address.',
    key: 'Key',
    showKey: 'Show key',
    keyOld: 'Shown only in the purchase email.',
    seats: 'Sites',
    seatsOf: '{used} of {total}',
    seatsAny: '{used} (no limit)',
    updates: 'Updates',
    until: 'until {date}',
    ended: 'ended on {date}',
    forever: 'with no end',
    renew: 'Renew',
    revoked: 'Revoked',
    bundle: 'Bundle',
    covers: 'Valid for: {list}',
    coversAll: 'Valid for every paid product: {list}',
    managedBy: 'Managed by {email}',
    customer: 'Customer: {email}',
    sites: 'Sites using it',
    noSites: 'No site uses it yet.',
    lastSeen: 'last seen {date}',
    free: 'Free this seat',
    freeConfirm:
      'The site keeps what it installed; it gets no more updates until the key is entered again.',
    freed: 'The seat is free.',
    downloads: 'Download the latest version',
    invoices:
      'Invoices and receipts: Lemon Squeezy emails them; you also find them in your orders.',
    noVersion: 'No version of this product can be downloaded with your licenses.',
    notAllowed: 'This is not possible with your licenses.',
  },
  it: {
    title: 'Le mie licenze',
    intro:
      'Accedi con l’indirizzo email delle tue licenze (quello dell’acquisto, o della tua agenzia): ti mandiamo un link, senza password.',
    email: 'Indirizzo email',
    send: 'Mandami il link di accesso',
    sent: 'Se a questo indirizzo sono legate delle licenze, gli abbiamo mandato un link di accesso. Vale una volta, per 20 minuti.',
    linkBad: 'Questo link di accesso non vale più: chiedine uno nuovo.',
    tooMany: 'Troppi tentativi: riprova fra qualche minuto.',
    confirm: 'Accedi alle tue licenze',
    confirmHint: 'Continua per vedere le tue licenze su questo browser.',
    continue: 'Continua',
    signedInAs: 'Accesso come {email}.',
    signOut: 'Esci',
    none: 'A questo indirizzo non è legata nessuna licenza.',
    key: 'Chiave',
    showKey: 'Mostra la chiave',
    keyOld: 'Si trova solo nell’email dell’acquisto.',
    seats: 'Siti',
    seatsOf: '{used} su {total}',
    seatsAny: '{used} (senza limite)',
    updates: 'Aggiornamenti',
    until: 'fino al {date}',
    ended: 'finiti il {date}',
    forever: 'senza scadenza',
    renew: 'Rinnova',
    revoked: 'Revocata',
    bundle: 'Pacchetto',
    covers: 'Vale per: {list}',
    coversAll: 'Vale per tutti i prodotti a pagamento: {list}',
    managedBy: 'Gestita da {email}',
    customer: 'Cliente: {email}',
    sites: 'Siti che la usano',
    noSites: 'Ancora nessun sito la usa.',
    lastSeen: 'ultimo contatto {date}',
    free: 'Libera il posto',
    freeConfirm:
      'Il sito tiene ciò che ha installato; non riceve aggiornamenti finché la chiave non viene inserita di nuovo.',
    freed: 'Il posto è libero.',
    downloads: 'Scarica l’ultima versione',
    invoices:
      'Fatture e ricevute: le manda Lemon Squeezy per email; le trovi anche fra i tuoi ordini.',
    noVersion: 'Con le tue licenze non si può scaricare nessuna versione di questo prodotto.',
    notAllowed: 'Con le tue licenze non è possibile.',
  },
};

export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const fill = (s: string, values: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => escapeHtml(String(values[k] ?? '')));

/** The language prefix of the address (`/it` for `/it/my-licenses`), or ''. */
export function localePrefix(path: string, locale: string): string {
  return locale && path.startsWith(`/${locale}/`) ? `/${locale}` : '';
}

const stringsOf = (locale: string) => (locale.startsWith('it') ? S.it : S.en);
const noStore = { 'cache-control': 'private, no-store' };

export function registerPortal(ctx: PluginContext): void {
  const base = (request: RouteRequest) =>
    `${localePrefix(request.path, request.locale)}${PORTAL_PATH}`;
  const redirect = (location: string, extra: Partial<RouteResponse> = {}): RouteResponse => ({
    status: 303,
    headers: { ...noStore, location },
    ...extra,
  });
  const page = (request: RouteRequest, html: string, status = 200): RouteResponse => {
    const t = stringsOf(request.locale);
    return {
      status,
      headers: noStore,
      page: { title: t.title, html: `<div class="store-portal">${STYLE}${html}</div>` },
    };
  };

  /** The email address signed in on this browser, or null. */
  async function signedIn(request: RouteRequest): Promise<string | null> {
    const token = request.cookies[PORTAL_COOKIE];
    if (!token || token.length < 20 || token.length > 100) return null;
    const [row] = await ctx.db.transaction(request.siteId, (tx) =>
      tx
        .select({ email: portalTokens.email })
        .from(portalTokens)
        .where(
          and(
            eq(portalTokens.tokenHash, sha256(token)),
            eq(portalTokens.kind, 'session'),
            gt(portalTokens.expiresAt, new Date()),
          ),
        ),
    );
    return row?.email ?? null;
  }

  /** Licenses an address sees: those it bought and those its agency manages. */
  async function licensesOf(siteId: string, email: string) {
    return ctx.db.transaction(siteId, (tx) =>
      tx
        .select()
        .from(licenses)
        .where(
          or(
            sql`lower(${licenses.email}) = ${email}`,
            sql`lower(${licenses.ownerEmail}) = ${email}`,
          ),
        )
        .orderBy(desc(licenses.createdAt)),
    );
  }

  async function licenseFor(request: RouteRequest, email: string, id: unknown) {
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [license] = await ctx.db.transaction(request.siteId, (tx) =>
      tx.select().from(licenses).where(eq(licenses.id, id)),
    );
    if (!license) return null;
    const role = portalRole(license, email);
    return role ? { license, role } : null;
  }

  async function dashboard(
    request: RouteRequest,
    email: string,
    notice: { revealed?: { id: string; key: string }; message?: string } = {},
  ): Promise<RouteResponse> {
    const t = stringsOf(request.locale);
    const locale = request.locale || 'en';
    const prefix = base(request);
    const rows = await licensesOf(request.siteId, email);
    const all = await ctx.db.transaction(request.siteId, (tx) =>
      tx.select().from(products).orderBy(products.name),
    );
    const bySlug = new Map(all.map((p) => [p.slug, p]));
    const ids = rows.map((l) => l.id);
    const active = ids.length
      ? await ctx.db.transaction(request.siteId, (tx) =>
          tx
            .select()
            .from(activations)
            .where(and(inArray(activations.licenseId, ids), isNull(activations.deactivatedAt)))
            .orderBy(activations.siteOrigin),
        )
      : [];

    const cards = rows.map((license) => {
      const role = portalRole(license, email)!;
      const product = bySlug.get(license.productSlug);
      const name = escapeHtml(product?.name ?? license.productSlug);
      const covered: Product[] = product ? coveredProducts(product, all) : [];
      const mine = active.filter((a) => a.licenseId === license.id);
      const used = seatsInUse(mine);
      const now = new Date();
      const updates = license.updatesUntil
        ? fill(license.updatesUntil > now ? t.until : t.ended, {
            date: license.updatesUntil.toLocaleDateString(locale),
          })
        : escapeHtml(t.forever);
      const renew =
        product?.renewUrl && license.updatesUntil ? renewalUrl(product.renewUrl, license.id) : null;
      const revealed = notice.revealed?.id === license.id ? notice.revealed.key : null;
      const keyCell = revealed
        ? `<code class="store-portal-key">${escapeHtml(revealed)}</code>`
        : `<code>${escapeHtml(maskKey(license.keyHint))}</code>` +
          (role === 'manager' && license.keySealed
            ? ` <form method="post" action="${prefix}/reveal" class="store-portal-inline"><input type="hidden" name="license" value="${license.id}"><button type="submit">${escapeHtml(t.showKey)}</button></form>`
            : role === 'manager' && !license.keySealed
              ? ` <small>${escapeHtml(t.keyOld)}</small>`
              : '');
      const people =
        license.ownerEmail && role === 'viewer'
          ? `<p>${fill(t.managedBy, { email: license.ownerEmail })}</p>`
          : license.ownerEmail
            ? `<p>${fill(t.customer, { email: license.email })}</p>`
            : '';
      const coverage =
        product?.bundle && covered.length
          ? `<p>${fill(product.covers === null ? t.coversAll : t.covers, {
              list: covered.map((p) => p.name).join(', '),
            })}</p>`
          : '';
      const sites = [...new Set(mine.map((a) => a.siteOrigin))].map((origin) => {
        const rowsOfSite = mine.filter((a) => a.siteOrigin === origin);
        const seen = new Date(Math.max(...rowsOfSite.map((a) => a.lastSeenAt.getTime())));
        const names = [
          ...new Set(
            rowsOfSite.map((a) => {
              const slug = a.productSlug ?? license.productSlug;
              return bySlug.get(slug)?.name ?? slug;
            }),
          ),
        ];
        const free =
          role === 'manager'
            ? `<form method="post" action="${prefix}/free-seat" class="store-portal-inline"><input type="hidden" name="license" value="${license.id}"><input type="hidden" name="site" value="${escapeHtml(origin)}"><button type="submit" title="${escapeHtml(t.freeConfirm)}">${escapeHtml(t.free)}</button></form>`
            : '';
        return `<li><a href="${escapeHtml(origin)}" rel="noopener">${escapeHtml(origin)}</a> · ${escapeHtml(names.join(', '))} · <small>${fill(t.lastSeen, { date: seen.toLocaleDateString(locale) })}</small> ${free}</li>`;
      });
      const downloadable =
        license.status === 'active' ? (product?.bundle ? covered : product ? [product] : []) : [];
      return `<article class="store-portal-license">
<h2>${name}${product?.bundle ? ` <small>${escapeHtml(t.bundle)}</small>` : ''}${license.status === 'revoked' ? ` <small class="store-portal-bad">${escapeHtml(t.revoked)}</small>` : ''}</h2>
${coverage}${people}
<dl>
<dt>${escapeHtml(t.key)}</dt><dd>${keyCell}</dd>
<dt>${escapeHtml(t.seats)}</dt><dd>${license.seats === 0 ? fill(t.seatsAny, { used }) : fill(t.seatsOf, { used, total: license.seats })}</dd>
<dt>${escapeHtml(t.updates)}</dt><dd>${updates}${renew ? ` · <a href="${escapeHtml(renew)}">${escapeHtml(t.renew)}</a>` : ''}</dd>
</dl>
<h3>${escapeHtml(t.sites)}</h3>
${sites.length ? `<ul>${sites.join('')}</ul>` : `<p>${escapeHtml(t.noSites)}</p>`}
${
  downloadable.length
    ? `<h3>${escapeHtml(t.downloads)}</h3><ul>${downloadable
        .map((p) => `<li><a href="${prefix}/download/${p.slug}">${escapeHtml(p.name)}</a></li>`)
        .join('')}</ul>`
    : ''
}
${license.source === 'lemonsqueezy' ? `<p><small>${escapeHtml(t.invoices)} <a href="https://app.lemonsqueezy.com/my-orders" rel="noopener">app.lemonsqueezy.com/my-orders</a></small></p>` : ''}
</article>`;
    });
    const html = `<h1>${escapeHtml(t.title)}</h1>
${notice.message ? `<p class="store-portal-notice" role="status">${escapeHtml(notice.message)}</p>` : ''}
<div>${fill(t.signedInAs, { email })} <form method="post" action="${prefix}/sign-out" class="store-portal-inline"><button type="submit">${escapeHtml(t.signOut)}</button></form></div>
${cards.length ? cards.join('\n') : `<p>${escapeHtml(t.none)}</p>`}`;
    return page(request, html);
  }

  function signInPage(request: RouteRequest, message = '', status = 200): RouteResponse {
    const t = stringsOf(request.locale);
    return page(
      request,
      `<h1>${escapeHtml(t.title)}</h1>
${message ? `<p class="store-portal-notice" role="status">${escapeHtml(message)}</p>` : ''}
<p>${escapeHtml(t.intro)}</p>
<form method="post" action="${base(request)}/sign-in">
<label>${escapeHtml(t.email)}<br><input type="email" name="email" required autocomplete="email" maxlength="200"></label>
<p><button type="submit">${escapeHtml(t.send)}</button></p>
</form>`,
      status,
    );
  }

  ctx.routes.public({
    method: 'GET',
    path: PORTAL_PATH,
    async handler(request) {
      const t = stringsOf(request.locale);
      const email = await signedIn(request);
      if (!email) {
        const message =
          request.query.sent === '1'
            ? t.sent
            : request.query.error === 'link'
              ? t.linkBad
              : request.query.error === 'limit'
                ? t.tooMany
                : '';
        return signInPage(request, message);
      }
      return dashboard(request, email, {
        message:
          request.query.freed === '1'
            ? t.freed
            : request.query.error === 'download'
              ? t.noVersion
              : request.query.error === 'denied'
                ? t.notAllowed
                : '',
      });
    },
  });

  ctx.routes.public({
    method: 'POST',
    path: `${PORTAL_PATH}/sign-in`,
    async handler(request) {
      const email = text((request.body as { email?: unknown })?.email, 200).toLowerCase();
      if (!signInIpLimit(request.ip)) return redirect(`${base(request)}?error=limit`);
      // The same answer whatever the address: nobody learns who has licenses.
      const done = redirect(`${base(request)}?sent=1`);
      if (!EMAIL_RE.test(email) || !signInEmailLimit(email)) return done;
      const known = (await licensesOf(request.siteId, email)).length > 0;
      if (!known) return done;
      const token = newToken();
      await ctx.db.transaction(request.siteId, async (tx) => {
        await tx.delete(portalTokens).where(lt(portalTokens.expiresAt, new Date()));
        await tx.insert(portalTokens).values({
          siteId: request.siteId,
          tokenHash: sha256(token),
          email,
          kind: 'link',
          expiresAt: new Date(Date.now() + LINK_TTL_MS),
        });
      });
      const link = `${request.origin}${base(request)}/link?t=${token}`;
      const it = request.locale.startsWith('it');
      // Not awaited: the answer takes as long with or without licenses.
      void ctx.mail
        .send({
          siteId: request.siteId,
          to: email,
          subject: it ? 'Accedi alle tue licenze' : 'Sign in to your licenses',
          text: (it
            ? [
                'Per vedere le tue licenze, apri questo link (vale una volta, per 20 minuti):',
                '',
                link,
                '',
                'Se non l’hai chiesto tu, ignora questa email.',
              ]
            : [
                'To see your licenses, open this link (it works once, for 20 minutes):',
                '',
                link,
                '',
                'If you did not ask for it, ignore this email.',
              ]
          ).join('\n'),
        })
        .catch((error: unknown) =>
          ctx.log.error('Portal sign-in email not sent', { error: String(error) }),
        );
      return done;
    },
  });

  // Opening the link only shows a button: mail scanners that follow links
  // do not use it up.
  ctx.routes.public({
    method: 'GET',
    path: `${PORTAL_PATH}/link`,
    handler(request) {
      const t = stringsOf(request.locale);
      const token = text(request.query.t, 100);
      return page(
        request,
        `<h1>${escapeHtml(t.confirm)}</h1>
<p>${escapeHtml(t.confirmHint)}</p>
<form method="post" action="${base(request)}/link">
<input type="hidden" name="t" value="${escapeHtml(token)}">
<p><button type="submit">${escapeHtml(t.continue)}</button></p>
</form>`,
      );
    },
  });

  ctx.routes.public({
    method: 'POST',
    path: `${PORTAL_PATH}/link`,
    async handler(request) {
      if (!linkLimit(request.ip)) return redirect(`${base(request)}?error=limit`);
      const token = text((request.body as { t?: unknown })?.t, 100);
      if (token.length < 20) return redirect(`${base(request)}?error=link`);
      const session = newToken();
      const email = await ctx.db.transaction(request.siteId, async (tx) => {
        // Used once: the update claims it.
        const [link] = await tx
          .update(portalTokens)
          .set({ usedAt: new Date() })
          .where(
            and(
              eq(portalTokens.tokenHash, sha256(token)),
              eq(portalTokens.kind, 'link'),
              isNull(portalTokens.usedAt),
              gt(portalTokens.expiresAt, new Date()),
            ),
          )
          .returning({ email: portalTokens.email });
        if (!link) return null;
        await tx.insert(portalTokens).values({
          siteId: request.siteId,
          tokenHash: sha256(session),
          email: link.email,
          kind: 'session',
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        });
        return link.email;
      });
      if (!email) return redirect(`${base(request)}?error=link`);
      return redirect(base(request), {
        cookies: [
          { name: PORTAL_COOKIE, value: session, maxAge: Math.floor(SESSION_TTL_MS / 1000) },
        ],
      });
    },
  });

  ctx.routes.public({
    method: 'POST',
    path: `${PORTAL_PATH}/sign-out`,
    async handler(request) {
      const token = request.cookies[PORTAL_COOKIE];
      if (token) {
        await ctx.db.transaction(request.siteId, (tx) =>
          tx.delete(portalTokens).where(eq(portalTokens.tokenHash, sha256(token))),
        );
      }
      return redirect(base(request), { cookies: [{ name: PORTAL_COOKIE, value: '', maxAge: 0 }] });
    },
  });

  ctx.routes.public({
    method: 'POST',
    path: `${PORTAL_PATH}/reveal`,
    async handler(request) {
      const email = await signedIn(request);
      if (!email) return redirect(base(request));
      if (!actionLimit(request.ip)) return redirect(`${base(request)}?error=limit`);
      const found = await licenseFor(
        request,
        email,
        (request.body as { license?: unknown })?.license,
      );
      if (!found || found.role !== 'manager') return redirect(`${base(request)}?error=denied`);
      const key = unsealKey(
        await ownSecret(ctx, request.siteId, SEAL_KEY),
        found.license.keySealed,
      );
      if (!key) return redirect(`${base(request)}?error=denied`);
      const shown = key.replace(/(.{5})(?=.)/g, '$1-');
      return dashboard(request, email, { revealed: { id: found.license.id, key: shown } });
    },
  });

  ctx.routes.public({
    method: 'POST',
    path: `${PORTAL_PATH}/free-seat`,
    async handler(request) {
      const email = await signedIn(request);
      if (!email) return redirect(base(request));
      if (!actionLimit(request.ip)) return redirect(`${base(request)}?error=limit`);
      const body = (request.body ?? {}) as { license?: unknown; site?: unknown };
      const found = await licenseFor(request, email, body.license);
      if (!found || found.role !== 'manager') return redirect(`${base(request)}?error=denied`);
      const site = text(body.site, 200);
      // The seat is the site: every product it activated with this license is freed.
      await ctx.db.transaction(request.siteId, (tx) =>
        tx
          .update(activations)
          .set({ deactivatedAt: new Date() })
          .where(
            and(
              eq(activations.licenseId, found.license.id),
              eq(activations.siteOrigin, site),
              isNull(activations.deactivatedAt),
            ),
          ),
      );
      ctx.log.info('Seat freed from the portal', { license: found.license.id, site });
      return redirect(`${base(request)}?freed=1`);
    },
  });

  ctx.routes.public({
    method: 'GET',
    path: `${PORTAL_PATH}/download/:slug`,
    async handler(request) {
      const email = await signedIn(request);
      if (!email) return redirect(base(request));
      if (!actionLimit(request.ip)) return redirect(`${base(request)}?error=limit`);
      const slug = request.params.slug ?? '';
      if (!SLUG_RE.test(slug)) return redirect(`${base(request)}?error=denied`);
      const all = await ctx.db.transaction(request.siteId, (tx) => tx.select().from(products));
      const bySlug = new Map(all.map((p) => [p.slug, p]));
      // The license of this address that covers the product with the longest updates.
      const usable = (await licensesOf(request.siteId, email)).filter((l) => {
        const product = bySlug.get(l.productSlug);
        return (
          l.status === 'active' &&
          product !== undefined &&
          coveredProducts(product, all).some((p) => p.slug === slug)
        );
      });
      if (usable.length === 0) return redirect(`${base(request)}?error=denied`);
      const best = usable.reduce((a, b) =>
        a.updatesUntil === null || (b.updatesUntil !== null && a.updatesUntil >= b.updatesUntil)
          ? a
          : b,
      );
      const packages = await source(ctx, request.siteId);
      if (!packages) return redirect(`${base(request)}?error=download`);
      let release;
      try {
        release = latestAllowed(await listReleases(packages, slug), best.updatesUntil);
      } catch (error) {
        ctx.log.error('Release list failed', { slug, error: String(error) });
        return redirect(`${base(request)}?error=download`);
      }
      if (!release) return redirect(`${base(request)}?error=download`);
      await ctx.db.transaction(request.siteId, (tx) =>
        tx.insert(downloads).values({
          siteId: request.siteId,
          productSlug: slug,
          version: release.version,
          licenseId: best.id,
          siteOrigin: null,
          ip: request.ip,
        }),
      );
      const location = await packageLocation(packages, release.assetUrl);
      if ('redirect' in location) {
        return { status: 302, headers: { ...noStore, location: location.redirect } };
      }
      return {
        body: location.data,
        contentType: 'application/zip',
        headers: {
          ...noStore,
          'content-disposition': `attachment; filename="cleitext-${slug}-${release.version}.zip"`,
        },
      };
    },
  });
}

const STYLE = `<style>
.store-portal-license{border:1px solid currentColor;border-radius:.5rem;padding:1rem 1.25rem;margin:1.5rem 0}
.store-portal-license dl{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem}
.store-portal-license dd{margin:0}
.store-portal-inline{display:inline}
.store-portal-key{user-select:all;font-weight:600}
.store-portal-notice{padding:.75rem 1rem;border-left:4px solid currentColor}
.store-portal-bad{color:#b91c1c}
</style>`;
