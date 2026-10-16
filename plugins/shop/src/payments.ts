import { z } from 'zod';

/**
 * Ways to pay (WooCommerce's payment gateways): bank transfer in advance and
 * cash on delivery for now, each switched on, ordered and set up in Shop →
 * Payments. Stored in the plugin's storage under `payments`.
 */

export const PAYMENTS_STORAGE = 'payments';
export const PAYMENT_IDS = ['bacs', 'cod'] as const;
export type PaymentId = (typeof PAYMENT_IDS)[number];

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
};

export const paymentsSchema = z.object({
  /** The order at checkout. */
  order: z.array(z.enum(PAYMENT_IDS)).default([...PAYMENT_IDS]),
  bacs: z
    .object({ ...common, accounts: z.array(bankAccountSchema).max(10).default([]) })
    .default({ enabled: false, title: '', description: '', instructions: '', accounts: [] }),
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
      enabled: false,
      title: '',
      description: '',
      instructions: '',
      fee: '',
      feeTaxable: true,
      shippingMethods: [],
      virtual: false,
    }),
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
}

/** The ways to pay this cart, in the shop's order. */
export function availablePayments(payments: Payments, cart: PaymentContext): PaymentId[] {
  return payments.order.filter((id) => {
    if (!payments[id].enabled) return false;
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
