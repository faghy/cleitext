import type { CxdBlock } from '@cleitext/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { container } from '../src/blocks/container';
import type { Attrs, SpectraSource } from '../src/lib/types';
import { renderBlock } from './render';

const source = (children: CxdBlock[] = []): SpectraSource => ({
  html: '',
  children,
  block: (n, a, c) => ({
    id: 'x',
    type: 'prisma/' + n,
    v: 1,
    attrs: a,
    ...(c ? { children: c } : {}),
  }),
  rich: (h) => [{ text: h.replace(/<[^>]+>/g, '') }],
  inner: () => '',
  innerAny: () => '',
});

const convert = (name: string, attrs: Attrs, children: CxdBlock[] = []): CxdBlock => {
  const importer = container.spectra?.[`uagb/${name}`];
  if (!importer) throw new Error(`no importer for ${name}`);
  const [block] = importer(attrs, source(children));
  return block!;
};

/** The CSS of each device: desktop, then the tablet and phone media queries. */
function devices(css: string): { desktop: string; tablet: string; mobile: string } {
  const [desktop = '', rest = ''] = css.split('@media (max-width:976px)');
  const [tablet = '', mobile = ''] = rest.split('@media (max-width:767px)');
  return { desktop, tablet, mobile };
}

describe('uagb/section', () => {
  it('becomes a boxed root container with its width, padding and color layer', () => {
    const block = convert('section', {
      block_id: 'a1b2',
      blockId: 'a1b2',
      width: 1000,
      tag: 'div',
      backgroundType: 'color',
      backgroundColor: '#ff0000',
      backgroundOpacity: 50,
      topPadding: 40,
      topPaddingMobile: 10,
      bottomMargin: 30,
      overallBorderStyle: 'solid',
      overallBorderTopWidth: 2,
      overallBorderColor: '#000',
      boxShadowColor: '#00000033',
      boxShadowBlur: 10,
    });
    expect(block.type).toBe('prisma/container');
    expect(block.attrs).toMatchObject({
      isBlockRootParent: true,
      contentWidth: 'default',
      htmlTag: 'div',
      widthDesktop: 1000,
      widthMobile: 1000,
      widthType: 'px',
      topPaddingDesktop: 40,
      leftPaddingDesktop: 20,
      topPaddingMobile: 10,
      bottomMarginDesktop: 30,
      backgroundType: 'color',
      backgroundColor: 'rgba(255,0,0,0.5)',
      containerBorderStyle: 'solid',
      containerBorderTopWidth: 2,
      containerBorderColor: '#000',
      directionDesktop: 'column',
      blockId: 'a1b2',
    });
    expect(block.attrs).not.toHaveProperty('width');
    expect(block.attrs).not.toHaveProperty('leftMarginDesktop');

    const { html, css } = renderBlock(container, block.attrs);
    expect(html).toMatch(/^<div class="[^"]*default pr-is-root/);
    const d = devices(css);
    expect(d.desktop).toContain('max-width:1000px !important');
    expect(d.desktop).toContain('padding-top:40px');
    expect(d.desktop).toContain('background-color:rgba(255,0,0,0.5)');
    expect(d.desktop).toContain('box-shadow:0px 0px 10px #00000033');
    expect(d.desktop).toContain('row-gap:0');
    expect(d.mobile).toContain('max-width:1000px !important');
    expect(d.mobile).toContain('padding-top:10px');
  });

  it('full width and aligned full: a full-width root with its inner width', () => {
    const block = convert('section', {
      contentWidth: 'full_width',
      align: 'full',
      innerWidth: 1200,
      backgroundType: 'image',
      backgroundImage: { id: 5, url: 'https://example.com/bg.jpg' },
      backgroundPosition: 'left-top',
      backgroundAttachment: 'fixed',
      overlayType: 'color',
      backgroundImageColor: '#000000',
      backgroundOpacity: 40,
    });
    expect(block.attrs).toMatchObject({
      contentWidth: 'alignfull',
      innerContentWidth: 'alignwide',
      innerContentCustomWidthDesktop: 1200,
      innerContentCustomWidthMobile: 1200,
      backgroundType: 'image',
      backgroundPositionDesktop: { x: 0, y: 0 },
      backgroundAttachmentDesktop: 'fixed',
      backgroundAttachmentTablet: 'scroll',
      overlayType: 'color',
      backgroundImageColor: '#000000',
      overlayOpacity: 0.4,
    });
    const { html, css } = renderBlock(container, block.attrs);
    expect(html).toContain('alignfull pr-is-root');
    expect(html).toContain('<div class="pr-container__inner">');
    const d = devices(css);
    expect(d.desktop).toContain('--inner-content-custom-width:min(100%, 1200px)');
    expect(d.mobile).toContain('--inner-content-custom-width:min(100%, 1200px)');
    expect(d.desktop).toContain('background-image:url("https://example.com/bg.jpg")');
    expect(d.desktop).toContain('background-position:0% 0%');
    expect(d.desktop).toMatch(/::before\{[^}]*background:#000000;opacity:0.4/);
    expect(d.tablet).toContain('background-attachment:scroll');
  });

  it('a gradient with an opacity and a non-hex color goes on the overlay', () => {
    const block = convert('section', {
      backgroundType: 'gradient',
      gradientValue: 'linear-gradient(90deg, red 0%, blue 100%)',
      backgroundOpacity: 70,
    });
    expect(block.attrs).toMatchObject({
      backgroundType: 'image',
      overlayType: 'gradient',
      selectGradient: 'basic',
      gradientValue: 'linear-gradient(90deg, red 0%, blue 100%)',
      overlayOpacity: 0.7,
    });
    const { css } = renderBlock(container, block.attrs);
    expect(css).toMatch(
      /::before\{[^}]*background-image:linear-gradient\(90deg, red 0%, blue 100%\);opacity:0.7/,
    );
  });

  it('makes nested roots plain children', () => {
    const inner = convert('columns', {});
    const block = convert('section', {}, [inner]);
    expect(block.children?.[0]?.attrs.isBlockRootParent).toBe(false);
  });
});

describe('uagb/columns and uagb/column', () => {
  const columnA = () =>
    convert('column', {
      colWidth: 60,
      colWidthTablet: 50,
      backgroundType: 'color',
      backgroundColor: '#eeeeee',
      topPadding: 30,
      columnBorderStyle: 'solid',
      columnBorderTopWidth: 1,
      columnBorderTopLeftRadius: 8,
      columnBorderColor: '#cccccc',
    });
  const columnB = () => convert('column', {});

  it('a column keeps only the widths and paddings it sets', () => {
    const a = columnA();
    expect(a.attrs).toMatchObject({
      isBlockRootParent: false,
      widthDesktop: 60,
      widthTablet: 50,
      widthType: '%',
      topPaddingDesktop: 30,
      backgroundType: 'color',
      backgroundColor: '#eeeeee',
      containerBorderStyle: 'solid',
      containerBorderTopLeftRadius: 8,
      directionDesktop: 'column',
    });
    expect(a.attrs).not.toHaveProperty('leftPaddingDesktop');
    expect(a.attrs).not.toHaveProperty('widthMobile');
    expect(columnB().attrs).not.toHaveProperty('widthDesktop');
  });

  it('columns become a row; columns stack on mobile, the gap pads each column', () => {
    const block = convert(
      'columns',
      {
        columns: 2,
        columnGap: '20',
        vAlign: 'center',
        align: 'full',
        contentWidth: 'custom',
        width: 1100,
        reverseMobile: true,
        backgroundType: 'gradient',
        selectGradient: 'advanced',
        gradientColor1: '#112233',
        gradientColor2: '#445566',
        gradientAngle: 45,
        bottomType: 'waves',
        bottomHeight: 80,
        bottomColor: '#ffffff',
        topMarginDesktop: 25,
      },
      [columnA(), columnB()],
    );
    expect(block.attrs).toMatchObject({
      isBlockRootParent: true,
      htmlTag: 'section',
      contentWidth: 'alignfull',
      innerContentWidth: 'alignwide',
      innerContentCustomWidthDesktop: 1100,
      directionDesktop: 'row',
      directionTablet: 'row',
      directionMobile: 'column-reverse',
      alignItemsDesktop: 'stretch',
      columnGapDesktop: 0,
      topPaddingDesktop: 20,
      topMarginDesktop: 25,
      backgroundType: 'gradient',
      selectGradient: 'advanced',
      gradientAngle: 45,
      bottomType: 'waves',
      bottomHeight: 80,
      bottomColor: '#ffffff',
      bottomInvert: true,
      bottomContentAboveShape: true,
    });
    const [a, b] = block.children!;
    expect(a!.attrs).toMatchObject({
      widthDesktop: 60,
      widthTablet: 50,
      widthMobile: 100,
      topPaddingDesktop: 30,
      leftPaddingDesktop: 20,
      justifyContentDesktop: 'center',
    });
    expect(b!.attrs).toMatchObject({
      widthDesktop: 50,
      widthTablet: '',
      widthMobile: 100,
      topPaddingDesktop: 20,
    });

    const row = renderBlock(container, block.attrs);
    expect(row.html).toContain('pr-container__shape-bottom');
    const r = devices(row.css);
    expect(r.desktop).toContain('flex-direction:row');
    expect(r.desktop).toContain('linear-gradient(45deg, #112233 0%, #445566 100%)');
    expect(r.desktop).toContain('.pr-container__shape-bottom svg{height:80px');
    expect(r.mobile).toContain('flex-direction:column-reverse');

    const col = devices(renderBlock(container, a!.attrs).css);
    expect(col.desktop).toContain('.pr-container.pr-is-root .pr-block-test0001{max-width:60%');
    expect(col.tablet).toContain('.pr-container.pr-is-root .pr-block-test0001{max-width:50%');
    expect(col.mobile).toContain('.pr-container.pr-is-root .pr-block-test0001{max-width:100%');
    expect(col.desktop).toContain('background-color:#eeeeee');
    expect(col.desktop).toContain('justify-content:center');
    expect(col.desktop).toContain('border-top-left-radius:8px');
  });

  it('three columns stacked from tablets share the width equally', () => {
    const block = convert('columns', { columns: 3, stack: 'tablet', reverseTablet: true }, [
      columnB(),
      columnB(),
      columnB(),
    ]);
    expect(block.attrs).toMatchObject({
      contentWidth: 'default',
      widthDesktop: 100,
      directionTablet: 'column-reverse',
      directionMobile: 'column-reverse',
    });
    for (const child of block.children!) {
      expect(child.attrs).toMatchObject({
        widthDesktop: 33.33,
        widthTablet: 100,
        widthMobile: 100,
        leftPaddingDesktop: 10,
        justifyContentDesktop: 'flex-start',
      });
    }
    const r = devices(renderBlock(container, block.attrs).css);
    expect(r.tablet).toContain('flex-direction:column-reverse');
    const c = devices(renderBlock(container, block.children![0]!.attrs).css);
    expect(c.desktop).toContain('max-width:33.33%');
    expect(c.tablet).toContain('max-width:100%');
  });

  it('never stacked: columns keep their widths on phones', () => {
    const block = convert('columns', { stack: 'none', columnGap: 'nogap' }, [
      convert('column', { colWidth: 30, colWidthMobile: 40 }),
      convert('column', { colWidth: 70 }),
    ]);
    expect(block.attrs.directionMobile).toBe('row');
    expect(block.children!.map((c) => c.attrs.widthMobile)).toEqual([40, 70]);
    expect(block.children![1]!.attrs.leftPaddingDesktop).toBe(0);
  });
});
