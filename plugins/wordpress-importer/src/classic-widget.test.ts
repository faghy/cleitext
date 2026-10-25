import { describe, expect, it } from 'vitest';
import { wxrToDocument } from './wxr';

/** One page whose content is a plain HTML widget (no block comments), as the footer widgets have it. */
const wxr = (content: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Old</title><link>https://old.example.com</link><wp:wxr_version>1.2</wp:wxr_version><wp:base_site_url>https://old.example.com</wp:base_site_url>
<item><title>Footer</title><link>https://old.example.com/footer/</link><dc:creator><![CDATA[admin]]></dc:creator>
<content:encoded><![CDATA[${content}]]></content:encoded>
<wp:post_id>9</wp:post_id><wp:post_date>2025-04-15 10:00:00</wp:post_date><wp:post_date_gmt>2025-04-15 10:00:00</wp:post_date_gmt>
<wp:post_name>footer</wp:post_name><wp:status>publish</wp:status><wp:post_type>page</wp:post_type></item></channel></rss>`;

describe('classic text widget', () => {
  it('keeps the size its text is written in, and the bold of styled spans', () => {
    const { document } = wxrToDocument(
      wxr(
        '<div class="ast-builder-html-element"><p><a href="https://old.example.com/cookie-policy/">' +
          '<span style="font-size: 10pt">Cookie Policy</span></a><span style="font-size: 10pt"> - ' +
          '<a href="https://old.example.com/privacy-policy/"><span style="font-weight:bold">Privacy Policy</span></a></span></p>\n</div>',
      ),
      { locale: 'en' },
    );
    const [p] = document.entries![0]!.document.blocks;
    expect(p).toMatchObject({
      type: 'core/paragraph',
      attrs: { style: { typography: { fontSize: '13.33px' } } },
    });
    expect(JSON.stringify(p)).toContain('{"text":"Privacy Policy","marks":["bold"]}');
  });
});
