import { definePlugin, type PluginContext } from '@cleitext/plugin-sdk';
import {
  addressProblem,
  answerOf,
  AvaError,
  client,
  invoiceModel,
  quoteKey,
  quoteModel,
  refundModel,
  shipTo,
  type AvaClient,
  type OrderInput,
  type QuoteAnswer,
  type QuoteRequest,
  type Send,
} from './avatax';
import { cleanSettings, type Settings } from './settings';
import { strings } from './strings';

/**
 * AvaTax for Cleishop (official plugin): US sales taxes worked out by
 * Avalara, through Cleishop's `shop.taxes` service (Cleishop 1.16), with the
 * taxes by jurisdiction on the order. Quotes are SalesOrders, which Avalara
 * does not keep. Only with «commit» on (off by default, for the go-live)
 * paid orders become committed SalesInvoices, voided or refunded with the
 * order. Avalara not answering stops the checkout: never an order without
 * its taxes.
 */

declare module '@cleitext/plugin-sdk' {
  interface Actions {
    'shop.order.created': { orderId: string; number: number };
    'shop.order.status': { orderId: string; number: number; from: string; to: string };
    'shop.order.refunded': {
      orderId: string;
      number: number;
      refundId: string;
      amount: string;
      reason: string;
    };
  }
}

const VERSION = '1.0.0';
const CAPABILITY = 'manage_avatax';
const PAID = ['processing', 'completed'];
const CACHE_TTL = 15 * 60_000;
const CACHE_MAX = 300;
const LOG_MAX = 100;

interface ShopOrder {
  order: OrderInput & {
    id: string;
    status: string;
    total: string;
    externalRef?: string | null;
  };
  items: OrderInput['items'];
}

interface ShopService {
  [name: string]: (siteId: string, ...args: never[]) => unknown;
  order(siteId: string, id: string): Promise<ShopOrder | null>;
}

interface LogEntry {
  at: string;
  operation: string;
  ok: boolean;
  ms: number;
  /** No addresses or names: the country and postcode, the document's code. */
  about: string;
  error?: string;
}

/** The plugin's server: given the HTTP call, so the tests can give a fake Avalara. */
export function setupAvatax(ctx: PluginContext, send?: Send): void {
  ctx.access.defineCapability(CAPABILITY, {
    label: { en: 'Manage AvaTax', it: 'Gestire AvaTax' },
    roles: ['administrator'],
  });
  const http: Send =
    send ??
    ((request) =>
      ctx.http.send({
        url: request.url,
        method: request.method,
        headers: request.headers,
        ...(request.body !== undefined ? { body: request.body } : {}),
        timeoutMs: request.timeoutMs,
      }));
  const settingsOf = async (siteId: string) =>
    cleanSettings(await ctx.storage.get(siteId, 'settings'));
  const credentials = async (siteId: string) => {
    const accountId = await ctx.secrets.get(siteId, 'accountId');
    const licenseKey = await ctx.secrets.get(siteId, 'licenseKey');
    return accountId && licenseKey ? { accountId, licenseKey } : null;
  };
  const clientOf = async (siteId: string, settings: Settings): Promise<AvaClient | null> => {
    const keys = await credentials(siteId);
    return keys ? client(http, keys, settings.environment, VERSION) : null;
  };

  // The last calls, when the shop turned the log on.
  const log = async (siteId: string, settings: Settings, entry: LogEntry) => {
    if (!entry.ok) ctx.log.warn(`AvaTax ${entry.operation} (${entry.about}): ${entry.error ?? ''}`);
    if (!settings.debug) return;
    const list = ((await ctx.storage.get<LogEntry[]>(siteId, 'log')) ?? []).slice(-(LOG_MAX - 1));
    list.push(entry);
    await ctx.storage.set(siteId, 'log', list);
  };
  const timed = async <T>(
    siteId: string,
    settings: Settings,
    operation: string,
    about: string,
    run: () => Promise<T>,
  ): Promise<T> => {
    const started = Date.now();
    try {
      const result = await run();
      await log(siteId, settings, {
        at: new Date().toISOString(),
        operation,
        ok: true,
        ms: Date.now() - started,
        about,
      });
      return result;
    } catch (error) {
      await log(siteId, settings, {
        at: new Date().toISOString(),
        operation,
        ok: false,
        ms: Date.now() - started,
        about,
        error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      });
      throw error;
    }
  };

  // Quotes of the same cart again within a while: answered without asking Avalara.
  const cache = new Map<string, { answer: QuoteAnswer; at: number }>();
  const cached = (key: string) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.answer;
    if (hit) cache.delete(key);
    return null;
  };
  const remember = (key: string, answer: QuoteAnswer) => {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { answer, at: Date.now() });
  };
  // Addresses checked already (at checkout the same one is asked again on each step).
  const checked = new Map<string, { problem: string | null; at: number }>();

  ctx.services?.provide('shop.taxes', {
    async quote(siteId: string, request: QuoteRequest & { locale?: string }) {
      const settings = await settingsOf(siteId);
      if (!settings.enabled) return null;
      const country = (request.address.country || '').toUpperCase();
      if (!settings.countries.includes(country)) return null;
      if (request.stage === 'cart' && !settings.calculateOnCart) return null;
      const t = strings(request.locale ?? '');
      const ava = await clientOf(siteId, settings);
      if (!ava) throw new Error(t('Taxes cannot be worked out right now. Please try again later.'));
      // Not enough to know where it goes: an estimate needs at least the ZIP code.
      if (!request.address.postcode.trim()) return null;
      const about = `${country} ${request.address.postcode.trim().slice(0, 5)}`;

      // At checkout, a US address is checked first (as WooCommerce AvaTax did).
      if (
        request.stage === 'checkout' &&
        settings.addressValidation === 'required' &&
        country === 'US'
      ) {
        const address = shipTo(request.address);
        const key = JSON.stringify(address);
        let verdict = checked.get(key);
        if (!verdict || Date.now() - verdict.at > CACHE_TTL) {
          try {
            const result = await timed(siteId, settings, 'resolve', about, () =>
              ava.resolve(address),
            );
            verdict = { problem: addressProblem(result), at: Date.now() };
          } catch {
            throw new Error(t('Taxes cannot be worked out right now. Please try again later.'));
          }
          if (checked.size > CACHE_MAX) checked.clear();
          checked.set(key, verdict);
        }
        if (verdict.problem)
          throw new Error(
            t('We could not find this shipping address: check the street, city and ZIP code.'),
          );
      }

      const model = quoteModel(request, {
        environment: settings.environment,
        companyCode: settings.companyCode,
        origin: settings.origin,
        shippingTaxCode: settings.shippingTaxCode,
        defaultTaxCode: settings.defaultTaxCode,
      });
      const key = `${siteId}:${quoteKey(model)}`;
      const hit = cached(key);
      if (hit) return hit;
      try {
        const result = await timed(siteId, settings, 'quote', about, () => ava.create(model));
        const answer = answerOf(request, result);
        remember(key, answer);
        return answer;
      } catch (error) {
        if (
          error instanceof AvaError &&
          /address|geocod|postal|region|zip/i.test(`${error.code} ${error.message}`)
        )
          throw new Error(
            t('We could not find this shipping address: check the street, city and ZIP code.'),
            { cause: error },
          );
        throw new Error(t('Taxes cannot be worked out right now. Please try again later.'), {
          cause: error,
        });
      }
    },
  });

  // ---- Orders: recorded in Avalara only with «commit» on --------------------------------------

  const shopOf = (siteId: string) => ctx.services?.use<ShopService>(siteId, 'shop') ?? null;
  const docKey = (orderId: string) => `doc:${orderId}`;
  type Doc = { code: string; state: 'committed' | 'voided'; refunded: number };

  async function commitOrder(siteId: string, orderId: string) {
    const settings = await settingsOf(siteId);
    if (!settings.enabled || !settings.commit) return;
    if (await ctx.storage.get<Doc>(siteId, docKey(orderId))) return;
    const shop = await shopOf(siteId);
    const detail = shop ? await shop.order(siteId, orderId) : null;
    if (!detail || !PAID.includes(detail.order.status)) return;
    // Orders imported from the old shop were recorded there already.
    if (detail.order.externalRef) return;
    const country = (
      detail.order.shipping.country ||
      detail.order.billing.country ||
      ''
    ).toUpperCase();
    if (!settings.countries.includes(country)) return;
    const ava = await clientOf(siteId, settings);
    if (!ava) return;
    const model = invoiceModel(
      { ...detail.order, items: detail.items },
      {
        environment: settings.environment,
        companyCode: settings.companyCode,
        origin: settings.origin,
        shippingTaxCode: settings.shippingTaxCode,
        defaultTaxCode: settings.defaultTaxCode,
      },
    );
    await timed(siteId, settings, 'commit', `#${detail.order.number}`, () => ava.create(model));
    await ctx.storage.set(siteId, docKey(orderId), {
      code: model.code!,
      state: 'committed',
      refunded: 0,
    } satisfies Doc);
  }

  async function voidOrder(siteId: string, orderId: string) {
    const settings = await settingsOf(siteId);
    if (!settings.enabled || !settings.commit) return;
    const doc = await ctx.storage.get<Doc>(siteId, docKey(orderId));
    if (!doc || doc.state !== 'committed') return;
    const ava = await clientOf(siteId, settings);
    if (!ava) return;
    await timed(siteId, settings, 'void', `#${doc.code}`, () =>
      ava.void(settings.companyCode, doc.code),
    );
    await ctx.storage.set(siteId, docKey(orderId), { ...doc, state: 'voided' } satisfies Doc);
  }

  const safely = (what: string, run: () => Promise<void>) =>
    run().catch((error) => ctx.log.warn(`AvaTax ${what}: ${String(error)}`));

  ctx.hooks.on('shop.order.created', ({ orderId }, { siteId }) =>
    safely('commit', () => commitOrder(siteId, orderId)),
  );
  ctx.hooks.on('shop.order.status', ({ orderId, to }, { siteId }) =>
    safely(PAID.includes(to) ? 'commit' : 'void', () =>
      PAID.includes(to)
        ? commitOrder(siteId, orderId)
        : to === 'cancelled' || to === 'failed'
          ? voidOrder(siteId, orderId)
          : Promise.resolve(),
    ),
  );
  ctx.hooks.on('shop.order.refunded', ({ orderId, refundId, amount }, { siteId }) =>
    safely('refund', async () => {
      const settings = await settingsOf(siteId);
      if (!settings.enabled || !settings.commit) return;
      const doc = await ctx.storage.get<Doc>(siteId, docKey(orderId));
      if (!doc || doc.state !== 'committed') return;
      const shop = await shopOf(siteId);
      const detail = shop ? await shop.order(siteId, orderId) : null;
      const ava = await clientOf(siteId, settings);
      if (!detail || !ava) return;
      const model = refundModel(doc.code, refundId, Number(amount), Number(detail.order.total));
      await timed(siteId, settings, 'refund', `#${doc.code}`, () =>
        ava.refund(settings.companyCode, doc.code, model),
      );
      await ctx.storage.set(siteId, docKey(orderId), {
        ...doc,
        refunded: doc.refunded + Number(amount),
      } satisfies Doc);
    }),
  );

  // ---- Admin ----------------------------------------------------------------------------------

  const api = (
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    handler: (
      siteId: string,
      body: Record<string, unknown>,
    ) => Promise<{ status?: number; body: unknown }>,
  ) =>
    ctx.routes.api({
      method,
      path,
      capability: CAPABILITY,
      handler: (request) =>
        handler(request.siteId, (request.body ?? {}) as Record<string, unknown>),
    });

  // The settings; the account and the key are written, never read back.
  const view = async (siteId: string) => {
    const keys = await credentials(siteId);
    return {
      ...(await settingsOf(siteId)),
      hasAccount: Boolean(await ctx.secrets.get(siteId, 'accountId')),
      hasKey: Boolean(keys),
      shop: Boolean(await shopOf(siteId)),
    };
  };
  api('GET', '/settings', async (siteId) => ({ body: await view(siteId) }));
  api('PUT', '/settings', async (siteId, body) => {
    const settings = cleanSettings(body);
    await ctx.storage.set(siteId, 'settings', settings);
    const account = typeof body.accountId === 'string' ? body.accountId.trim() : '';
    const key = typeof body.licenseKey === 'string' ? body.licenseKey.trim() : '';
    if (account) await ctx.secrets.set(siteId, 'accountId', account.slice(0, 40));
    if (key) await ctx.secrets.set(siteId, 'licenseKey', key.slice(0, 100));
    cache.clear();
    checked.clear();
    return { body: await view(siteId) };
  });

  // The connection: the account, the company and where it has nexus. Nothing is saved in Avalara.
  api('POST', '/test', async (siteId) => {
    const settings = await settingsOf(siteId);
    const ava = await clientOf(siteId, settings);
    if (!ava)
      return {
        status: 400,
        body: { detail: 'Save the account number and the license key first.' },
      };
    try {
      const ping = await timed(siteId, settings, 'ping', settings.environment, () => ava.ping());
      if (!ping.authenticated)
        return {
          status: 400,
          body: { detail: 'Avalara did not accept the account number or the license key.' },
        };
      const company = settings.companyCode
        ? await timed(siteId, settings, 'company', settings.companyCode, () =>
            ava.company(settings.companyCode),
          )
        : null;
      const nexus = company
        ? await timed(siteId, settings, 'nexus', settings.companyCode, () => ava.nexus(company.id))
        : [];
      return {
        body: {
          authenticated: true,
          environment: settings.environment,
          company: company
            ? { id: company.id, name: company.name, code: company.companyCode }
            : null,
          nexus: [
            ...new Set(nexus.map((n) => [n.country, n.region].filter(Boolean).join('-'))),
          ].sort(),
        },
      };
    } catch (error) {
      return {
        status: 502,
        body: { detail: error instanceof Error ? error.message : String(error) },
      };
    }
  });

  api('GET', '/log', async (siteId) => ({
    body: ((await ctx.storage.get<LogEntry[]>(siteId, 'log')) ?? []).slice().reverse(),
  }));
  api('DELETE', '/log', async (siteId) => {
    await ctx.storage.delete(siteId, 'log');
    return { body: { ok: true } };
  });
}

export default definePlugin({
  setup(ctx: PluginContext) {
    setupAvatax(ctx);
  },
});
