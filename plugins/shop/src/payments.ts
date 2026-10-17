import { z } from 'zod';
import { localize, textsSchema } from './texts';

/**
 * Ways to pay (WooCommerce's payment gateways): bank transfer in advance,
 * cash on delivery, cards with Stripe and PayPal, each switched on, ordered
 * and set up in Shop → Payments. Stored in the plugin's storage under
 * `payments`; the providers' secret keys in the plugin's secrets.
 */

export const PAYMENTS_STORAGE = 'payments';
export const PAYMENT_IDS = ['bacs', 'cod', 'stripe', 'paypal'] as const;
export type PaymentId = (typeof PAYMENT_IDS)[number];
/** Paid on the provider's pages: the order waits as pending until it confirms. */
export const ONLINE: readonly PaymentId[] = ['stripe', 'paypal'];

/** Names of the secrets, set from Shop → Payments and never shown again. */
export const SECRETS = {
  stripeSecretKey: 'stripe-secret-key',
  stripeWebhookSecret: 'stripe-webhook-secret',
  paypalSecret: 'paypal-secret',
} as const;
export type SecretName = keyof typeof SECRETS;

const text = (max: number) => z.string().trim().max(max).default('');
const amount = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim().replace(',', '.'))
  .refine((v) => v === '' || /^\d{1,6}(\.\d{1,2})?$/.test(v), 'Not an amount');

export const bankAccountSchema = z.object({
  accountName: text(200),
  bankName: text(200),
  iban: z
    .string()
    .trim()
    .max(60)
    .transform((v) => v.replace(/\s+/g, ' ').toUpperCase())
    .default(''),
  bic: z
    .string()
    .trim()
    .max(20)
    .transform((v) => v.toUpperCase())
    .default(''),
});
export type BankAccount = z.output<typeof bankAccountSchema>;

const common = {
  enabled: z.boolean().default(false),
  /** What customers see at checkout; empty: the default, in their language. */
  title: text(120),
  /** Under the title at checkout. */
  description: text(1000),
  /** On the order page and in the emails. */
  instructions: text(2000),
  /** Title, description and instructions in other languages: `{ it: { title } }`. */
  translations: textsSchema,
};

const off = { enabled: false, title: '', description: '', instructions: '', translations: {} };

export const paymentsSchema = z.object({
  /** The order at checkout. */
  order: z.array(z.enum(PAYMENT_IDS)).default([...PAYMENT_IDS]),
  /** Unpaid online orders are cancelled after this long, giving their stock back. */
  holdMinutes: z.number().int().min(10).max(10_080).default(60),
  bacs: z
    .object({ ...common, accounts: z.array(bankAccountSchema).max(10).default([]) })
    .default({ ...off, accounts: [] }),
  cod: z
    .object({
      ...common,
      /** Added to orders paid this way, as prices are entered. */
      fee: amount.default(''),
      feeTaxable: z.boolean().default(true),
      /** Shipping methods (ids) it is offered with; empty: all. */
      shippingMethods: z.array(z.string().max(40)).max(100).default([]),
      /** Offered for orders with only virtual products (nothing to deliver). */
      virtual: z.boolean().default(false),
    })
    .default({
      ...off,
      fee: '',
      feeTaxable: true,
      shippingMethods: [],
      virtual: false,
    }),
  stripe: z.object({ ...common }).default(off),
  paypal: z
    .object({
      ...common,
      /** PayPal's sandbox, for trying it out. */
      sandbox: z.boolean().default(false),
      clientId: text(200),
      /** The webhook's id in PayPal, to check its notifications. */
      webhookId: text(100),
    })
    .default({ ...off, sandbox: false, clientId: '', webhookId: '' }),
});
export type Payments = z.output<typeof paymentsSchema>;

/** The payments from before Shop → Payments, when they were plain settings. */
export function legacyPayments(values: Record<string, unknown>): Payments {
  const str = (name: string) => (typeof values[name] === 'string' ? (values[name] as string) : '');
  const account = {
    accountName: str('bankAccountName'),
    bankName: str('bankName'),
    iban: str('bankIban'),
    bic: str('bankBic'),
  };
  return paymentsSchema.parse({
    bacs: {
      enabled: values.bankEnabled !== false,
      description: str('bankInstructions'),
      instructions: str('bankInstructions'),
      accounts: Object.values(account).some(Boolean) ? [account] : [],
    },
    cod: {
      enabled: values.codEnabled === true,
      instructions: str('codInstructions'),
      description: str('codInstructions'),
      fee: /^\d{1,6}([.,]\d{1,2})?$/.test(str('codFee').trim()) ? str('codFee') : '',
    },
  });
}

export interface PaymentContext {
  /** Something in the cart is shipped. */
  needsShipping: boolean;
  /** The shipping rate chosen, if any. */
  rateId: string | null;
  /** Online methods with their keys set (the others cannot take payments). */
  ready?: Partial<Record<PaymentId, boolean>>;
}

/** The ways to pay this cart, in the shop's order. */
export function availablePayments(payments: Payments, cart: PaymentContext): PaymentId[] {
  return payments.order.filter((id) => {
    if (!payments[id].enabled) return false;
    if (ONLINE.includes(id) && !cart.ready?.[id]) return false;
    if (id === 'cod') {
      const cod = payments.cod;
      if (!cart.needsShipping) return cod.virtual;
      if (
        cod.shippingMethods.length &&
        (!cart.rateId || !cod.shippingMethods.includes(cart.rateId))
      )
        return false;
    }
    return true;
  });
}

/** The ways to pay with their texts in a language (the customer's, or an order's). */
export function localizePayments(payments: Payments, locale: string): Payments {
  return {
    ...payments,
    bacs: localize(payments.bacs, payments.bacs.translations, locale),
    cod: localize(payments.cod, payments.cod.translations, locale),
    stripe: localize(payments.stripe, payments.stripe.translations, locale),
    paypal: localize(payments.paypal, payments.paypal.translations, locale),
  };
}
