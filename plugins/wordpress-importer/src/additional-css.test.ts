import { describe, expect, it } from 'vitest';
import { wxrAdditionalCss, wxrTheme } from './additional-css';
import { wxrToDocument } from './wxr';

const cdata = (v: string) => `<![CDATA[${v}]]>`;

interface CssPost {
  theme: string;
  css: string;
  modified?: string;
  status?: string;
  id?: number;
}

/** An export with the Customizer's Additional CSS of some themes (and other items). */
function wxr(posts: CssPost[], extra = ''): string {
  return `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Site</title><wp:wxr_version>1.2</wp:wxr_version><wp:base_blog_url>https://s.example.com</wp:base_blog_url>
${posts
  .map(
    (p, i) =>
      `<item><title>${p.theme}</title><wp:post_id>${p.id ?? 100 + i}</wp:post_id><wp:post_name>${p.theme}</wp:post_name><wp:status>${p.status ?? 'publish'}</wp:status><wp:post_type>custom_css</wp:post_type><wp:post_modified_gmt>${p.modified ?? '2024-01-01 10:00:00'}</wp:post_modified_gmt><content:encoded>${cdata(p.css)}</content:encoded></item>`,
  )
  .join('\n')}
<item><title>Hello</title><wp:post_id>20</wp:post_id><wp:post_name>hello</wp:post_name><wp:status>publish</wp:status><wp:post_type>post</wp:post_type><content:encoded>${cdata('<p>Hi</p>')}</content:encoded></item>
${extra}
</channel></rss>`;
}

const globalStyles = (theme: string) =>
  `<item><title>Custom Styles</title><wp:post_id>50</wp:post_id><wp:post_name>wp-global-styles-${theme}</wp:post_name><wp:status>publish</wp:status><wp:post_type>wp_global_styles</wp:post_type><category domain="wp_theme" nicename="${theme}"><![CDATA[${theme}]]></category><content:encoded>${cdata('{"version":3}')}</content:encoded></item>`;

describe('Additional CSS of a WordPress export', () => {
  it('imports the only custom_css post as the CSS for every theme, not as content', () => {
    const { document, warnings } = wxrToDocument(
      wxr([{ theme: 'astra', css: '  .site-title { color: teal; }\n' }]),
      { locale: 'en' },
    );
    expect(document.site?.additionalCss).toEqual({ site: '.site-title { color: teal; }' });
    // Not content: only the post is an entry.
    expect(document.entries?.map((e) => e.ref)).toEqual(['post:20']);
    expect(warnings).toContainEqual(
      expect.stringContaining('Additional CSS of the WordPress theme “astra”'),
    );
  });

  it('chooses the export theme’s post among several, and reports the others', () => {
    const { document, warnings } = wxrToDocument(
      wxr(
        [
          { theme: 'twentytwentyfour', css: '.old{}', modified: '2024-01-01 10:00:00' },
          { theme: 'astra', css: '.newer{}', modified: '2025-06-01 10:00:00' },
          { theme: 'twentytwentyfive', css: '.active{}', modified: '2024-05-01 10:00:00' },
        ],
        globalStyles('twentytwentyfive'),
      ),
      { locale: 'en' },
    );
    expect(document.site?.additionalCss).toEqual({ site: '.active{}' });
    const note = warnings.find((w) => w.includes('3 WordPress themes'))!;
    expect(note).toContain('“twentytwentyfive” (the theme of the export)');
    expect(note).toContain('“twentytwentyfour”, “astra”');
  });

  it('takes the most recently changed one when the export does not name its theme', () => {
    const { css, warnings } = wxrAdditionalCss(
      parsedItems([
        { theme: 'a', css: '.a{}', modified: '2024-01-01 10:00:00' },
        { theme: 'b', css: '.b{}', modified: '2025-03-01 10:00:00' },
        { theme: 'c', css: '', modified: '2026-03-01 10:00:00' },
        { theme: 'd', css: '.trashed{}', modified: '2026-04-01 10:00:00', status: 'trash' },
      ]),
    );
    expect(css).toBe('.b{}');
    expect(warnings[0]).toContain('“b” (the most recently changed)');
    expect(warnings[0]).toContain('the one of “a” was not');
  });

  it('leaves out CSS the site could not print, saying why', () => {
    for (const [bad, why] of [
      ['a{}</style><script>alert(1)</script>', 'markup'],
      [`a{content:"${'x'.repeat(100_001)}"}`, 'longer than 100,000'],
    ] as const) {
      const { document, warnings } = wxrToDocument(wxr([{ theme: 'astra', css: bad }]), {
        locale: 'en',
      });
      expect(document.site?.additionalCss).toBeUndefined();
      expect(warnings.find((w) => w.includes('was not imported'))).toContain(why);
    }
  });

  it('matches the braces before the CSS goes after the site’s own (bolognaolistica.com)', () => {
    // Already broken in WordPress, where the browser closed the block at the end of its <style>.
    const css =
      '.smartslider3 slider="2"\n {\n    display:initial;\n    position: relative;\n}@media screen and (max-width: 580px){';
    const { css: imported, warnings } = wxrAdditionalCss(parsedItems([{ theme: 'totally', css }]));
    expect(imported).toBe(
      '.smartslider3 slider="2"\n {\n    display:initial;\n    position: relative;\n}',
    );
    expect(warnings[0]).toContain(
      'The braces of the Additional CSS of the WordPress theme “totally” did not match (already so in WordPress): removed the empty block left open at the end',
    );
    // A block with rules is closed; braces in comments and strings do not count.
    const closed = wxrAdditionalCss(
      parsedItems([
        { theme: 't', css: '/* { */ .a::after{content:"}"} @media print{.b{color:red}' },
      ]),
    );
    expect(closed.css).toBe('/* { */ .a::after{content:"}"} @media print{.b{color:red}\n}');
    expect(closed.warnings[0]).toContain('closed the block left open at the end');
    const stray = wxrAdditionalCss(parsedItems([{ theme: 't', css: '.a{}} .b{}' }]));
    expect(stray.css).toBe('.a{} .b{}');
    expect(stray.warnings[0]).toContain('removed 1 “}” with no “{”');
    // Matching braces: no warning about them.
    const fine = wxrAdditionalCss(parsedItems([{ theme: 't', css: '.a{content:"{"}' }]));
    expect(fine.warnings.join('\n')).not.toContain('braces');
  });

  it('gives the same CSS at every import of the same export (the core skips it then)', () => {
    const xml = wxr([{ theme: 'astra', css: '.x{}' }]);
    const first = wxrToDocument(xml, { locale: 'en' }).document.site?.additionalCss;
    const again = wxrToDocument(xml, { locale: 'en' }).document.site?.additionalCss;
    expect(again).toEqual(first);
  });

  it('finds the theme of an export in any item of a block theme', () => {
    expect(wxrTheme([])).toBeUndefined();
    expect(
      wxrTheme([
        { 'wp:post_type': 'post' },
        {
          'wp:post_type': 'wp_template',
          category: [{ '@_domain': 'wp_theme', '@_nicename': 'ollie' }],
        },
      ]),
    ).toBe('ollie');
  });
});

/** Items as the parser gives them, for the function alone. */
function parsedItems(posts: CssPost[]): Record<string, unknown>[] {
  return posts.map((p, i) => ({
    title: p.theme,
    'wp:post_id': String(p.id ?? 100 + i),
    'wp:post_name': p.theme,
    'wp:status': p.status ?? 'publish',
    'wp:post_type': 'custom_css',
    'wp:post_modified_gmt': p.modified ?? '',
    'content:encoded': p.css,
  }));
}
