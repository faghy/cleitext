import { afterEach, describe, expect, it } from 'vitest';
import {
  newsletterCheckbox,
  newsletterSubscribe,
  newsletterTicked,
  type OptInCheckbox,
} from './newsletter-optin';
import { checkoutPage, emptyAddress, moneyFormatter, type CheckoutValues } from './pages';
import { translator } from './strings';
import { computeTotals } from './totals';

const KEY = Symbol.for('cleitext.newsletter.optIn');
const holder = globalThis as unknown as Record<symbol, unknown>;
afterEach(() => {
  delete holder[KEY];
});

const values = (extra: Partial<CheckoutValues> = {}): CheckoutValues => ({
  email: 'ada@example.com',
  billing: { ...emptyAddress(), firstName: 'Ada', lastName: 'Lovelace' },
  shipping: emptyAddress(),
  differentShipping: false,
  wantsInvoice: false,
  invoice: { taxCode: '', vatNumber: '', sdi: '', pec: '' },
  note: '',
  payment: '',
  rate: '',
  terms: false,
  ...extra,
});

function checkout(newsletter: OptInCheckbox | null, ticked = false): string {
  return checkoutPage({
    values: values({ newsletter: ticked }),
    errors: {},
    lines: [],
    totals: computeTotals({ lines: [], pricesIncludeTax: true, rates: {} }),
    t: translator('en'),
    money: moneyFormatter('en', 'EUR'),
    urls: { cart: '/cart', checkout: '/checkout', product: () => '/p', shop: '/shop' },
    locale: 'en',
    includeTax: true,
    payments: [],
    termsUrl: '/terms',
    phoneRequired: false,
    coupons: [],
    needsShipping: false,
    shippingSetUp: false,
    rates: [],
    rate: null,
    newsletter,
  });
}

describe('the newsletter opt-in at the checkout', () => {
  it('shows no box unless the Newsletter plugin offers one', () => {
    expect(checkout(null)).not.toContain('cx_newsletter');
  });

  it('shows the box unchecked, and keeps it ticked when the page comes back', () => {
    const box = { name: 'cx_newsletter', label: 'Subscribe me to the <newsletter>' };
    const page = checkout(box);
    expect(page).toMatch(/<input\s+type="checkbox"\s+name="cx_newsletter"\s+value="1"\s*\/>/);
    expect(page).toContain('Subscribe me to the &lt;newsletter&gt;');
    expect(checkout(box, true)).toMatch(/name="cx_newsletter"\s+value="1"\s+checked/);
  });

  it('asks the registry, and never fails when it is missing or broken', async () => {
    expect(await newsletterCheckbox({ siteId: 's', locale: 'en', source: 'shop' })).toBeNull();
    await newsletterSubscribe({ siteId: 's', source: 'shop', email: 'a@b.c', locale: 'en' });
    const subscribed: unknown[] = [];
    holder[KEY] = {
      version: 1,
      checkbox: async (input: { source: string }) =>
        input.source === 'shop' ? { name: 'cx_newsletter', label: 'Yes' } : null,
      subscribe: async (input: unknown) => void subscribed.push(input),
    };
    expect(await newsletterCheckbox({ siteId: 's', locale: 'en', source: 'shop' })).toEqual({
      name: 'cx_newsletter',
      label: 'Yes',
    });
    await newsletterSubscribe({ siteId: 's', source: 'shop', email: 'a@b.c', locale: 'en' });
    expect(subscribed).toHaveLength(1);
    holder[KEY] = {
      version: 1,
      checkbox: async () => {
        throw new Error('down');
      },
      subscribe: async () => {
        throw new Error('down');
      },
    };
    expect(await newsletterCheckbox({ siteId: 's', locale: 'en', source: 'shop' })).toBeNull();
    await expect(
      newsletterSubscribe({ siteId: 's', source: 'shop', email: 'a@b.c', locale: 'en' }),
    ).resolves.toBeUndefined();
    // Another version of the registry is not used.
    holder[KEY] = { version: 2 };
    expect(await newsletterCheckbox({ siteId: 's', locale: 'en', source: 'shop' })).toBeNull();
  });

  it('counts only a ticked box', () => {
    expect(newsletterTicked('1')).toBe(true);
    expect(newsletterTicked(true)).toBe(true);
    expect(newsletterTicked('')).toBe(false);
    expect(newsletterTicked(undefined)).toBe(false);
    expect(newsletterTicked('0')).toBe(false);
  });
});
