import type { PluginContext, RouteRequest, RouteResponse } from '@cleitext/plugin-sdk';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { EMAIL_RE, fail, text } from './common';
import { seatsInUse } from './licensing';
import { activations, licenses, partners } from './schema';

type Admin = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  handler: (request: RouteRequest) => Promise<RouteResponse>,
) => void;

/** A partner as the admin sends it, checked; null when something is wrong. */
export function parsePartner(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = text(b.email, 200).toLowerCase();
  const name = text(b.name, 100);
  const discountPercent = Math.round(Number(b.discountPercent ?? 0));
  const code = text(b.code, 40).toLowerCase() || null;
  const lsDiscountCode = text(b.lsDiscountCode, 60) || null;
  if (!EMAIL_RE.test(email) || !name) return null;
  if (!(discountPercent >= 0 && discountPercent <= 100)) return null;
  if (code && !/^[a-z0-9_-]{2,40}$/.test(code)) return null;
  if (lsDiscountCode && !/^[A-Za-z0-9_-]{1,60}$/.test(lsDiscountCode)) return null;
  return { email, name, discountPercent, code, lsDiscountCode, note: text(b.note, 500) || null };
}

/**
 * Store → Partner: agencies and resellers with their discount (record keeping
 * only, no payment here), their licenses and the sites using them.
 */
export function registerPartners(ctx: PluginContext, admin: Admin): void {
  /** Licenses an agency manages or holds, with the sites using each. */
  async function licensesOf(siteId: string, emails: string[]) {
    if (emails.length === 0) return [];
    return ctx.db.transaction(siteId, async (tx) => {
      const rows = await tx
        .select()
        .from(licenses)
        .where(or(inArray(licenses.ownerEmail, emails), inArray(licenses.email, emails)))
        .orderBy(desc(licenses.createdAt));
      const ids = rows.map((l) => l.id);
      const active = ids.length
        ? await tx
            .select({
              licenseId: activations.licenseId,
              siteOrigin: activations.siteOrigin,
              productSlug: activations.productSlug,
            })
            .from(activations)
            .where(and(inArray(activations.licenseId, ids), isNull(activations.deactivatedAt)))
        : [];
      return rows.map(({ keyHash: _hash, keySealed: _sealed, siteId: _site, ...license }) => {
        const mine = active.filter((a) => a.licenseId === license.id);
        return {
          ...license,
          used: seatsInUse(mine),
          sites: [...new Set(mine.map((a) => a.siteOrigin))].sort(),
        };
      });
    });
  }

  admin('GET', '/admin/partners', async (request) => {
    const rows = await ctx.db.transaction(request.siteId, (tx) =>
      tx.select().from(partners).orderBy(partners.name),
    );
    const all = await licensesOf(
      request.siteId,
      rows.map((p) => p.email),
    );
    return {
      body: rows.map(({ siteId: _site, ...partner }) => {
        const mine = all.filter((l) => l.ownerEmail === partner.email || l.email === partner.email);
        const active = mine.filter((l) => l.status === 'active');
        return {
          ...partner,
          licenses: mine.length,
          activeLicenses: active.length,
          seatsUsed: active.reduce((n, l) => n + l.used, 0),
          // Licenses with no limit leave the total open.
          seatsTotal: active.some((l) => l.seats === 0)
            ? null
            : active.reduce((n, l) => n + l.seats, 0),
          revenueCents: mine.reduce((n, l) => n + (l.priceCents ?? 0), 0),
        };
      }),
    };
  });

  admin('GET', '/admin/partners/:email/licenses', async (request) => ({
    body: await licensesOf(request.siteId, [(request.params.email ?? '').toLowerCase()]),
  }));

  admin('PUT', '/admin/partners', async (request) => {
    const partner = parsePartner(request.body);
    if (!partner) {
      return fail(
        400,
        'Email, name and a discount from 0 to 100 are needed; codes use a-z, 0-9, - and _.',
      );
    }
    const outcome = await ctx.db.transaction(request.siteId, async (tx) => {
      if (partner.code) {
        const [taken] = await tx
          .select({ email: partners.email })
          .from(partners)
          .where(eq(partners.code, partner.code));
        if (taken && taken.email !== partner.email) return 'taken';
      }
      const { email, ...values } = partner;
      await tx
        .insert(partners)
        .values({ siteId: request.siteId, email, ...values })
        .onConflictDoUpdate({ target: [partners.siteId, partners.email], set: values });
      return 'ok';
    });
    if (outcome === 'taken') return fail(409, 'Another partner has this code.');
    return { body: { ok: true } };
  });

  admin('DELETE', '/admin/partners/:email', async (request) => {
    // Licenses stay as they are: only the partner record goes.
    await ctx.db.transaction(request.siteId, (tx) =>
      tx.delete(partners).where(eq(partners.email, (request.params.email ?? '').toLowerCase())),
    );
    return { body: { ok: true } };
  });
}
