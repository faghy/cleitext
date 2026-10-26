import {
  definePlugin,
  type PluginContext,
  type RouteRequest,
  type RouteResponse,
} from '@cleitext/plugin-sdk';
import { and, count, desc, eq, gte, ilike, isNull, lt, or, sql } from 'drizzle-orm';
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
import { createHash } from 'node:crypto';
import {
  coveredProducts,
  EMAIL_RE,
  fail,
  GITHUB_TOKEN,
  iso,
  LEMON_SECRET,
  licenseCovers,
  ownSecret,
  productOf,
  SEAL_KEY,
  seatsUsed,
  SIGNING_KEY,
  SLUG_RE,
  source,
  text,
  VERSION_RE,
} from './common';
import { isZip, latestOf, parseServerReport, safeFilename } from './downloads';
import { decideActivation, discounted, sealKey } from './licensing';
import { findRelease, packageLocation } from './packages';
import { registerPartners } from './partners-admin';
import { registerPortal } from './portal';
import { parseLemonSqueezy, renewalUrl, verifyLemonSqueezy, type OrderEvent } from './providers';
import {
  activations,
  downloads,
  files,
  installs,
  licenses,
  partners,
  products,
  serverReports,
  variants,
  type License,
  type Product,
} from './schema';

/**
 * Store (official plugin): the license server of paid catalog themes
 * (RF-CAT-03). Sites call `…/api/v1/ext/store/v1/{activate,deactivate,status,
 * download-token}`; Lemon Squeezy calls `…/v1/webhooks/lemonsqueezy`. Keys are
 * kept as SHA-256 (and, since 1.4.0, encrypted for the customer portal),
 * activations as SHA-256 of their token.
 */

const SECRETS = [GITHUB_TOKEN, LEMON_SECRET] as const;

const activateLimit = limiter(10, 10 * 60_000);
const tokenLimit = limiter(60, 10 * 60_000);
const demoLimit = limiter(10, 60 * 60_000);
const reportLimit = limiter(60, 60 * 60_000);
const serverReportLimit = limiter(30, 60 * 60_000);

const signingKey = (ctx: PluginContext, siteId: string) => ownSecret(ctx, siteId, SIGNING_KEY);

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

/** Creates a license and returns its key, shown once (and in the portal). */
export async function createLicense(
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
    ownerEmail?: string | null;
    listPriceCents?: number | null;
    discountPercent?: number | null;
    priceCents?: number | null;
    currency?: string | null;
  },
): Promise<{ license: License; key: string }> {
  const key = newKey();
  const sealed = sealKey(await ownSecret(ctx, siteId, SEAL_KEY), normalizeKey(key));
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
        ownerEmail: input.ownerEmail ?? null,
        listPriceCents: input.listPriceCents ?? null,
        discountPercent: input.discountPercent ?? null,
        priceCents: input.priceCents ?? null,
        currency: input.currency ?? null,
        keySealed: sealed,
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
  // A bundle names what it covers; one site using several of them is one site.
  const covered = product.bundle
    ? coveredProducts(
        product,
        await ctx.db.transaction(siteId, (tx) => tx.select().from(products).orderBy(products.name)),
      ).map((p) => p.name)
    : [];
  const list = covered.join(', ');
  await ctx.mail.send({
    siteId,
    to: license.email,
    subject: `${product.name}: your license key / la tua chiave di licenza`,
    text: [
      `Thank you for buying ${product.name}.`,
      '',
      `License key: ${key}`,
      '',
      ...(covered.length
        ? [
            `The key is valid for: ${list}. Enter it in Cleitext for each of them (Appearance → Themes, or Plugins); a site using several counts once.`,
          ]
        : [
            `In Cleitext: Appearance → Themes → ${product.name} → Enter license key, then Activate.`,
          ]),
      `The key works on ${seats} site(s)${until ? `; updates are included until ${until}` : ''}.`,
      'The theme keeps working after that: only new versions need a renewal.',
      '',
      '---',
      '',
      `Grazie per aver acquistato ${product.name}.`,
      '',
      `Chiave di licenza: ${key}`,
      '',
      ...(covered.length
        ? [
            `La chiave vale per: ${list}. Inseriscila in Cleitext per ciascuno (Aspetto → Temi, o Plugin); un sito che ne usa più d'uno conta una volta.`,
          ]
        : [
            `In Cleitext: Aspetto → Temi → ${product.name} → Inserisci la chiave di licenza, poi Attiva.`,
          ]),
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
  // A partner's checkout (custom data `partner`): the agency manages the license.
  const [partner] = order.partner
    ? await ctx.db.transaction(siteId, (tx) =>
        tx.select().from(partners).where(eq(partners.code, order.partner!)),
      )
    : [];
  const subtotal = order.subtotalCents;
  const discount = order.discountCents ?? 0;
  const { license, key } = await createLicense(ctx, siteId, {
    productSlug: product.slug,
    email: order.email,
    seats: variant.seats === 0 ? 0 : variant.seats * order.quantity,
    months: product.updatesMonths,
    source: order.provider,
    orderRef: order.orderRef,
    note: order.name || null,
    ownerEmail: partner && partner.email !== order.email ? partner.email : null,
    listPriceCents: subtotal,
    discountPercent:
      subtotal && discount > 0 ? Math.round((discount * 100) / subtotal) : partner ? 0 : null,
    priceCents: subtotal === null ? null : Math.max(0, subtotal - discount),
    currency: order.currency,
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
        // A bundle (agency license) is valid for every product it covers.
        if (!(await licenseCovers(ctx, request.siteId, license, slug))) {
          return fail(400, `This key is for another product (${license.productSlug}).`);
        }
        const token = newToken();
        const outcome = await ctx.db.transaction(request.siteId, async (tx) => {
          // Serializes activations of a license, so seats are never exceeded.
          await tx.execute(
            sql`select 1 from ${licenses} where ${licenses.id} = ${license.id} for update`,
          );
          const active = await tx
            .select({
              id: activations.id,
              siteOrigin: activations.siteOrigin,
              productSlug: activations.productSlug,
            })
            .from(activations)
            .where(and(eq(activations.licenseId, license.id), isNull(activations.deactivatedAt)));
          // Seats are sites: a site using several products of a bundle holds one.
          const decision = decideActivation({
            active,
            licenseSlug: license.productSlug,
            origin,
            slug,
            seats: license.seats,
          });
          if (decision.kind === 'full') return 'full';
          if (decision.kind === 'reuse') {
            // The same site and product again (e.g. a new key entry): a new token.
            await tx
              .update(activations)
              .set({ tokenHash: sha256(token), lastSeenAt: new Date(), productSlug: slug })
              .where(eq(activations.id, active[decision.index]!.id));
            return 'ok';
          }
          await tx.insert(activations).values({
            siteId: request.siteId,
            licenseId: license.id,
            tokenHash: sha256(token),
            siteOrigin: origin,
            clientSiteId: text(body.siteId, 64) || null,
            productSlug: slug,
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
          if (!(await licenseCovers(ctx, request.siteId, license, slug))) {
            return fail(403, 'This license is for another product.');
          }
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
        // Development machines, test suites and private networks are not installations.
        if (!isPublicOrigin(report.origin)) return { status: 204 };
        const values = {
          installId: report.installId,
          coreVersion: report.core,
          themeSlug: report.theme?.slug ?? null,
          themeVersion: report.theme?.version ?? null,
          plugins: report.plugins,
          themes: report.themes,
          lastSeenAt: new Date(),
        };
        await ctx.db.transaction(request.siteId, async (tx) => {
          await tx
            .insert(installs)
            .values({ siteId: request.siteId, origin: report.origin, ...values })
            .onConflictDoUpdate({ target: [installs.siteId, installs.origin], set: values });
          // Sites not seen for 180 days leave the registry (data kept no longer than needed).
          await tx
            .delete(installs)
            .where(lt(installs.lastSeenAt, new Date(Date.now() - RETENTION_DAYS * 86_400_000)));
        });
        return { status: 204 };
      },
    });

    // ---- Server reports (Cleitext Toolkit for Plesk, opt-in, anonymous) -------------

    ctx.routes.api({
      method: 'POST',
      path: '/v1/server-report',
      webhook: true,
      async handler(request) {
        if (!serverReportLimit(request.ip)) return fail(429, 'Too many reports: try again later.');
        const report = parseServerReport(request.body);
        if (!report) return fail(400, 'The report is not valid.');
        if (!(await productOf(ctx, request.siteId, report.product))) {
          return fail(400, 'Unknown product.');
        }
        const key = and(
          eq(serverReports.productSlug, report.product),
          eq(serverReports.serverHash, report.server),
        );
        await ctx.db.transaction(request.siteId, async (tx) => {
          if (report.forget) {
            await tx.delete(serverReports).where(key);
          } else {
            const values = {
              productVersion: report.version,
              panel: report.panel,
              panelVersion: report.panelVersion,
              installations: report.installations,
              lastSeenAt: new Date(),
            };
            await tx
              .insert(serverReports)
              .values({
                siteId: request.siteId,
                productSlug: report.product,
                serverHash: report.server,
                ...values,
              })
              .onConflictDoUpdate({
                target: [serverReports.siteId, serverReports.productSlug, serverReports.serverHash],
                set: values,
              });
          }
          await tx
            .delete(serverReports)
            .where(
              lt(serverReports.lastSeenAt, new Date(Date.now() - RETENTION_DAYS * 86_400_000)),
            );
        });
        return { status: 204 };
      },
    });

    // ---- Public downloads (free files of a product) --------------------------------------

    const publicFiles = (siteId: string, slug: string) =>
      ctx.db.transaction(siteId, (tx) =>
        tx
          .select({
            version: files.version,
            filename: files.filename,
            sha256: files.sha256,
            size: files.size,
            createdAt: files.createdAt,
          })
          .from(files)
          .where(eq(files.productSlug, slug)),
      );

    // Registered before `/downloads/:slug/:file`, so it wins.
    ctx.routes.public({
      method: 'GET',
      path: '/downloads/:slug/latest.json',
      async handler(request) {
        const slug = request.params.slug ?? '';
        const notFound = {
          status: 404,
          body: { message: 'Nothing to download here.' },
          headers: { 'cache-control': 'no-store' },
        };
        if (!SLUG_RE.test(slug)) return notFound;
        const product = await productOf(ctx, request.siteId, slug);
        const latest = product ? latestOf(await publicFiles(request.siteId, slug)) : null;
        if (!product || !latest) return notFound;
        return {
          body: {
            slug,
            name: product.name,
            version: latest.version,
            file: latest.filename,
            url: `${request.origin}/downloads/${slug}/${latest.filename}`,
            size: latest.size,
            sha256: latest.sha256,
            publishedAt: latest.createdAt.toISOString(),
          },
          contentType: 'application/json; charset=utf-8',
          headers: { 'cache-control': 'public, max-age=300' },
        };
      },
    });

    ctx.routes.public({
      method: 'GET',
      path: '/downloads/:slug/:file',
      async handler(request) {
        const slug = request.params.slug ?? '';
        const filename = safeFilename(request.params.file);
        const notFound = {
          status: 404,
          body: { message: 'Not found.' },
          headers: { 'cache-control': 'no-store' },
        };
        if (!SLUG_RE.test(slug) || !filename || filename !== request.params.file) return notFound;
        const [file] = await ctx.db.transaction(request.siteId, (tx) =>
          tx
            .update(files)
            .set({ downloads: sql`${files.downloads} + 1` })
            .where(and(eq(files.productSlug, slug), eq(files.filename, filename)))
            .returning({ data: files.data }),
        );
        if (!file) return notFound;
        return {
          body: Buffer.from(file.data),
          contentType: 'application/zip',
          headers: {
            'content-disposition': `attachment; filename="${filename}"`,
            'x-content-type-options': 'nosniff',
            'cache-control': 'no-store',
          },
        };
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
      const days = Math.min(Math.max(Number(request.query.days) || 90, 1), RETENTION_DAYS);
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

    admin('GET', '/admin/server-reports', async (request) => {
      const days = Math.min(Math.max(Number(request.query.days) || 90, 1), RETENTION_DAYS);
      const since = new Date(Date.now() - days * 86_400_000);
      const rows = await ctx.db.transaction(request.siteId, (tx) =>
        tx
          .select()
          .from(serverReports)
          .where(gte(serverReports.lastSeenAt, since))
          .orderBy(desc(serverReports.lastSeenAt)),
      );
      return { body: rows.map(({ siteId: _site, ...row }) => row) };
    });

    admin('GET', '/admin/files', async (request) => ({
      body: await ctx.db.transaction(request.siteId, (tx) =>
        tx
          .select({
            productSlug: files.productSlug,
            version: files.version,
            filename: files.filename,
            sha256: files.sha256,
            size: files.size,
            downloads: files.downloads,
            createdAt: files.createdAt,
          })
          .from(files)
          .orderBy(files.productSlug, desc(files.createdAt)),
      ),
    }));

    admin('POST', '/admin/products/:slug/files', async (request) => {
      const slug = request.params.slug ?? '';
      const version = text(request.query.version, 40);
      if (!(await productOf(ctx, request.siteId, slug))) return fail(400, 'Unknown product.');
      if (!VERSION_RE.test(version)) return fail(400, 'Give the version, e.g. 1.2.0 or 0.6.0-1.');
      const upload = await request.file();
      if (!upload) return fail(400, 'Choose the file (.zip).');
      const filename = safeFilename(upload.filename);
      if (!filename) {
        return fail(400, 'The file name must end in .zip and use only a-z, 0-9, dot, - and _.');
      }
      if (!isZip(upload.data)) return fail(400, 'This is not a zip archive.');
      const sha256 = createHash('sha256').update(upload.data).digest('hex');
      const outcome = await ctx.db.transaction(request.siteId, async (tx) => {
        const [taken] = await tx
          .select({ version: files.version, productSlug: files.productSlug })
          .from(files)
          .where(
            or(
              and(eq(files.productSlug, slug), eq(files.version, version)),
              eq(files.filename, filename),
            ),
          );
        if (taken) return 'taken';
        await tx.insert(files).values({
          siteId: request.siteId,
          productSlug: slug,
          version,
          filename,
          sha256,
          size: upload.data.length,
          data: upload.data,
        });
        return 'ok';
      });
      if (outcome === 'taken') {
        return fail(
          409,
          'This version or file name is already published: published files never change. Delete it first.',
        );
      }
      return { body: { ok: true, version, filename, sha256, size: upload.data.length } };
    });

    admin('DELETE', '/admin/products/:slug/files/:version', async (request) => {
      await ctx.db.transaction(request.siteId, (tx) =>
        tx
          .delete(files)
          .where(
            and(
              eq(files.productSlug, request.params.slug ?? ''),
              eq(files.version, request.params.version ?? ''),
            ),
          ),
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
      const price = parsePrice(body.priceCents, body.currency);
      if (!price) return fail(400, 'The price is not valid (cents, and a currency such as EUR).');
      const bundle = body.bundle === true;
      let covers: string[] | null = null;
      if (bundle) {
        const others = await ctx.db.transaction(request.siteId, (tx) =>
          tx
            .select({
              slug: products.slug,
              bundle: products.bundle,
              free: products.free,
              covers: products.covers,
            })
            .from(products),
        );
        // Bundles never cover bundles.
        if (others.some((p) => p.bundle && p.covers?.includes(slug))) {
          return fail(400, 'Another bundle covers this product: it cannot be a bundle.');
        }
        const sellable = new Set(
          others.filter((p) => !p.bundle && !p.free && p.slug !== slug).map((p) => p.slug),
        );
        if (body.covers !== 'all') {
          const list = Array.isArray(body.covers) ? body.covers.map((c) => text(c, 40)) : [];
          covers = [...new Set(list)].sort();
          if (covers.length === 0 || covers.some((c) => !sellable.has(c))) {
            return fail(400, 'A bundle covers paid products of the store, never bundles.');
          }
        }
      }
      const values = {
        name,
        updatesMonths: months,
        demo: bundle ? false : body.demo !== false,
        renewUrl,
        bundle,
        covers,
        free: !bundle && body.free === true,
        ...price,
      };
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
        await tx.delete(files).where(eq(files.productSlug, slug));
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
        // Seats are sites: a site using several products of a bundle counts once.
        const used = sql<number>`(select count(distinct a.site_origin)::int from activations a where a.license_id = licenses.id and a.deactivated_at is null)`;
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
            ilike(licenses.ownerEmail, `%${q.replace(/[%_\\]/g, '\\$&')}%`),
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
          keySealed: undefined,
          used,
        })),
      };
    });

    admin('POST', '/admin/licenses', async (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const email = text(body.email, 200).toLowerCase();
      const ownerEmail = text(body.ownerEmail, 200).toLowerCase() || null;
      const seats = Math.round(Number(body.seats ?? 1));
      const product = await productOf(ctx, request.siteId, text(body.productSlug, 40));
      if (!product) return fail(400, 'Unknown product.');
      if (!EMAIL_RE.test(email)) return fail(400, 'An email address is needed.');
      if (ownerEmail && !EMAIL_RE.test(ownerEmail)) {
        return fail(400, 'The agency’s email address is not valid.');
      }
      // Partners (the agency, or the customer itself) get their discount, for the record.
      const [partner] = await ctx.db.transaction(request.siteId, (tx) =>
        tx
          .select()
          .from(partners)
          .where(eq(partners.email, ownerEmail ?? email)),
      );
      const listPrice =
        body.listPriceCents === undefined ||
        body.listPriceCents === null ||
        body.listPriceCents === ''
          ? product.priceCents
          : Math.round(Number(body.listPriceCents));
      if (listPrice !== null && !(listPrice >= 0 && listPrice <= 100_000_000)) {
        return fail(400, 'The list price is not valid.');
      }
      const discount = partner?.discountPercent ?? 0;
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
        ownerEmail: ownerEmail === email ? null : ownerEmail,
        listPriceCents: listPrice,
        discountPercent: partner ? discount : null,
        priceCents: listPrice === null ? null : discounted(listPrice, discount),
        currency: listPrice === null ? null : product.currency,
      });
      let mailed = false;
      if (body.send === true) {
        mailed = await emailKey(ctx, request.siteId, product, license, key)
          .then(() => true)
          .catch(() => false);
      }
      return {
        body: {
          id: license.id,
          key,
          mailed,
          partner: partner ? { name: partner.name, discountPercent: discount } : null,
          listPriceCents: license.listPriceCents,
          priceCents: license.priceCents,
          currency: license.currency,
        },
      };
    });

    // The customer and the agency that manages the license.
    admin('PUT', '/admin/licenses/:id/people', async (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const email = text(body.email, 200).toLowerCase();
      const ownerEmail = text(body.ownerEmail, 200).toLowerCase() || null;
      if (!EMAIL_RE.test(email) || (ownerEmail && !EMAIL_RE.test(ownerEmail))) {
        return fail(400, 'The email addresses are not valid.');
      }
      const updated = await ctx.db.transaction(request.siteId, (tx) =>
        tx
          .update(licenses)
          .set({ email, ownerEmail: ownerEmail === email ? null : ownerEmail })
          .where(eq(licenses.id, request.params.id ?? ''))
          .returning({ id: licenses.id }),
      );
      if (updated.length === 0) return fail(404, 'Unknown license.');
      return { body: { ok: true } };
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
            productSlug: sql<string>`coalesce(${activations.productSlug}, ${licenses.productSlug})`,
            createdAt: activations.createdAt,
            lastSeenAt: activations.lastSeenAt,
            deactivatedAt: activations.deactivatedAt,
          })
          .from(activations)
          .innerJoin(licenses, eq(licenses.id, activations.licenseId))
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

    registerPartners(ctx, admin);
    registerPortal(ctx);

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

/** A list price in cents with its currency, or null when invalid (no price is fine). */
export function parsePrice(
  cents: unknown,
  currency: unknown,
): { priceCents: number | null; currency: string } | null {
  const code = (typeof currency === 'string' ? currency.trim().toUpperCase() : '') || 'EUR';
  if (!/^[A-Z]{3}$/.test(code)) return null;
  if (cents === undefined || cents === null || cents === '')
    return { priceCents: null, currency: code };
  const value = Number(cents);
  if (!Number.isInteger(value) || value < 0 || value > 100_000_000) return null;
  return { priceCents: value, currency: code };
}

/** `https://host[:port]` of the site a license is used on, or null. */
export function originOf(value: unknown): string | null {
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
/** Days a site stays in the registry after its last report. */
export const RETENTION_DAYS = 180;

/**
 * Whether a reported address is a public site: not localhost, not a test or
 * local name (`.test`, `.local`, `.localhost`, `.example`, `.invalid`), not a
 * private, loopback or link-local IP.
 */
export function isPublicOrigin(origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (!host.includes('.') && !host.includes(':')) return false;
  if (/(^|\.)(localhost|test|local|example|invalid|internal|lan|home)$/.test(host)) return false;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return !(
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (host.includes(':')) return !/^(::1?|fe80:|fc|fd)/.test(host);
  return true;
}

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
