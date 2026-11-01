import { describe, expect, it } from 'vitest';
import type { CxdBlock } from '../src/index.js';
import { diviToFresco, type DiviContext } from '../src/divi.js';
import { htmlToCxd } from '../src/html.js';

/** Synthetic Divi modules of an artist's catalog site (no client content). */
const TERMS: Record<number, { taxonomy: string; slug: string; wp: string }> = {
  24: { wp: 'project_category', taxonomy: 'project_category', slug: 'stone' },
  25: { wp: 'project_category', taxonomy: 'project_category', slug: 'bronze' },
  6: { wp: 'category', taxonomy: 'category', slug: 'news' },
};

function convert(content: string, extra: Partial<DiviContext> = {}) {
  const warnings: string[] = [];
  const ctx: DiviContext = {
    warn: (m) => warnings.push(m),
    term: (taxonomy, id) => {
      const t = TERMS[id];
      return t && (!taxonomy || t.wp === taxonomy)
        ? { taxonomy: t.taxonomy, slug: t.slug }
        : undefined;
    },
    typeSlug: (type) => (type === 'project' ? 'project' : undefined),
    locale: 'it',
    ...extra,
  };
  const blocks =
    diviToFresco(
      `[et_pb_section][et_pb_row][et_pb_column type="4_4"]${content}[/et_pb_column][/et_pb_row][/et_pb_section]`,
      ctx,
    ) ?? [];
  return { blocks, warnings };
}

function find(blocks: CxdBlock[], type: string): CxdBlock | undefined {
  for (const block of blocks) {
    if (block.type === type) return block;
    const inner = find((block.children ?? []) as CxdBlock[], type);
    if (inner) return inner;
  }
  return undefined;
}

describe('Divi loops, media and forms', () => {
  it('a filterable masonry portfolio of one category: the projects of that category', () => {
    const { blocks, warnings } = convert(
      '[et_pb_filterable_portfolio posts_number="800" include_categories="25" show_pagination="off" module_class="ds-masonry-portfolio" /]',
    );
    const loop = find(blocks, 'fresco-pro/portfolio');
    expect(loop?.attrs).toMatchObject({
      source: 'project',
      taxonomy: 'project_category',
      terms: 'bronze',
      per_page: 100,
      pagination: 'more',
      more_text: 'Carica altri',
      masonry: true,
      columns: 3,
      filter_bar: false,
    });
    expect(warnings.join(' ')).toMatch(/Fresco Pro/);
    expect(warnings.join(' ')).not.toMatch(/no Fresco counterpart/);
  });

  it('a portfolio of several categories keeps its filter bar', () => {
    const { blocks } = convert(
      '[et_pb_filterable_portfolio posts_number="12" include_categories="24,25" fullwidth="off" /]',
    );
    expect(find(blocks, 'fresco-pro/portfolio')?.attrs).toMatchObject({
      terms: 'stone,bronze',
      per_page: 12,
      pagination: 'numbers',
      filter_bar: true,
      filter_all: 'Tutte',
      columns: 4,
    });
  });

  it('the blog module: posts of its categories', () => {
    const { blocks } = convert(
      '[et_pb_blog fullwidth="off" posts_number="6" include_categories="6" show_more="on" show_author="off" show_date="off" /]',
    );
    expect(find(blocks, 'fresco-pro/posts')?.attrs).toMatchObject({
      source: 'article',
      taxonomy: 'category',
      terms: 'news',
      per_page: 6,
      columns: 3,
      read_more: 'Leggi tutto',
      show_meta: false,
    });
  });

  it('video, accordion, map, contact form and sidebar', () => {
    const { blocks, warnings } = convert(
      '[et_pb_video src="https://vimeo.com/41166141" /]' +
        '[et_pb_accordion][et_pb_accordion_item title="Uno" open="on"]Primo[/et_pb_accordion_item][et_pb_accordion_item title="Due"]Secondo[/et_pb_accordion_item][/et_pb_accordion]' +
        '[et_pb_map address="17047 Quiliano SV, Italia" zoom_level="12" /]' +
        '[et_pb_contact_form title="Scrivimi" email="info@example.com"][et_pb_contact_field field_id="Name" field_title="Nome" /][et_pb_contact_field field_id="Message" field_title="Messaggio" field_type="text" /][/et_pb_contact_form]' +
        '[et_pb_sidebar area="sidebar-1" /]',
    );
    expect(find(blocks, 'fresco/video')?.attrs).toMatchObject({
      source: 'vimeo',
      url: 'https://vimeo.com/41166141',
    });
    const accordion = find(blocks, 'fresco/accordion');
    expect(accordion?.attrs).toMatchObject({ open: 'first' });
    expect((accordion?.children ?? []).map((c) => (c as CxdBlock).attrs._title)).toEqual([
      'Uno',
      'Due',
    ]);
    expect(find(blocks, 'fresco/google-maps')?.attrs).toMatchObject({
      address: '17047 Quiliano SV, Italia',
      zoom: 12,
    });
    const form = find(blocks, 'fresco-pro/form');
    expect(form?.attrs).toMatchObject({
      email_to: 'info@example.com',
      button_text: 'Invia',
      act_email: true,
    });
    expect(
      (form?.attrs.fields as { type: string; label: string }[]).map((f) => [f.type, f.label]),
    ).toEqual([
      ['text', 'Nome'],
      ['textarea', 'Messaggio'],
    ]);
    expect(warnings.join(' ')).toMatch(/sidebars were left out/);
    expect(warnings.join(' ')).not.toMatch(/no Fresco counterpart/);
  });
});

describe('WordPress captions', () => {
  it('[caption] becomes an image with its caption and alignment', () => {
    const { blocks } = htmlToCxd(
      'Prima.\n\n[caption id="attachment_7" align="alignright" width="300"]<a href="/x"><img class="wp-image-7" src="https://old.example/a.jpg" alt="A" /></a> La didascalia[/caption]\n\nDopo.',
      { mediaRef: (id) => (id === 7 ? 'att:7' : undefined) },
    );
    expect(blocks.map((b) => b.type)).toEqual(['core/paragraph', 'core/image', 'core/paragraph']);
    expect(blocks[1]!.attrs).toMatchObject({
      id: 'att:7',
      align: 'right',
      href: '/x',
      caption: [{ text: 'La didascalia' }],
    });
  });

  it('an old caption given as an attribute, and text without a caption is untouched', () => {
    const { blocks } = htmlToCxd(
      '[caption align="aligncenter" caption="Vecchia"]<img src="https://old.example/b.jpg" alt="" />[/caption]',
    );
    expect(blocks[0]!.attrs).toMatchObject({ align: 'center', caption: [{ text: 'Vecchia' }] });
    expect(htmlToCxd('<p>[caption] senza immagine[/caption]</p>').blocks[0]!.type).toBe(
      'core/paragraph',
    );
  });
});
