import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IT } from '../src/admin/it';
import { NAME, SLUG } from '../src/config';
import { csvCell, toCsv } from '../src/model/csv';
import { emailText } from '../src/model/emails';
import { formatMoney, fromCents, toCents } from '../src/model/money';
import {
  attribute,
  codeFrom,
  commissionFor,
  earnings,
  freeCode,
  isDue,
  reversalPlan,
  sourceCounts,
  toPay,
  type AffiliateLite,
} from '../src/model/rules';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/model/settings';
import { stringsFor } from '../src/model/strings';
import { cleanIban, cleanWebsite, field } from '../src/model/validate';

const anna: AffiliateLite = {
  id: 'a1',
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'anna@example.test',
  code: 'anna',
  status: 'active',
  rate: null,
};

const order = (changes: Record<string, unknown> = {}) => ({
  source: 'shop',
  kind: 'order' as const,
  id: 'o1',
  amount: '61.00',
  currency: 'EUR',
  customer: { email: 'bob@example.test', userId: null },
  items: [
    { id: 'p1', name: 'Mug', amount: '40.00' },
    { id: 'p2', name: 'Cap', amount: '10.50' },
  ],
  at: '2026-10-01T10:00:00.000Z',
  referrals: { passaparola: 'anna' },
  ...changes,
});

describe('names', () => {
  it('match the manifest', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../cleitext.plugin.json', import.meta.url), 'utf8'),
    ) as { slug: string; name: string; capabilities: string[] };
    expect(manifest.slug).toBe(SLUG);
    expect(manifest.name).toBe(NAME.en);
    expect(manifest.capabilities).toEqual([`manage_${SLUG}`]);
  });

  it('has every public text in Italian, and the admin’s too', () => {
    expect(Object.keys(stringsFor('it')).sort()).toEqual(Object.keys(stringsFor('en')).sort());
    const admin = readFileSync(new URL('../src/admin.tsx', import.meta.url), 'utf8');
    const used = [...admin.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)]
      .map((m) => m[1]!)
      .filter((key) => /[A-Z ]/.test(key));
    for (const key of used) expect(IT[key], key).toBeTruthy();
  });
});

describe('codes', () => {
  it('are made from names, lowercase without accents', () => {
    expect(codeFrom('Anna Maria Rossì')).toBe('anna-maria-rossi');
    expect(codeFrom('  --Bob!! ')).toBe('bob');
    expect(codeFrom('x')).toBe('');
    expect(codeFrom('a'.repeat(40))).toHaveLength(32);
  });

  it('take the next free one', () => {
    const taken = new Set(['anna', 'anna-2']);
    expect(freeCode('Anna', (c) => taken.has(c))).toBe('anna-3');
    expect(freeCode('', () => false)).toBe('partner');
  });
});

describe('attribution', () => {
  it('credits an active affiliate’s code from the source that counts', () => {
    expect(attribute(order(), SLUG, true, anna)).toEqual({ ok: true, affiliate: anna });
  });

  it('refuses other sources, missing codes, unknown or inactive affiliates', () => {
    expect(attribute(order(), SLUG, false, anna)).toEqual({ ok: false, reason: 'source' });
    expect(attribute(order({ referrals: {} }), SLUG, true, anna)).toMatchObject({
      reason: 'no-code',
    });
    expect(attribute(order(), SLUG, true, null)).toMatchObject({ reason: 'unknown' });
    expect(attribute(order(), SLUG, true, { ...anna, status: 'suspended' })).toMatchObject({
      reason: 'inactive',
    });
  });

  it('blocks self-referrals, by account or by email', () => {
    expect(
      attribute(order({ customer: { email: 'x@y.it', userId: anna.userId } }), SLUG, true, anna),
    ).toMatchObject({ reason: 'self' });
    expect(
      attribute(
        order({ customer: { email: 'ANNA@example.test', userId: null } }),
        SLUG,
        true,
        anna,
      ),
    ).toMatchObject({ reason: 'self' });
  });

  it('counts one source in the free version, every one with Pro', () => {
    const settings = { ...DEFAULT_SETTINGS, source: 'agenda' as const };
    expect(sourceCounts('agenda', settings, false)).toBe(true);
    expect(sourceCounts('shop', settings, false)).toBe(false);
    expect(sourceCounts('shop', settings, true)).toBe(true);
  });
});

describe('commissions', () => {
  it('in percent of the items (products without shipping), or of the amount', () => {
    expect(commissionFor(order(), DEFAULT_SETTINGS, anna)).toEqual({
      cents: 505,
      currency: 'EUR',
      base: 5050,
    });
    expect(commissionFor(order({ items: [] }), DEFAULT_SETTINGS, anna).cents).toBe(610);
  });

  it('fixed per conversion, also for leads of amount 0', () => {
    const fixed = { ...DEFAULT_SETTINGS, commissionType: 'fixed' as const, commissionValue: 5 };
    expect(commissionFor({ amount: '0', currency: '', items: [] }, fixed, anna)).toEqual({
      cents: 500,
      currency: 'EUR',
      base: 0,
    });
    expect(
      commissionFor({ amount: '0', currency: '', items: [] }, DEFAULT_SETTINGS, anna).cents,
    ).toBe(0);
  });

  it('uses the affiliate’s own rate', () => {
    expect(commissionFor(order(), DEFAULT_SETTINGS, { rate: 20 }).cents).toBe(1010);
  });
});

describe('refunds and cancellations', () => {
  const pending = {
    status: 'pending' as const,
    amountCents: 600,
    originalCents: 600,
    adjustedCents: 0,
    conversionCents: 6000,
    reversedCents: 0,
  };

  it('reject a commission not paid yet when all is given back', () => {
    expect(reversalPlan(pending, null)).toMatchObject({
      status: 'rejected',
      reversedCents: 6000,
      adjustmentCents: 0,
    });
    expect(reversalPlan({ ...pending, status: 'approved' }, 6000).status).toBe('rejected');
  });

  it('shrink it in proportion to a partial refund', () => {
    const half = reversalPlan(pending, 3000);
    expect(half).toMatchObject({ status: 'pending', amountCents: 300, reversedCents: 3000 });
    const rest = reversalPlan({ ...pending, ...half }, 1500);
    expect(rest).toMatchObject({ amountCents: 150, reversedCents: 4500 });
    // More than what is left: everything left.
    expect(reversalPlan({ ...pending, ...rest }, 99_999).status).toBe('rejected');
  });

  it('take back a paid commission with a negative adjustment', () => {
    const paid = { ...pending, status: 'paid' as const };
    const part = reversalPlan(paid, 1500);
    expect(part).toMatchObject({
      status: 'paid',
      amountCents: 600,
      adjustmentCents: -150,
      adjustedCents: -150,
    });
    const all = reversalPlan({ ...paid, ...part }, null);
    expect(all).toMatchObject({ adjustmentCents: -450, adjustedCents: -600 });
    // Nothing left to take back.
    expect(reversalPlan({ ...paid, ...all }, null).adjustmentCents).toBe(0);
  });

  it('a lead (amount 0) is reversed whole', () => {
    expect(reversalPlan({ ...pending, conversionCents: 0 }, null).status).toBe('rejected');
  });
});

describe('approval and payouts', () => {
  it('approves after the refund window', () => {
    const now = new Date('2026-10-31T00:00:00Z');
    expect(isDue(new Date('2026-10-01T00:00:00Z'), 30, now)).toBe(true);
    expect(isDue(new Date('2026-10-02T00:00:00Z'), 30, now)).toBe(false);
    expect(isDue(now, 0, now)).toBe(true);
  });

  it('groups what is to pay by affiliate and currency, with the threshold', () => {
    const lines = toPay(
      [
        { affiliateId: 'a', currency: 'EUR', amountCents: 4000 },
        { affiliateId: 'a', currency: 'EUR', amountCents: 2000 },
        { affiliateId: 'a', currency: 'EUR', amountCents: -500 },
        { affiliateId: 'b', currency: 'EUR', amountCents: 1000 },
        { affiliateId: 'a', currency: 'USD', amountCents: 9000 },
      ],
      5000,
    );
    expect(lines).toEqual([
      { affiliateId: 'a', currency: 'USD', amountCents: 9000, count: 1, due: true },
      { affiliateId: 'a', currency: 'EUR', amountCents: 5500, count: 3, due: true },
      { affiliateId: 'b', currency: 'EUR', amountCents: 1000, count: 1, due: false },
    ]);
  });

  it('sums earnings by status, without rejected ones', () => {
    expect(
      earnings([
        { status: 'pending', amountCents: 100 },
        { status: 'approved', amountCents: 200 },
        { status: 'approved', amountCents: -50 },
        { status: 'paid', amountCents: 300 },
        { status: 'rejected', amountCents: 999 },
      ]),
    ).toEqual({ pending: 100, approved: 150, paid: 300 });
  });
});

describe('payouts CSV', () => {
  it('quotes, keeps accents and defuses formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell(null)).toBe('');
    const csv = toCsv(['name', 'amount'], [['Anna Rossì', '55.00']]);
    expect(csv).toBe('﻿name,amount\r\nAnna Rossì,55.00\r\n');
  });
});

describe('money', () => {
  it('converts decimals and cents', () => {
    expect(toCents('49.90')).toBe(4990);
    expect(toCents('49,9')).toBe(4990);
    expect(toCents('x')).toBe(0);
    expect(fromCents(4990)).toBe('49.90');
    expect(fromCents(-150)).toBe('-1.50');
    expect(formatMoney(4990, 'EUR', 'it')).toMatch(/49,90/);
    expect(formatMoney(4990, '', 'it')).toBe('49.90');
  });
});

describe('settings', () => {
  it('fills defaults and refuses invalid values', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = normalizeSettings({
      param: 'Page',
      cookieDays: 900,
      category: 'necessary',
      commissionValue: '150',
      currency: 'usd',
      termsUrl: 'javascript:alert(1)',
      source: 'agenda',
      notifyEmail: 'a@b.it, nope; c@d.it',
      emails: { referral: false },
    });
    expect(s).toMatchObject({
      param: 'ref',
      cookieDays: 365,
      category: 'marketing',
      commissionValue: 100,
      currency: 'USD',
      termsUrl: '',
      source: 'agenda',
      notifyEmail: 'a@b.it, c@d.it',
      emails: { application: true, approved: true, referral: false, payout: true },
    });
    expect(normalizeSettings({ param: 'via', termsUrl: '/terms' })).toMatchObject({
      param: 'via',
      termsUrl: '/terms',
    });
  });
});

describe('what affiliates write', () => {
  it('checks IBANs', () => {
    expect(cleanIban('it60 x054 2811 1010 0000 0123 456')).toBe('IT60X0542811101000000123456');
    expect(cleanIban('IT61X0542811101000000123456')).toBeNull();
    expect(cleanIban('hello')).toBeNull();
  });

  it('cleans web addresses and text', () => {
    expect(cleanWebsite('instagram.com/anna')).toBe('https://instagram.com/anna');
    expect(cleanWebsite('javascript:alert(1)')).toBe('');
    expect(field('  a\u0000b  ', 10)).toBe('ab');
  });
});

describe('emails', () => {
  it('are written in the affiliate’s language', () => {
    const it_ = emailText('approved', 'it-IT', {
      site: 'Bottega',
      name: 'Anna',
      code: 'anna',
      link: 'https://bottega.test/account/affiliate',
    });
    expect(it_.subject).toBe('Bottega: benvenuto nel programma di affiliazione');
    expect(it_.text).toContain('Il tuo codice è anna');
    const en = emailText('payout', 'en', {
      site: 'Shop',
      name: 'Bob',
      amount: '€55.00',
      note: 'PayPal, October',
      link: 'x',
    });
    expect(en.subject).toBe('Shop: payment of €55.00 made');
    expect(en.text).toContain('PayPal, October');
  });
});
