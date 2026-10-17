/**
 * GDPR requests (Privacy plugin): the orders, saved addresses and carts of
 * an email address, exported or erased. Orders that were paid or may still
 * be are kept for tax and accounting records, as the law asks; they only
 * lose the IP address and the browser. Orders that never went through
 * (draft, pending, failed, cancelled) are anonymized.
 */
import type { PluginContext } from '@cleitext/plugin-sdk';
import { and, inArray, sql } from 'drizzle-orm';
import type { Address } from './address';
import { carts, couponUses, customers, orders, type OrderStatus } from './schema';

const LABEL = { en: 'Shop: orders and addresses', it: 'Negozio: ordini e indirizzi' };
/** Orders without a sale behind them: nothing to keep. */
const UNSOLD: OrderStatus[] = ['draft', 'pending', 'failed', 'cancelled'];
const ERASED = 'deleted@anonymized.invalid';

const sameEmail = (column: typeof orders.email | typeof customers.email, email: string) =>
  sql`lower(${column}) = ${email.trim().toLowerCase()}`;

const addressText = (a: Address | null | undefined) =>
  a
    ? [
        `${a.firstName} ${a.lastName}`.trim(),
        a.company,
        a.address1,
        a.address2,
        `${a.postcode} ${a.city} ${a.province}`.trim(),
        a.country,
        a.phone,
      ]
        .filter(Boolean)
        .join(', ')
    : null;

const EMPTY: Address = {
  firstName: '',
  lastName: '',
  company: '',
  address1: '',
  address2: '',
  city: '',
  postcode: '',
  province: '',
  country: '',
  phone: '',
};

export function registerPrivacy(ctx: PluginContext): void {
  ctx.privacy.registerExporter({
    id: 'shop',
    label: LABEL,
    async export(siteId, email) {
      const { list, saved } = await ctx.db.transaction(siteId, async (tx) => ({
        list: await tx
          .select()
          .from(orders)
          .where(and(sameEmail(orders.email, email), sql`${orders.status} <> 'draft'`))
          .orderBy(orders.createdAt),
        saved: await tx.select().from(customers).where(sameEmail(customers.email, email)),
      }));
      const groups = [];
      if (list.length > 0) {
        groups.push({
          id: 'shop.orders',
          label: { en: 'Orders', it: 'Ordini' },
          items: list.map((o) => ({
            number: o.number,
            date: o.createdAt.toISOString(),
            status: o.status,
            total: `${o.total} ${o.currency}`,
            payment: o.paymentTitle,
            email: o.email,
            billing: addressText(o.billing),
            shipping: addressText(o.shipping),
            taxCode: o.invoice?.taxCode || null,
            vatNumber: o.invoice?.vatNumber || null,
            note: o.customerNote || null,
            ip: o.ip,
            browser: o.userAgent,
          })),
        });
      }
      if (saved.length > 0) {
        groups.push({
          id: 'shop.addresses',
          label: { en: 'Saved addresses', it: 'Indirizzi salvati' },
          items: saved.map((c) => ({
            email: c.email,
            billing: addressText(c.billing),
            shipping: addressText(c.shipping),
            taxCode: c.invoice?.taxCode || null,
            vatNumber: c.invoice?.vatNumber || null,
          })),
        });
      }
      return groups;
    },
  });

  ctx.privacy.registerEraser({
    id: 'shop',
    label: LABEL,
    async erase(siteId, email) {
      return ctx.db.transaction(siteId, async (tx) => {
        let removed = 0;
        // Saved addresses, and the carts of the same account.
        const saved = await tx
          .delete(customers)
          .where(sameEmail(customers.email, email))
          .returning({ userId: customers.userId });
        removed += saved.length;
        const users = saved.map((c) => c.userId);
        if (users.length > 0) {
          const gone = await tx
            .delete(carts)
            .where(inArray(carts.userId, users))
            .returning({ id: carts.id });
          removed += gone.length;
        }
        // Orders without a sale: anonymized.
        const unsold = await tx
          .update(orders)
          .set({
            email: ERASED,
            billing: EMPTY,
            shipping: EMPTY,
            invoice: null,
            customerNote: '',
            customerId: null,
            ip: null,
            userAgent: null,
            updatedAt: new Date(),
          })
          .where(and(sameEmail(orders.email, email), inArray(orders.status, UNSOLD)))
          .returning({ id: orders.id });
        removed += unsold.length;
        if (unsold.length > 0) {
          await tx
            .update(couponUses)
            .set({ email: ERASED, userId: null })
            .where(
              inArray(
                couponUses.orderId,
                unsold.map((o) => o.id),
              ),
            );
        }
        // Sales: kept for the records, without the IP address and the browser.
        const kept = await tx
          .update(orders)
          .set({ ip: null, userAgent: null })
          .where(sameEmail(orders.email, email))
          .returning({ id: orders.id });
        return {
          removed,
          retained: kept.length,
          ...(kept.length > 0
            ? {
                messages: [
                  `${kept.length} order(s) kept for tax and accounting records (legal obligation); their IP address and browser were removed.`,
                ],
              }
            : {}),
        };
      });
    },
  });
}
