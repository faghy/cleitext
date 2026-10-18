import { describe, expect, it } from 'vitest';
import { buildSchema, faq, faqItem, schemaJson } from '../src/blocks/faq';
import type { SpectraSource } from '../src/lib/types';
import { renderBlock, text } from './render';

function source(
  html: string,
  children: SpectraSource['children'] = [],
  found: Record<string, string> = {},
): SpectraSource {
  return {
    html,
    children,
    block: (n, a, c) => ({
      id: 'x',
      type: `prisma/${n}`,
      v: 1,
      attrs: a,
      ...(c ? { children: c } : {}),
    }),
    rich: (h) => [{ text: h.replace(/<[^>]+>/g, '') }],
    inner: () => '',
    innerAny: (className) => found[className] ?? '',
  };
}

describe('faq', () => {
  it('draws the block with its settings as classes and the schema, safely', () => {
    const schema = buildSchema([
      { question: text('Is it </script><b>safe</b>?'), answer: 'Yes &amp; <em>always</em>' },
    ]);
    const { html } = renderBlock(
      faq,
      { enableSchemaSupport: true, schema, expandFirstItem: true, iconAlign: 'row-reverse' },
      { children: '<i>items</i>' },
    );
    expect(html).toContain(
      'class="wp-block-prisma-faq pr-faq pr-block-test0001 pr-faq--icon-row-reverse pr-faq--layout-accordion pr-faq--expand-first-true pr-faq--inactive-other-true pr-faq--toggle pr-faq--equal-height"',
    );
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).not.toContain('</script><b>');
    expect(html).toContain('\\u003c/script\\u003e');
    const json = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)![1]!;
    expect(JSON.parse(json)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Is it </script><b>safe</b>?',
          acceptedAnswer: { '@type': 'Answer', text: 'Yes & always' },
        },
      ],
    });
    expect(renderBlock(faq, { schema }).html).not.toContain('ld+json');
    expect(schemaJson('not json')).toBe('');
  });

  it('writes the box, question, answer and accordion CSS', () => {
    const { css } = renderBlock(faq, {
      questionTextColor: '#111',
      questionTextActiveColor: '#f00',
      vquestionPaddingDesktop: 20,
      rowsGapMobile: 4,
      expandFirstItem: true,
      enableSeparator: true,
      overallBorderTopWidth: 2,
      overallBorderColor: '#ccc',
    });
    const B = '.pr-block-test0001';
    expect(css).toContain(
      `${B} .pr-faq-item__icon svg{width:12px;height:12px;font-size:12px;fill:#111}`,
    );
    expect(css).toContain(
      `${B} .pr-faq-item__icon-active svg{width:12px;height:12px;font-size:12px;fill:#f00}`,
    );
    expect(css).toContain('border-bottom-right-radius:2px;border-color:#ccc;border-style:solid');
    expect(css).toContain(
      `${B} .pr-faq-item__question{padding-top:20px;padding-bottom:20px;padding-right:10px;padding-left:10px}`,
    );
    expect(css).toContain(
      `${B}.pr-faq:not(.pr-faq--editing) .pr-faq-item .pr-faq-item__content{display:none}`,
    );
    expect(css).toContain(
      `${B}.pr-faq > .pr-faq-item:first-of-type .pr-faq-item__content{display:block}`,
    );
    expect(css).toContain('border-top-color:#ccc;border-top-width:2px');
    expect(css).toMatch(/@media \(max-width:767px\)\{[^@]*\.pr-faq-item\{margin-bottom:4px[;}]/);
  });

  it('lays a grid out by columns per device', () => {
    const { css, html } = renderBlock(faq, {
      layout: 'grid',
      columns: 3,
      tcolumns: 2,
      align: 'center',
    });
    expect(html).toContain('pr-faq--layout-grid');
    expect(css).toContain(
      '.pr-block-test0001.pr-faq.pr-faq--layout-grid{grid-template-columns:repeat(3, 1fr);grid-column-gap:10px;grid-row-gap:10px;display:grid}',
    );
    expect(css).toMatch(/976px\)\{[^@]*grid-template-columns:repeat\(2, 1fr\)/);
    expect(css).not.toContain('display:none');
    expect(css).toContain('.pr-faq--layout-grid .pr-faq-item{text-align:center}');
  });

  it('draws an item: an accessible question with both icons, and the answer', () => {
    const { html } = renderBlock(faqItem, {
      question: text('Why?'),
      answer: text('Because.'),
      headingTag: 'h3',
    });
    expect(html).toMatch(
      /^<div class="wp-block-prisma-faq-item pr-faq-item pr-block-test0001"><div class="pr-faq-item__question" role="button" tabindex="0" aria-expanded="false" data-pr-faq=""><span class="pr-faq-item__icon pr-faq-item__icon-wrap"><svg[^]*<\/span><span class="pr-faq-item__icon-active pr-faq-item__icon-wrap"><svg[^]*<\/span><h3 class="pr-faq-item__text">Why\?<\/h3><\/div><div class="pr-faq-item__content"><p>Because.<\/p><\/div><\/div>$/,
    );
    const grid = renderBlock(faqItem, { layout: 'grid', headingTag: 'script' }).html;
    expect(grid).not.toContain('role="button"');
    expect(grid).not.toContain('pr-faq-item__icon');
    expect(grid).toContain('<span class="pr-faq-item__text">What is FAQ?</span>');
  });

  it('imports Spectra FAQs: parent settings onto the items, schema and font flags', () => {
    const children = [
      { id: 'a', type: 'prisma/faq-item', v: 1, attrs: { question: [{ text: 'Q1' }], icon: 'x' } },
      { id: 'b', type: 'prisma/faq-item', v: 1, attrs: { answer: [{ text: 'A2' }] } },
    ];
    const [out] = faq.spectra!['uagb/faq']!(
      { icon: 'angle-down', headingTag: 'h4', questionloadGoogleFonts: true },
      source('', children),
    );
    expect(out!.attrs).toMatchObject({ questionLoadGoogleFonts: true });
    expect(out!.attrs).not.toHaveProperty('questionloadGoogleFonts');
    expect(out!.children!.map((c) => c.attrs)).toEqual([
      {
        question: [{ text: 'Q1' }],
        icon: 'angle-down',
        iconActive: 'minus',
        headingTag: 'h4',
        layout: 'accordion',
      },
      {
        answer: [{ text: 'A2' }],
        icon: 'angle-down',
        iconActive: 'minus',
        headingTag: 'h4',
        layout: 'accordion',
      },
    ]);
    const schema = JSON.parse(String(out!.attrs.schema));
    expect(schema.mainEntity.map((q: { name: string }) => q.name)).toEqual(['Q1', 'What is FAQ?']);
  });

  it('imports an item from its attributes or from older saved markup', () => {
    const [fromAttrs] = faqItem.spectra!['uagb/faq-child']!(
      { question: 'Q <b>bold</b>', answer: 'A' },
      source(''),
    );
    expect(fromAttrs!.attrs).toEqual({ question: 'Q <b>bold</b>', answer: 'A' });
    const [fromHtml] = faqItem.spectra!['uagb/faq-child']!(
      {},
      source('<div></div>', [], {
        'uagb-question': 'Old Q',
        'uagb-faq-content': '<span><p>Old A</p></span>',
      }),
    );
    expect(fromHtml!.attrs).toEqual({ question: 'Old Q', answer: 'Old A' });
  });
});
