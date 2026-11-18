import { describe, expect, it } from 'vitest';
import { invoicesService } from '../src/service';
import { cleanSettings } from '../src/settings';
import type { InvoiceRow } from '../src/store';

const ORDER = '0b6c1d3e-8f1a-4c2b-9d3e-1f2a3b4c5d6e';
const OTHER = '1b6c1d3e-8f1a-4c2b-9d3e-1f2a3b4c5d6e';

function fake() {
  const rows = new Map<string, InvoiceRow>();
  let last = 0;
  const service = invoicesService({
    exists: async (_s, id) => id === ORDER,
    find: async (_s, id) => rows.get(id) ?? null,
    async ensure(siteId, orderId) {
      const row: InvoiceRow = {
        siteId,
        orderId,
        number: ++last,
        counter: 'all',
        formatted: `FT-${last}`,
        date: new Date('2026-11-18T10:00:00Z'),
        imported: false,
        createdAt: new Date(),
      };
      rows.set(orderId, row);
      return row;
    },
    settings: async () =>
      cleanSettings({ shopName: 'Bottega', taxId: 'IT01234567890', createOn: ['completed'] }),
  });
  return { service, rows };
}

describe('shop-invoices service', () => {
  it('gives the invoice of an order, created once with the same number as the PDF', async () => {
    const { service } = fake();
    expect(await service.findInvoice('s', ORDER)).toBeNull();
    const first = await service.invoice('s', ORDER);
    expect(first).toEqual({
      orderId: ORDER,
      number: 1,
      formatted: 'FT-1',
      date: '2026-11-18T10:00:00.000Z',
      imported: false,
    });
    expect(await service.invoice('s', ORDER)).toEqual(first);
    expect(await service.findInvoice('s', ORDER)).toEqual(first);
  });

  it('creates nothing for an order that does not exist or a bad id', async () => {
    const { service, rows } = fake();
    expect(await service.invoice('s', OTHER)).toBeNull();
    expect(await service.invoice('s', 'nope')).toBeNull();
    expect(rows.size).toBe(0);
  });

  it('gives the seller details and the statuses that create invoices', async () => {
    const { service } = fake();
    expect(await service.seller('s')).toEqual({
      shopName: 'Bottega',
      address: '',
      taxId: 'IT01234567890',
      createOn: ['completed'],
    });
  });
});
