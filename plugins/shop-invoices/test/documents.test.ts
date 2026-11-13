import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { drawInvoice, drawPackingSlip, type OrderData } from '../src/pdf/documents';
import { PdfDocument } from '../src/pdf/writer';
import { formatNumber, counterOf } from '../src/numbering';
import { cleanSettings, wooInvoice } from '../src/settings';

const address = {
  firstName: 'Mario',
  lastName: 'Rossi',
  company: 'Rossi Srl',
  address1: 'Via Garibaldi 12',
  city: 'Varazze',
  postcode: '17019',
  province: 'SV',
  country: 'IT',
};

export function sample(lines = 3): OrderData {
  return {
    order: {
      number: 1042,
      createdAt: '2026-11-10T10:00:00Z',
      currency: 'EUR',
      locale: 'it',
      email: 'mario@example.com',
      billing: address,
      shipping: { ...address, address1: 'Corso Italia 3' },
      invoice: { taxCode: 'RSSMRA80A01H501U', vatNumber: 'IT01234567890', sdiCode: 'ABC1234' },
      paymentTitle: 'Carta di credito',
      shippingMethod: 'Corriere espresso',
      subtotal: '100.00',
      discountTotal: '10.00',
      shippingTotal: '8.00',
      shippingTax: '1.76',
      feeTotal: '0',
      taxTotal: '21.56',
      total: '119.56',
      taxes: [{ rate: 22, amount: '21.56' }],
      customerNote: 'Consegnare al portiere, grazie. È un regalo: niente prezzi nel pacco.',
    },
    items: Array.from({ length: lines }, (_, i) => ({
      kind: 'product',
      name:
        i === 0
          ? 'Maglietta in cotone biologico «Riviera» con stampa a mano, edizione limitata autunno'
          : `Prodotto ${i + 1}`,
      sku: `SKU-${i + 1}`,
      quantity: i + 1,
      total: (25 * (i + 1)).toFixed(2),
      tax: '0',
      attributes: i === 0 ? [{ name: 'Taglia', value: 'M' }] : [],
    })),
  };
}

const shop = {
  name: 'Bottega di prova',
  address: 'Via Roma 1\n17019 Varazze (SV)\ninfo@example.com',
  taxId: 'P. IVA 01234567890',
  footer: 'IBAN IT00 X000 0000 0000 0000 0000 000',
};

const text = (pdf: Buffer) => {
  const dir = mkdtempSync(join(tmpdir(), 'inv-'));
  const file = join(dir, 'doc.pdf');
  writeFileSync(file, pdf);
  return {
    text: execFileSync('pdftotext', ['-layout', file, '-']).toString(),
    pages: Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file]).toString())?.[1]),
    file,
  };
};

const tools = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('documents', () => {
  it('draws an invoice in the order’s language, with taxes and the Italian tax data', () => {
    const doc = new PdfDocument({ title: 'Invoice' });
    drawInvoice(doc, sample(), shop, { number: 'FT-2026/0007', date: new Date('2026-11-11') });
    expect(doc.pageCount).toBe(1);
    const pdf = doc.toBuffer();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    if (!tools) return;
    const { text: out } = text(pdf);
    for (const s of [
      'Fattura',
      'FT-2026/0007',
      'Numero ordine',
      '1042',
      'Partita IVA: IT01234567890',
      'Codice SDI',
      'Imposte 22%',
      '119,56',
      'Consegnare al portiere',
      'IBAN',
    ]) {
      expect(out).toContain(s);
    }
  });

  it('goes on more pages with many lines, numbering them', () => {
    const doc = new PdfDocument({ title: 'Invoice' });
    drawInvoice(doc, sample(60), shop, { number: '8', date: new Date('2026-11-11') });
    expect(doc.pageCount).toBeGreaterThan(1);
    if (!tools) return;
    const { text: out, pages } = text(doc.toBuffer());
    expect(pages).toBe(doc.pageCount);
    expect(out).toContain(`Pagina 1 di ${pages}`);
  });

  it('puts several documents in one file, and the packing slip has no prices', () => {
    const doc = new PdfDocument({ title: 'Packing slip' });
    drawPackingSlip(doc, sample(), shop);
    drawPackingSlip(doc, { ...sample(), order: { ...sample().order, locale: 'en' } }, shop);
    expect(doc.pageCount).toBe(2);
    if (!tools) return;
    const { text: out } = text(doc.toBuffer());
    expect(out).toContain('Documento di trasporto');
    expect(out).toContain('Packing slip');
    expect(out).toContain('Corso Italia 3');
    expect(out).not.toContain('119,56');
  });
});

describe('numbering and settings', () => {
  it('formats numbers with the year, padding and counters', () => {
    const date = new Date('2026-03-01');
    expect(
      formatNumber(7, { prefix: 'FT-{year}/', suffix: '', padding: 4, yearlyReset: true }, date),
    ).toBe('FT-2026/0007');
    expect(counterOf({ prefix: '', suffix: '', padding: 0, yearlyReset: true }, date)).toBe(
      'y2026',
    );
    expect(counterOf({ prefix: '', suffix: '', padding: 0, yearlyReset: false }, date)).toBe('all');
  });

  it('cleans the settings', () => {
    const s = cleanSettings({
      createOn: ['completed', 'nope'],
      logo: 'javascript:x',
      numbering: { padding: 99 },
    });
    expect(s.createOn).toEqual(['completed']);
    expect(s.logo).toBe('');
    expect(s.numbering.padding).toBe(10);
    expect(cleanSettings(null).attachTo).toEqual(['customer_processing', 'customer_completed']);
  });

  it('reads the WooCommerce PDF Invoices data', () => {
    expect(
      wooInvoice({
        _wcpdf_invoice_number: '125',
        _wcpdf_invoice_date: '1767225600',
        _wcpdf_invoice_number_data: { number: 125, formatted_number: 'INV-125' },
      }),
    ).toEqual({ number: 125, formatted: 'INV-125', date: new Date(1767225600 * 1000) });
    expect(wooInvoice({})).toBeNull();
    expect(
      wooInvoice({ _wcpdf_invoice_number: '3', _wcpdf_invoice_date: '2025-02-01T00:00:00Z' })
        ?.formatted,
    ).toBe('3');
  });
});

describe('paper and tax names', () => {
  it('draws on Letter paper and names taxes as the order does', () => {
    const doc = new PdfDocument({ title: 'Invoice', paper: 'Letter' });
    const data = sample();
    data.order.taxes = [{ rate: 6.25, amount: '5.00', label: 'Texas State Tax' }];
    drawInvoice(doc, data, shop, { number: '9', date: new Date('2026-11-11') });
    expect(doc.width).toBe(612);
    expect(doc.toBuffer().toString('latin1')).toContain('/MediaBox [0 0 612 792]');
    if (!tools) return;
    expect(text(doc.toBuffer()).text).toContain('Texas State Tax');
  });
});
