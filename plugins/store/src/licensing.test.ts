import { describe, expect, it } from 'vitest';
import {
  coversSlug,
  decideActivation,
  discounted,
  maskKey,
  portalRole,
  sealKey,
  seatsInUse,
  unsealKey,
} from './licensing';
import { parsePartner } from './partners-admin';
import { escapeHtml, localePrefix } from './portal';
import { latestAllowed } from './packages';

const theme = { slug: 'vitality', bundle: false, covers: null };
const plugin = { slug: 'campus', bundle: false, covers: null };
const toolkit = { slug: 'cleitext-toolkit', bundle: false, covers: null, free: true };
const agency = { slug: 'agency', bundle: true, covers: null };
const some = { slug: 'agency-themes', bundle: true, covers: ['vitality', 'zenit'] };

describe('bundles', () => {
  it('a plain license is valid for its own product only', () => {
    expect(coversSlug(theme, 'vitality', theme)).toBe(true);
    expect(coversSlug(theme, 'campus', plugin)).toBe(false);
  });

  it('a bundle of every product covers the paid products the store sells', () => {
    expect(coversSlug(agency, 'vitality', theme)).toBe(true);
    expect(coversSlug(agency, 'campus', plugin)).toBe(true);
    // Not sold here, free, or another bundle: not covered.
    expect(coversSlug(agency, 'unknown', null)).toBe(false);
    expect(coversSlug(agency, 'cleitext-toolkit', toolkit)).toBe(false);
    expect(coversSlug(agency, 'agency-themes', some)).toBe(false);
  });

  it('a bundle with a list covers that list', () => {
    expect(coversSlug(some, 'vitality', theme)).toBe(true);
    expect(coversSlug(some, 'zenit', null)).toBe(true);
    expect(coversSlug(some, 'campus', plugin)).toBe(false);
    expect(coversSlug(some, 'agency-themes', some)).toBe(true);
  });
});

describe('seats are sites', () => {
  const active = [
    { siteOrigin: 'https://a.example', productSlug: 'vitality' },
    { siteOrigin: 'https://a.example', productSlug: 'campus' },
    { siteOrigin: 'https://b.example', productSlug: null },
  ];

  it('counts each site once, whatever the products', () => {
    expect(seatsInUse(active)).toBe(2);
    expect(seatsInUse([])).toBe(0);
  });

  it('reuses the row of the same site and product (old rows: the license product)', () => {
    const input = { active, licenseSlug: 'agency', seats: 2 };
    expect(decideActivation({ ...input, origin: 'https://a.example', slug: 'campus' })).toEqual({
      kind: 'reuse',
      index: 1,
    });
    expect(decideActivation({ ...input, origin: 'https://b.example', slug: 'agency' })).toEqual({
      kind: 'reuse',
      index: 2,
    });
  });

  it('a new product on a site that holds a seat takes no seat', () => {
    expect(
      decideActivation({
        active,
        licenseSlug: 'agency',
        seats: 2,
        origin: 'https://a.example',
        slug: 'zenit',
      }),
    ).toEqual({ kind: 'add', newSeat: false });
  });

  it('a new site needs a free seat', () => {
    const input = { active, licenseSlug: 'agency', origin: 'https://c.example', slug: 'zenit' };
    expect(decideActivation({ ...input, seats: 2 })).toEqual({ kind: 'full' });
    expect(decideActivation({ ...input, seats: 3 })).toEqual({ kind: 'add', newSeat: true });
    expect(decideActivation({ ...input, seats: 0 })).toEqual({ kind: 'add', newSeat: true });
  });
});

describe('portal roles', () => {
  it('the agency manages, the customer sees, strangers get nothing', () => {
    const owned = { email: 'client@example.com', ownerEmail: 'agency@example.com' };
    expect(portalRole(owned, 'Agency@Example.com ')).toBe('manager');
    expect(portalRole(owned, 'client@example.com')).toBe('viewer');
    expect(portalRole(owned, 'someone@example.com')).toBeNull();
    expect(portalRole(owned, '')).toBeNull();
  });

  it('without an agency the customer manages it', () => {
    expect(portalRole({ email: 'buyer@example.com', ownerEmail: null }, 'buyer@example.com')).toBe(
      'manager',
    );
  });
});

describe('record keeping', () => {
  it('applies partner discounts to the cent', () => {
    expect(discounted(5900, 30)).toBe(4130);
    expect(discounted(5900, 0)).toBe(5900);
    expect(discounted(999, 33)).toBe(669);
    expect(discounted(5900, 150)).toBe(0);
  });

  it('checks partners', () => {
    expect(
      parsePartner({
        email: ' Agency@Example.com',
        name: 'DBATrade',
        discountPercent: '35',
        code: 'DBATrade',
        lsDiscountCode: 'DBA35',
      }),
    ).toEqual({
      email: 'agency@example.com',
      name: 'DBATrade',
      discountPercent: 35,
      code: 'dbatrade',
      lsDiscountCode: 'DBA35',
      note: null,
    });
    expect(parsePartner({ email: 'x', name: 'A' })).toBeNull();
    expect(parsePartner({ email: 'a@b.it', name: '' })).toBeNull();
    expect(parsePartner({ email: 'a@b.it', name: 'A', discountPercent: 101 })).toBeNull();
    expect(parsePartner({ email: 'a@b.it', name: 'A', code: 'a b' })).toBeNull();
  });
});

describe('keys in the portal', () => {
  it('are sealed with the store secret and shown masked', () => {
    const sealed = sealKey('secret-1', '7KQ2MXV9RT4HZC8PDA3WNEJB5');
    expect(sealed).not.toContain('7KQ2M');
    expect(unsealKey('secret-1', sealed)).toBe('7KQ2MXV9RT4HZC8PDA3WNEJB5');
    expect(unsealKey('secret-2', sealed)).toBeNull();
    expect(unsealKey('secret-1', null)).toBeNull();
    expect(unsealKey('secret-1', 'broken')).toBeNull();
    expect(maskKey('NEJB5')).toBe('•••••-•••••-•••••-•••••-NEJB5');
  });
});

describe('portal pages', () => {
  it('keep the language of the address', () => {
    expect(localePrefix('/it/my-licenses', 'it')).toBe('/it');
    expect(localePrefix('/my-licenses', 'en')).toBe('');
    expect(localePrefix('/my-licenses/sign-in', 'it')).toBe('');
  });

  it('escape what people typed', () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  });

  it('download the highest version within the updates of the license', () => {
    const releases = [
      { version: '1.2.0', publishedAt: '2026-03-01T00:00:00Z', assetUrl: 'a' },
      { version: '1.10.0', publishedAt: '2026-09-01T00:00:00Z', assetUrl: 'b' },
      { version: '1.9.0', publishedAt: '2026-06-01T00:00:00Z', assetUrl: 'c' },
    ];
    expect(latestAllowed(releases, null)?.version).toBe('1.10.0');
    expect(latestAllowed(releases, new Date('2026-07-01T00:00:00Z'))?.version).toBe('1.9.0');
    expect(latestAllowed(releases, new Date('2025-01-01T00:00:00Z'))).toBeNull();
  });
});
