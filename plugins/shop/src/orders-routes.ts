import { adminUrl, type PluginContext, type RouteRequest } from '@cleitext/plugin-sdk';
import { conversions } from './conversions';
import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { productTags } from './buy-box';
import {
  EMAIL_IDS,
  EMAILS,
  EMAILS_STORAGE,
  emailSettingsSchema,
  emailsForStatus,
  renderEmail,
  sendOrderEmail,
  type EmailContext,
  type EmailId,
} from './emails';
import {
  addNote,
  changeStatus,
  listOrders,
  ORDER_STATUSES,
  orderDetail,
  OrderError,
  orderListSchema,
  refund,
  refundSchema,
  type OrderDetail,
} from './order-admin';
import { GatewayError } from './gateways';
import { orders, type OrderRow, type OrderStatus } from './schema';
import { inLanguage, paymentInstructions, type StoreSettings } from './storefront';

declare module '@cleitext/plugin-sdk' {
  interface Actions {
    /** An order changed status (from the admin, or a payment). */
    'shop.order.status': { orderId: string; number: number; from: string; to: string };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const problem = (status: number, detail: string, errors: unknown[] = []) => ({
  status,
  body: {
    title: status === 404 ? 'Not Found' : 'Bad Request',
    status,
    detail,
    ...(errors.length ? { errors } : {}),
  },
});

/** What an email needs besides the order: the site, addresses, bank details. */
export function orderMail(
  ctx: PluginContext,
  store: (siteId: string) => Promise<StoreSettings & { notifyEmails: string[] }>,
) {
  const context = async (
    siteId: string,
    origin: string,
    detail: OrderDetail,
    extra: { note?: string; amount?: string } = {},
  ): Promise<{ context: EmailContext; shop: string[] }> => {
    const [site, settings] = await Promise.all([ctx.site(siteId), store(siteId)]);
    const { order } = detail;
    return {
      context: {
        siteName: site.name,
        origin,
        prefix: order.locale === site.defaultLocale ? '' : `/${order.locale}`,
        payment: paymentInstructions(inLanguage(settings, order.locale), order),
        adminUrl: `${origin}${adminUrl(`/ext/shop/orders?order=${order.id}`)}`,
        ...extra,
      },
      shop: settings.notifyEmails,
    };
  };
  const send = async (
    siteId: string,
    origin: string,
    id: EmailId,
    detail: OrderDetail,
    extra: { note?: string; amount?: string } = {},
  ) => {
    const { context: mailContext, shop } = await context(siteId, origin, detail, extra);
    return sendOrderEmail(ctx, siteId, id, detail, mailContext, { shop });
  };
  return { context, send };
}

export function registerOrderRoutes(
  ctx: PluginContext,
  capability: string,
  store: (siteId: string) => Promise<StoreSettings & { notifyEmails: string[] }>,
  /** Refunds of online orders through their provider. */
  online?: { refund: (siteId: string, order: OrderRow, amount: string) => Promise<string | null> },
): void {
  const mail = orderMail(ctx, store);
  const api = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    path: string,
    handler: (
      request: RouteRequest,
    ) => Promise<{ status?: number; body?: unknown; contentType?: string }>,
  ) =>
    ctx.routes.api({
      method,
      path,
      capability,
      handler: async (request) => {
        try {
          return await handler(request);
        } catch (error) {
          if (error instanceof OrderError) return problem(400, error.message);
          if (error instanceof z.ZodError)
            return problem(
              400,
              'Some values are not valid.',
              error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
            );
          throw error;
        }
      },
    });
  const load = (siteId: string, id: string) =>
    UUID_RE.test(id)
      ? ctx.db.transaction(siteId, (tx) => orderDetail(tx, id))
      : Promise.resolve(null);
  const author = (request: RouteRequest) => request.user?.displayName ?? '';

  api('GET', '/orders', async (request) => {
    const query = orderListSchema.parse(request.query);
    return { body: await ctx.db.transaction(request.siteId, (tx) => listOrders(tx, query)) };
  });

  api('GET', '/orders/:id', async (request) => {
    const detail = await load(request.siteId, request.params.id!);
    return detail ? { body: detail } : problem(404, 'This order does not exist.');
  });

  api('PATCH', '/orders/:id/status', async (request) => {
    const { status } = z
      .object({ status: z.enum(ORDER_STATUSES as [OrderStatus, ...OrderStatus[]]) })
      .parse(request.body ?? {});
    const id = request.params.id!;
    if (!UUID_RE.test(id)) return problem(404, 'This order does not exist.');
    const changed = await ctx.db.transaction(request.siteId, (tx) =>
      changeStatus(tx, request.siteId, id, status, author(request)),
    );
    const detail = (await load(request.siteId, id))!;
    if (changed.from !== status) {
      if (changed.productIds.length)
        await ctx.cache.invalidate(request.siteId, productTags(changed.productIds));
      for (const email of emailsForStatus(changed.from, status))
        await mail.send(request.siteId, request.origin, email, detail);
      await ctx.hooks.emit(
        'shop.order.status',
        { orderId: id, number: detail.order.number, from: changed.from, to: status },
        { siteId: request.siteId },
      );
      await conversions(ctx).changed(request.siteId, id, changed.from, status);
    }
    return { body: detail };
  });

  api('POST', '/orders/:id/notes', async (request) => {
    const input = z
      .object({ note: z.string().trim().min(1).max(5000), customer: z.boolean().default(false) })
      .parse(request.body ?? {});
    const id = request.params.id!;
    if (!UUID_RE.test(id)) return problem(404, 'This order does not exist.');
    await ctx.db.transaction(request.siteId, (tx) =>
      addNote(tx, request.siteId, id, input.note, input.customer, author(request)),
    );
    const detail = (await load(request.siteId, id))!;
    if (input.customer)
      await mail.send(request.siteId, request.origin, 'customer_note', detail, {
        note: input.note,
      });
    return { status: 201, body: detail };
  });

  api('POST', '/orders/:id/refunds', async (request) => {
    const input = refundSchema.parse(request.body ?? {});
    const id = request.params.id!;
    if (!UUID_RE.test(id)) return problem(404, 'This order does not exist.');
    let result: Awaited<ReturnType<typeof refund>>;
    try {
      result = await ctx.db.transaction(request.siteId, (tx) =>
        refund(
          tx,
          request.siteId,
          id,
          input,
          author(request),
          input.gateway && online
            ? (order, amount) => online.refund(request.siteId, order, amount)
            : undefined,
        ),
      );
    } catch (error) {
      if (error instanceof GatewayError) return problem(400, error.message);
      throw error;
    }
    if (result.productIds.length)
      await ctx.cache.invalidate(request.siteId, productTags(result.productIds));
    conversions(ctx).refunded(request.siteId, id, result.amount);
    const detail = (await load(request.siteId, id))!;
    await mail.send(request.siteId, request.origin, 'customer_refunded', detail, {
      amount: result.amount,
    });
    return { status: 201, body: detail };
  });

  /** Sends one of the order's emails again. */
  api('POST', '/orders/:id/emails/:email', async (request) => {
    const email = request.params.email as EmailId;
    if (!(EMAIL_IDS as readonly string[]).includes(email)) return problem(404, 'Unknown email.');
    const detail = await load(request.siteId, request.params.id!);
    if (!detail) return problem(404, 'This order does not exist.');
    const sent = await mail.send(request.siteId, request.origin, email, detail);
    return sent
      ? { body: { sent: true } }
      : problem(400, 'This email is turned off, or has nobody to go to.');
  });

  // ---- Emails: texts and preview -----------------------------------------------------

  api('GET', '/emails', async (request) => {
    const stored = emailSettingsSchema.safeParse(
      (await ctx.storage.get(request.siteId, EMAILS_STORAGE)) ?? {},
    );
    const settings = await store(request.siteId);
    return {
      body: {
        notifyEmails: settings.notifyEmails,
        emails: EMAIL_IDS.map((id) => ({
          id,
          to: EMAILS[id].to,
          title: EMAILS[id].title,
          defaults: { en: EMAILS[id].en, it: EMAILS[id].it },
          custom: (stored.success ? stored.data[id] : undefined) ?? {
            enabled: true,
            subject: '',
            heading: '',
            intro: '',
            translations: {},
          },
        })),
      },
    };
  });

  api('PUT', '/emails', async (request) => {
    const input = emailSettingsSchema.parse(request.body ?? {});
    await ctx.storage.set(request.siteId, EMAILS_STORAGE, input);
    return { body: input };
  });

  /** The email as it looks, with the latest order (or the one given) and the texts typed. */
  api('POST', '/emails/:email/preview', async (request) => {
    const email = request.params.email as EmailId;
    if (!(EMAIL_IDS as readonly string[]).includes(email)) return problem(404, 'Unknown email.');
    const input = z
      .object({
        subject: z.string().max(200).default(''),
        heading: z.string().max(200).default(''),
        intro: z.string().max(2000).default(''),
        order: z.uuid().optional(),
        /** The texts given are in this language (a translation being written). */
        locale: z
          .string()
          .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/)
          .optional(),
      })
      .parse(request.body ?? {});
    const id =
      input.order ??
      (
        await ctx.db.transaction(request.siteId, (tx) =>
          tx.select({ id: orders.id }).from(orders).orderBy(desc(orders.number)).limit(1),
        )
      )[0]?.id;
    const found = id ? await load(request.siteId, id) : null;
    if (!found) return problem(404, 'There is no order yet to show the email with.');
    const detail = input.locale
      ? { ...found, order: { ...found.order, locale: input.locale } }
      : found;
    const { context } = await mail.context(request.siteId, request.origin, detail, {
      note: email === 'customer_note' ? 'Your parcel leaves today.' : undefined,
      amount: email === 'customer_refunded' ? detail.order.total : undefined,
    } as { note?: string; amount?: string });
    const message = renderEmail(email, detail, context, {
      enabled: true,
      subject: input.subject,
      heading: input.heading,
      intro: input.intro,
      translations: {},
    });
    return { body: { subject: message.subject, html: message.html } };
  });
}
