import {
  definePlugin,
  type PluginContext,
  type RouteRequest,
  type RouteResponse,
} from '@cleitext/plugin-sdk';
import { and, count, desc, eq, gte, ilike, isNull, or, sql } from 'drizzle-orm';
import {
  addMonths,
  isKey,
  keyHash,
  keyHint,
  limiter,
  newKey,
  newToken,
  normalizeKey,
  sha256,
  signDownload,
  verifyDownload,
} from './keys';
import { findRelease, packageLocation, type PackageSource } from './packages';
import { parseLemonSqueezy, renewalUrl, verifyLemonSqueezy, type OrderEvent } from './providers';
import {
  activations,
  downloads,
  installs,
  licenses,
  products,
  variants,
  type License,
  type Product,
} from './schema';

/**
 * Store (official plugin): the license server of paid catalog themes
 * (RF-CAT-03). Sites call `…/api/v1/ext/store/v1/{activate,deactivate,status,
 * download-token}`; Lemon Squeezy calls `…/v1/webhooks/lemonsqueezy`. Keys are
 * kept as SHA-256 only, activations as SHA-256 of their token.
 */

const GITHUB_TOKEN = 'githubToken';
const LEMON_SECRET = 'lemonSqueezySecret';
const SIGNING_KEY = 'downloadSigningKey';
const SECRETS = [GITHUB_TOKEN, LEMON_SECRET] as const;

const SLUG_RE = /^[a-z][a-z0-9-]{1,39}$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const activateLimit = limiter(10, 10 * 60_000);
const tokenLimit = limiter(60, 10 * 60_000);
const demoLimit = limiter(10, 60 * 60_000);
const reportLimit = limiter(60, 60 * 60_000);

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const fail = (status: number, message: string, extra: Record<string, unknown> = {}) => ({
  status,
  body: { message, ...extra },
});
const iso = (date: Date | null) => (date ? date.toISOString() : null);

async function source(ctx: PluginContext, siteId: string): Promise<PackageSource | null> {
  const s = await ctx.settings.get(siteId);
  const repo = text(s.github_repo, 200);
  const token = await ctx.secrets.get(siteId, GITHUB_TOKEN);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) return null;
  const api = text(s.github_api, 200).replace(/\/+$/, '') || 'https://api.github.com';
  return { api, repo, token };
}

/** The key the download addresses are signed with, made on first use. */
async function signingKey(ctx: PluginContext, siteId: string): Promise<string> {
  let key = await ctx.secrets.get(siteId, SIGNING_KEY);
  if (!key) {
    key = newToken();
    await ctx.secrets.set(siteId, SIGNING_KEY, key);
  }
  return key;
}

async function seatsUsed(ctx: PluginContext, siteId: string, licenseId: string) {
  const [row] = await ctx.db.transaction(siteId, (tx) =>
    tx
      .select({ n: count() })
      .from(activations)
      .where(and(eq(activations.licenseId, licenseId), isNull(activations.deactivatedAt))),
  );
  return row?.n ?? 0;
}

async function productOf(ctx: PluginContext, siteId: string, slug: string) {
  const [product] = await ctx.db.transaction(siteId, (tx) =>
    tx.select().from(products).where(eq(products.slug, slug)),
  );
  return product ?? null;
}

/** What sites are told about a license. */
async function licenseAnswer(ctx: PluginContext, siteId: string, license: License) {
  const product = await productOf(ctx, siteId, license.productSlug);
  return {
    updatesUntil: iso(license.updatesUntil),
    seats: { used: await seatsUsed(ctx, siteId, license.id), total: license.seats },
    renewUrl: renewalUrl(product?.renewUrl ?? null, license.id),
  };
}

/** The active activation of a token, with its license. */
async function activationOf(ctx: PluginContext, siteId: string, token: unknown) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 200) return null;
  const [row] = await ctx.db.transaction(siteId, async (tx) => {
    const found = await tx
      .select({ activation: activations, license: licenses })
      .from(activations)
      .innerJoin(licenses, eq(licenses.id, activations.licenseId))
      .where(and(eq(activations.tokenHash, sha256(token)), isNull(activations.deactivatedAt)));
    if (found[0]) {
      await tx
        .update(activations)
        .set({ lastSeenAt: new Date() })
        .where(eq(activations.id, found[0].activation.id));
    }
    return found;
  });
  return row ?? null;
}

/** Creates a license and returns its key, shown once. */
async function createLicense(
  ctx: PluginContext,
  siteId: string,
  input: {
    productSlug: string;
    email: string;
    seats: number;
    months: number | null;
    source: string;
    orderRef?: string | null;
    note?: string | null;
  },
): Promise<{ license: License; key: string }> {
  const key = newKey();
  const [license] = await ctx.db.transaction(siteId, (tx) =>
    tx
      .insert(licenses)
      .values({
        siteId,
        keyHash: keyHash(key),
        keyHint: keyHint(key),
        productSlug: input.productSlug,
        email: input.email,
        seats: input.seats,
        updatesUntil: input.months === null ? null : addMonths(new Date(), input.months),
        source: input.source,
        orderRef: input.orderRef ?? null,
        note: input.note ?? null,
      })
      .returning(),
  );
  return { license: license!, key };
}

async function emailKey(
  ctx: PluginContext,
  siteId: string,
  product: Product,
  license: License,
  key: string,
): Promise<void> {
  const until = license.updatesUntil ? license.updatesUntil.toISOString().slice(0, 10) : null;
  const seats = license.seats === 0 ? 'any number of' : String(license.seats);
  const posti = license.seats === 0 ? 'quanti vuoi' : String(license.seats);
  await ctx.mail.send({
    siteId,
    to: license.email,
    subject: `${product.name}: your license key / la tua chiave di licenza`,
    text: [
      `Thank you for buying ${product.name}.`,
      '',
      `License key: ${key}`,
      '',
      `In Cleitext: Appearance → Themes → ${product.name} → Enter license key, then Activate.`,
      `The key works on ${seats} site(s)${until ? `; updates are included until ${until}` : ''}.`,
      'The theme keeps working after that: only new versions need a renewal.',
      '',
      '---',
      '',
      `Grazie per aver acquistato ${product.name}.`,
      '',
      `Chiave di licenza: ${key}`,
      '',
      `In Cleitext: Aspetto → Temi → ${product.name} → Inserisci la chiave di licenza, poi Attiva.`,
      `La chiave vale per ${posti} siti${until ? `; gli aggiornamenti sono inclusi fino al ${until}` : ''}.`,
      'Dopo, il tema continua a funzionare: serve un rinnovo solo per le nuove versioni.',
    ].join('\n'),
  });
}

/** A paid order, a refund or a renewal from the payment provider. */
async function handleOrder(ctx: PluginContext, siteId: string, order: OrderEvent) {
  if (order.kind === 'ignored' || !order.orderRef) return { body: { ok: true, ignored: true } };
  if (order.kind === 'refunded') {
    const revoked = await ctx.db.transaction(siteId, (tx) =>
      tx
        .update(licenses)
        .set({ status: 'revoked' })
        .where(and(eq(licenses.source, order.provider), eq(licenses.orderRef, order.orderRef)))
        .returning({ id: licenses.id }),
    );
    ctx.log.info('Order refunded', { order: order.orderRef, licenses: revoked.length });
    return { body: { ok: true, revoked: revoked.length } };
  }
  const [variant] = await ctx.db.transaction(siteId, (tx) =>
    tx
      .select()
      .from(variants)
      .where(and(eq(variants.provider, order.provider), eq(variants.variantId, order.variantId))),
  );
  // Not ours (another product sold with the same account): acknowledged, nothing done.
  if (!variant) return { body: { ok: true, ignored: true } };
  const product = await productOf(ctx, siteId, variant.productSlug);
  if (!product) return { body: { ok: true, ignored: true } };

  if (variant.kind === 'renewal') {
    if (!order.licenseId) {
      ctx.log.warn('Renewal without a license id', { order: order.orderRef });
      return { body: { ok: true, ignored: true } };
    }
    const renewed = await ctx.db.transaction(siteId, async (tx) => {
      const [license] = await tx.select().from(licenses).where(eq(licenses.id, order.licenseId!));
      if (!license || license.updatesUntil === null) return null;
      const from = license.updatesUntil > new Date() ? license.updatesUntil : new Date();
      const [updated] = await tx
        .update(licenses)
        .set({ updatesUntil: addMonths(from, product.updatesMonths * order.quantity) })
        .where(eq(licenses.id, license.id))
        .returning();
      return updated ?? null;
    });
    return { body: { ok: true, renewed: renewed !== null } };
  }

  if (!EMAIL_RE.test(order.email)) return fail(400, 'The order has no email address.');
  const [existing] = await ctx.db.transaction(siteId, (tx) =>
    tx
      .select({ id: licenses.id })
      .from(licenses)
      .where(and(eq(licenses.source, order.provider), eq(licenses.orderRef, order.orderRef))),
  );
  // Providers retry webhooks: one license per order.
  if (existing) return { body: { ok: true, duplicate: true } };
  const { license, key } = await createLicense(ctx, siteId, {
    productSlug: product.slug,
    email: order.email,
    seats: variant.seats === 0 ? 0 : variant.seats * order.quantity,
    months: product.updatesMonths,
    source: order.provider,
    orderRef: order.orderRef,
    note: order.name || null,
  });
  await emailKey(ctx, siteId, product, license, key).catch((error: unknown) =>
    ctx.log.error('License email not sent', { license: license.id, error: String(error) }),
  );
  return { body: { ok: true, license: license.id } };
}

export default definePlugin({
  setup(ctx) {
    ctx.access.defineCapability('manage_store', {
      label: { en: 'Manage the store and licenses', it: 'Gestire lo store e le licenze' },
      roles: ['administrator'],
    });

    ctx.settings.define(
      [
        {
          name: 'github_repo',
          type: 'text',
          label: {
            en: 'Private repository of the packages',
            it: 'Repository privato dei pacchetti',
          },
          help: {
            en: 'owner/name on GitHub, where the catalog build puts paid themes (releases theme-<slug>-<version>). The token goes in Store → Settings.',
            it: 'proprietario/nome su GitHub, dove la build del catalogo mette i temi a pagamento (release theme-<slug>-<versione>). Il token va in Store → Impostazioni.',
          },
          maxLength: 200,
        },
        {
          name: 'github_api',
          type: 'text',
          label: { en: 'GitHub API address', it: 'Indirizzo dell’API di GitHub' },
          default: 'https://api.github.com',
          maxLength: 200,
        },
      ],
      { title: { en: 'Store', it: 'Store' }, capability: 'manage_store' },
    );

    // ---- License server (called by Cleitext sites) --------------------------------

    ctx.routes.api({
      method: 'POST',
      path: '/v1/activate',
      webhook: true,
      async handler(request) {
        if (!activateLimit(request.ip)) return fail(429, 'Too many attempts: try again later.');
        const body = (request.body ?? {}) as Record<string, unknown>;
        const key = text(body.key, 60);
        const slug = text(body.slug, 40);
        const origin = originOf(body.siteOrigin);
        if (!isKey(key)) return fail(400, 'This is not a valid license key.');
        if (!SLUG_RE.test(slug) || !origin) return fail(400, 'The request is not valid.');
        const [license] = await ctx.db.transaction(request.siteId, (tx) =>
          tx
            .select()
            .from(licenses)
            .where(eq(licenses.keyHash, keyHash(key))),
        );
        if (!license) return fail(404, 'Unknown license key.');
        if (license.status !== 'active') return fail(403, 'This license was revoked.');
        if (license.productSlug !== slug) {
          return fail(400, `This key is for another theme (${license.productSlug}).`);
        }
        const token = newToken();
        const outcome = await ctx.db.transaction(request.siteId, async (tx) => {
          // The same site again (e.g. a new key entry): its seat, a new token.
          const [same] = await tx
            .select({ id: activations.id })
            .from(activations)
            .where(
              and(
                eq(activations.licenseId, license.id),
                eq(activations.siteOrigin, origin),
                isNull(activations.deactivatedAt),
              ),
            );
          if (same) {
            await tx
              .update(activations)
              .set({ tokenHash: sha256(token), lastSeenAt: new Date() })
              .where(eq(activations.id, same.id));
            return 'ok';
          }
          // Serializes activations of a license, so seats are never exceeded.
          await tx.execute(
            sql`select 1 from ${licenses} where ${licenses.id} = ${license.id} for update`,
          );
          const [used] = await tx
            .select({ n: count() })
            .from(activations)
            .where(and(eq(activations.licenseId, license.id), isNull(activations.deactivatedAt)));
          if (license.seats > 0 && (used?.n ?? 0) >= license.seats) return 'full';
          await tx.insert(activations).values({
            siteId: request.siteId,
            licenseId: license.id,
            tokenHash: sha256(token),
            siteOrigin: origin,
            clientSiteId: text(body.siteId, 64) || null,
          });
          return 'ok';
        });
        if (outcome === 'full') {
          return fail(
            409,
            `All ${license.seats} sites of this license are in use: deactivate one first, or buy more sites.`,
          );
        }
        return {
          body: { activation: token, ...(await licenseAnswer(ctx, request.siteId, license)) },
        };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/v1/deactivate',
      webhook: true,
      async handler(request) {
        const found = await activationOf(
          ctx,
          request.siteId,
          (request.body as { activation?: unknown })?.activation,
        );
        if (found) {
          await ctx.db.transaction(request.siteId, (tx) =>
            tx
              .update(activations)
              .set({ deactivatedAt: new Date() })
              .where(eq(activations.id, found.activation.id)),
          );
        }
        return { body: { ok: true } };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/v1/status',
      webhook: true,
      async handler(request) {
        if (!tokenLimit(request.ip)) return fail(429, 'Too many requests: try again later.');
        const found = await activationOf(
          ctx,
          request.siteId,
          (request.body as { activation?: unknown })?.activation,
        );
        if (!found)
          return { body: { status: 'unknown', updatesUntil: null, seats: null, renewUrl: null } };
        return {
          body: {
            status: found.license.status,
            ...(await licenseAnswer(ctx, request.siteId, found.license)),
          },
        };
      },
    });

    ctx.routes.api({
      method: 'POST',
      path: '/v1/download-token',
      webhook: true,
      async handler(request) {
        const body = (request.body ?? {}) as Record<string, unknown>;
        const slug = text(body.slug, 40);
        const version = text(body.version, 40);
        if (!SLUG_RE.test(slug) || !VERSION_RE.test(version)) {
          return fail(400, 'The request is not valid.');
        }
        const product = await productOf(ctx, request.siteId, slug);
        if (!product) return fail(404, 'This theme is not sold here.');
        const packages = await source(ctx, request.siteId);
        if (!packages) return fail(503, 'Downloads are not set up on the store yet.');

        let license: License | null = null;
        let origin: string | null = null;
        if (body.demo === true) {
          if (!product.demo)
            return fail(403, 'This theme has no demo: buy a license to download it.');
          if (!demoLimit(request.ip)) return fail(429, 'Too many demo downloads: try again later.');
          origin = originOf(body.siteOrigin);
        } else {
          if (!tokenLimit(request.ip)) return fail(429, 'Too many requests: try again later.');
          const found = await activationOf(ctx, request.siteId, body.activation);
          if (!found) return fail(403, 'This site has no active license: enter the key again.');
          license = found.license;
          origin = found.activation.siteOrigin;
          if (license.status !== 'active') return fail(403, 'This license was revoked.');
          if (license.productSlug !== slug) return fail(403, 'This license is for another theme.');
        }

        let release;
        try {
          release = await findRelease(packages, slug, version);
        } catch (error) {
          ctx.log.error('Release lookup failed', { slug, version, error: String(error) });
          return fail(503, 'The package cannot be read now: try again later.');
        }
        if (!release) return fail(404, `Version ${version} is not available.`);
        if (
          license?.updatesUntil &&
          Date.parse(release.publishedAt) > license.updatesUntil.getTime()
        ) {
          const until = license.updatesUntil.toISOString().slice(0, 10);
          return fail(
            402,
            `Updates for this license ended on ${until}: renew it to install ${version}.`,
            {
              updatesUntil: license.updatesUntil.toISOString(),
              renewUrl: renewalUrl(product.renewUrl, license.id),
            },
          );
        }
        await ctx.db.transaction(request.siteId, (tx) =>
          tx.insert(downloads).values({
            siteId: request.siteId,
            productSlug: slug,
            version,
            licenseId: license?.id ?? null,
            siteOrigin: origin,
            ip: request.ip,
          }),
        );
        const url = signDownload(await signingKey(ctx, request.siteId), {
          slug,
          version,
          ref: license?.id ?? 'demo',
        });
        return { body: { url, updatesUntil: iso(license?.updatesUntil ?? null) } };
      },
    });

    ctx.routes.api({
      method: 'GET',
      path: '/v1/download/:slug/:version',
      webhook: true,
      async handler(request) {
        const { slug = '', version = '' } = request.params;
        const valid = verifyDownload(await signingKey(ctx, request.siteId), {
          slug,
          version,
          ref: request.query.ref ?? '',
          exp: request.query.exp ?? '',
          sig: request.query.sig ?? '',
        });
        if (!valid) return fail(403, 'This download address is not valid or has expired.');
        const packages = await source(ctx, request.siteId);
        const release = packages
          ? await findRelease(packages, slug, version).catch(() => null)
          : null;
        if (!packages || !release) return fail(404, 'Not found.');
        const location = await packageLocation(packages, release.assetUrl);
        const noStore: Record<string, string> = { 'cache-control': 'no-store' };
        if ('redirect' in location) {
          return {
            status: 302,
            headers: { ...noStore, location: location.redirect },
          };
        }
        return {
          body: location.data,
          contentType: 'application/zip',
          headers: noStore,
        };
      },
    });

    // ---- Payment provider -----------------------------------------------------------

    ctx.routes.api({
      method: 'POST',
      path: '/v1/webhooks/lemonsqueezy',
      webhook: true,
      async handler(request) {
        const secret = await ctx.secrets.get(request.siteId, LEMON_SECRET);
        if (
          !secret ||
          !verifyLemonSqueezy(secret, request.rawBody, request.headers['x-signature'])
        ) {
          return fail(401, 'Invalid signature.');
        }
        return handleOrder(ctx, request.siteId, parseLemonSqueezy(request.body));
      },
    });

    // ---- Installation registry (reports of Cleitext sites) ----------------------------

    ctx.routes.api({
      method: 'POST',
      path: '/v1/report',
      webhook: true,
      async handler(request) {
        if (!reportLimit(request.ip)) return fail(429, 'Too many reports: try again later.');
        const report = parseReport(request.body);
        if (!report) return fail(400, 'The report is not valid.');
        const values = {
          installId: report.installId,
          coreVersion: report.core,
          themeSlug: report.theme?.slug ?? null,
          themeVersion: report.theme?.version ?? null,
          plugins: report.plugins,
          themes: report.themes,
          lastSeenAt: new Date(),
        };
        await ctx.db.transaction(request.siteId, (tx) =>
          tx
            .insert(installs)
            .values({ siteId: request.siteId, origin: report.origin, ...values })
            .onConflictDoUpdate({ target: [installs.siteId, installs.origin], set: values }),
        );
        return { status: 204 };
      },
    });

    // ---- Admin ----------------------------------------------------------------------

    const admin = (
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      path: string,
      handler: (request: RouteRequest) => Promise<RouteResponse>,
    ) => ctx.routes.api({ method, path, capability: 'manage_store', handler });

    admin('GET', '/admin/overview', async (request) => {
      const siteId = request.siteId;
      const [productRows, variantRows, recent] = await ctx.db.transaction(siteId, async (tx) => [
        await tx.select().from(products).orderBy(products.slug),
        await tx.select().from(variants).orderBy(variants.productSlug, variants.variantId),
        await tx.select().from(downloads).orderBy(desc(downloads.createdAt)).limit(50),
      ]);
      const s = await ctx.settings.get(siteId);
      return {
        body: {
          products: productRows,
          variants: variantRows,
          downloads: recent,
          repo: text(s.github_repo, 200),
          secrets: Object.fromEntries(
            await Promise.all(
              SECRETS.map(async (name) => [name, Boolean(await ctx.secrets.get(siteId, name))]),
            ),
          ),
        },
      };
    });

    admin('GET', '/admin/installs', async (request) => {
      const days = Math.min(Math.max(Number(request.query.days) || 90, 1), 3650);
      const since = new Date(Date.now() - days * 86_400_000);
      const rows = await ctx.db.transaction(request.siteId, (tx) =>
        tx.select().from(installs).where(gte(installs.lastSeenAt, since)).orderBy(installs.origin),
      );
      return { body: rows };
    });

    admin('DELETE', '/admin/installs', async (request) => {
      const origin = originOf((request.body as { origin?: unknown })?.origin);
      if (!origin) return fail(400, 'Which site?');
      await ctx.db.transaction(request.siteId, (tx) =>
        tx.delete(installs).where(eq(installs.origin, origin)),
      );
      return { body: { ok: true } };
    });

    admin('PUT', '/admin/products/:slug', async (request) => {
      const slug = request.params.slug ?? '';
      const body = (request.body ?? {}) as Record<string, unknown>;
      const name = text(body.name, 100);
      const months = Math.round(Number(body.updatesMonths));
      const renewUrl = text(body.renewUrl, 500) || null;
      if (!SLUG_RE.test(slug) || !name || !(months >= 0 && months <= 120)) {
        return fail(400, 'Slug, name and months of updates (0 for no end) are needed.');
      }
      if (renewUrl && !/^https:\/\//.test(renewUrl))
        return fail(400, 'The renewal address must use https.');
      const values = { name, updatesMonths: months, demo: body.demo !== false, renewUrl };
      await ctx.db.transaction(request.siteId, (tx) =>
        tx
          .insert(products)
          .values({ siteId: request.siteId, slug, ...values })
          .onConflictDoUpdate({ target: [products.siteId, products.slug], set: values }),
      );
      return { body: { ok: true } };
    });

    admin('DELETE', '/admin/products/:slug', async (request) => {
      const slug = request.params.slug ?? '';
      const [used] = await ctx.db.transaction(request.siteId, (tx) =>
        tx.select({ n: count() }).from(licenses).where(eq(licenses.productSlug, slug)),
      );
      if ((used?.n ?? 0) > 0) return fail(409, 'This product has licenses: it cannot be deleted.');
      await ctx.db.transaction(request.siteId, async (tx) => {
        await tx.delete(variants).where(eq(variants.productSlug, slug));
        await tx.delete(products).where(eq(products.slug, slug));
      });
      return { body: { ok: true } };
    });

    admin('PUT', '/admin/variants', async (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const variantId = text(String(body.variantId ?? ''), 60);
      const productSlug = text(body.productSlug, 40);
      const seats = Math.round(Number(body.seats));
      const kind = body.kind === 'renewal' ? 'renewal' : 'new';
      if (!/^[\w-]{1,60}$/.test(variantId) || !(seats >= 0 && seats <= 10_000)) {
        return fail(400, 'A variant id and the sites per license (0 for no limit) are needed.');
      }
      if (!(await productOf(ctx, request.siteId, productSlug)))
        return fail(400, 'Unknown product.');
      const values = { productSlug, seats, kind } as const;
      await ctx.db.transaction(request.siteId, (tx) =>
        tx
          .insert(variants)
          .values({ siteId: request.siteId, provider: 'lemonsqueezy', variantId, ...values })
          .onConflictDoUpdate({
            target: [variants.siteId, variants.provider, variants.variantId],
            set: values,
          }),
      );
      return { body: { ok: true } };
    });

    admin('DELETE', '/admin/variants/:provider/:variantId', async (request) => {
      await ctx.db.transaction(request.siteId, (tx) =>
        tx
          .delete(variants)
          .where(
            and(
              eq(variants.provider, request.params.provider ?? ''),
              eq(variants.variantId, request.params.variantId ?? ''),
            ),
          ),
      );
      return { body: { ok: true } };
    });

    admin('GET', '/admin/licenses', async (request) => {
      const q = text(request.query.q, 100);
      const rows = await ctx.db.transaction(request.siteId, (tx) => {
        // Spelled out: inside a one-table query Drizzle drops the table names.
        const used = sql<number>`(select count(*)::int from activations a where a.license_id = licenses.id and a.deactivated_at is null)`;
        const query = tx
          .select({ license: licenses, used })
          .from(licenses)
          .orderBy(desc(licenses.createdAt))
          .limit(100);
        if (!q) return query;
        const hint = normalizeKey(q).slice(-5);
        return query.where(
          or(
            ilike(licenses.email, `%${q.replace(/[%_\\]/g, '\\$&')}%`),
            eq(licenses.keyHint, hint),
            eq(licenses.orderRef, q),
            ...(isKey(q) ? [eq(licenses.keyHash, keyHash(q))] : []),
          ),
        );
      });
      return {
        body: rows.map(({ license, used }) => ({
          ...license,
          keyHash: undefined,
          used,
        })),
      };
    });

    admin('POST', '/admin/licenses', async (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const email = text(body.email, 200).toLowerCase();
      const seats = Math.round(Number(body.seats ?? 1));
      const product = await productOf(ctx, request.siteId, text(body.productSlug, 40));
      if (!product) return fail(400, 'Unknown product.');
      if (!EMAIL_RE.test(email)) return fail(400, 'An email address is needed.');
      if (!(seats >= 0 && seats <= 10_000)) return fail(400, 'Sites: 0 (no limit) to 10000.');
      const months =
        body.months === null || body.months === ''
          ? product.updatesMonths
          : Math.round(Number(body.months ?? product.updatesMonths));
      const { license, key } = await createLicense(ctx, request.siteId, {
        productSlug: product.slug,
        email,
        seats,
        months: months === 0 ? null : months,
        source: 'manual',
        note: text(body.note, 500) || null,
      });
      let mailed = false;
      if (body.send === true) {
        mailed = await emailKey(ctx, request.siteId, product, license, key)
          .then(() => true)
          .catch(() => false);
      }
      return { body: { id: license.id, key, mailed } };
    });

    admin('POST', '/admin/licenses/:id/status', async (request) => {
      const status =
        (request.body as { status?: unknown })?.status === 'revoked' ? 'revoked' : 'active';
      await ctx.db.transaction(request.siteId, (tx) =>
        tx
          .update(licenses)
          .set({ status })
          .where(eq(licenses.id, request.params.id ?? '')),
      );
      return { body: { ok: true } };
    });

    admin('POST', '/admin/licenses/:id/extend', async (request) => {
      const months = Math.round(Number((request.body as { months?: unknown })?.months));
      if (!(months >= 1 && months <= 120)) return fail(400, 'Months: 1 to 120.');
      await ctx.db.transaction(request.siteId, async (tx) => {
        const [license] = await tx
          .select()
          .from(licenses)
          .where(eq(licenses.id, request.params.id ?? ''));
        if (!license || license.updatesUntil === null) return;
        const from = license.updatesUntil > new Date() ? license.updatesUntil : new Date();
        await tx
          .update(licenses)
          .set({ updatesUntil: addMonths(from, months) })
          .where(eq(licenses.id, license.id));
      });
      return { body: { ok: true } };
    });

    admin('GET', '/admin/licenses/:id/activations', async (request) => ({
      body: await ctx.db.transaction(request.siteId, (tx) =>
        tx
          .select({
            id: activations.id,
            siteOrigin: activations.siteOrigin,
            createdAt: activations.createdAt,
            lastSeenAt: activations.lastSeenAt,
            deactivatedAt: activations.deactivatedAt,
          })
          .from(activations)
          .where(eq(activations.licenseId, request.params.id ?? ''))
          .orderBy(desc(activations.createdAt)),
      ),
    }));

    admin('POST', '/admin/activations/:id/deactivate', async (request) => {
      await ctx.db.transaction(request.siteId, (tx) =>
        tx
          .update(activations)
          .set({ deactivatedAt: new Date() })
          .where(
            and(eq(activations.id, request.params.id ?? ''), isNull(activations.deactivatedAt)),
          ),
      );
      return { body: { ok: true } };
    });

    admin('PUT', '/admin/secrets/:name', async (request) => {
      const name = request.params.name as (typeof SECRETS)[number];
      const value = text((request.body as { value?: unknown })?.value, 500);
      if (!SECRETS.includes(name)) return fail(404, 'Unknown secret.');
      if (value.length < 8) return fail(400, 'This value is too short.');
      await ctx.secrets.set(request.siteId, name, value);
      return { body: { ok: true } };
    });

    admin('DELETE', '/admin/secrets/:name', async (request) => {
      const name = request.params.name as (typeof SECRETS)[number];
      if (!SECRETS.includes(name)) return fail(404, 'Unknown secret.');
      await ctx.secrets.delete(request.siteId, name);
      return { body: { ok: true } };
    });
  },
});

/** `https://host[:port]` of the site a license is used on, or null. */
function originOf(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    return /^https?:$/.test(url.protocol) && url.origin.length <= 200 ? url.origin : null;
  } catch {
    return null;
  }
}

interface Report {
  installId: string;
  origin: string;
  core: string;
  theme: { slug: string; version: string } | null;
  plugins: { slug: string; version: string; active: boolean }[];
  themes: { slug: string; version: string }[];
}

/** A report as sent by Cleitext (catalog/install-report), checked field by field. */
export function parseReport(body: unknown): Report | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const installId = text(b.installId, 64);
  const origin = originOf(b.origin);
  const core = text(b.core, 40);
  if (!/^[0-9a-f-]{36}$/i.test(installId) || !origin || !VERSION_RE.test(core)) return null;
  const item = (value: unknown) => {
    const v = (value ?? {}) as Record<string, unknown>;
    const slug = text(v.slug, 40);
    const version = text(v.version, 40);
    return SLUG_RE.test(slug) && (version === '' || VERSION_RE.test(version))
      ? { slug, version, active: v.active === true }
      : null;
  };
  const list = (value: unknown, max: number) =>
    Array.isArray(value)
      ? value
          .slice(0, max)
          .map(item)
          .filter((i) => i !== null)
      : [];
  const theme = b.theme ? item(b.theme) : null;
  return {
    installId,
    origin,
    core,
    theme: theme ? { slug: theme.slug, version: theme.version } : null,
    plugins: list(b.plugins, 200),
    themes: list(b.themes, 100).map(({ slug, version }) => ({ slug, version })),
  };
}
