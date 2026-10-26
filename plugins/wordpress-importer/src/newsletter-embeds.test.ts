import { htmlToCxd, IMPORTED_BLOCK } from '@cleitext/blocks/html';
import type { CxdBlock } from '@cleitext/blocks';
import { describe, expect, it } from 'vitest';
import {
  markNewsletterEmbeds,
  newsletterEmbed,
  newsletterEmbedsWarning,
  wrapClassicEmbeds,
} from './newsletter-embeds';

const BREVO_IFRAME =
  '<iframe width="540" height="305" src="https://a1b2.sibforms.com/serve/MUIEAKx9" frameborder="0"></iframe>';
const MAILCHIMP_FORM =
  '<form action="https://acme.us21.list-manage.com/subscribe/post?u=abc&amp;id=f00ba4" method="post"><input type="email" name="EMAIL"><input type="submit" value="Subscribe"></form>';

describe('newsletter forms embedded from email services', () => {
  it('are recognised by the service they post to or load from', () => {
    expect(newsletterEmbed(BREVO_IFRAME)).toBe('Brevo');
    expect(newsletterEmbed(MAILCHIMP_FORM)).toBe('Mailchimp');
    expect(newsletterEmbed('<div class="ml-embedded" data-form="AbC12"></div>')).toBe('MailerLite');
    expect(
      newsletterEmbed('<form action="https://app.convertkit.com/forms/123/subscriptions"></form>'),
    ).toBe('Kit');
    expect(newsletterEmbed('<form action="https://acme.activehosted.com/proc.php"></form>')).toBe(
      'ActiveCampaign',
    );
    // A link to the form, or another form, is not one.
    expect(newsletterEmbed('<a href="https://a1b2.sibforms.com/serve/X">Sign up</a>')).toBeNull();
    expect(newsletterEmbed('<form action="/search"><input name="s"></form>')).toBeNull();
  });

  it('in HTML blocks, at any depth, become placeholders for plugins, keeping the block', () => {
    const html: CxdBlock = { id: 'h1', type: 'core/html', v: 1, attrs: { content: BREVO_IFRAME } };
    const other: CxdBlock = { id: 'h2', type: 'core/html', v: 1, attrs: { content: '<hr>' } };
    const group: CxdBlock = { id: 'g', type: 'core/group', v: 1, attrs: {}, children: [html] };
    const found = new Map<string, number>();
    const out = markNewsletterEmbeds([other, group], found);
    expect(out[0]).toBe(other);
    expect(out[1]!.children![0]).toEqual({
      id: 'h1',
      type: IMPORTED_BLOCK,
      v: 1,
      attrs: {
        name: 'core/html',
        attrs: { content: BREVO_IFRAME },
        html: BREVO_IFRAME,
        fallback: [html],
      },
    });
    expect(found).toEqual(new Map([['Brevo', 1]]));
    const none = [other];
    expect(markNewsletterEmbeds(none, new Map())).toBe(none);
    expect(newsletterEmbedsWarning(found)).toContain('(Brevo 1×)');
    expect(newsletterEmbedsWarning(new Map())).toBeNull();
  });

  it('in classic content are kept as HTML blocks instead of being lost', () => {
    const content = `<p>Join us</p>\n${MAILCHIMP_FORM}\n<p>Or follow us</p>\n${BREVO_IFRAME}\n<iframe src="https://www.youtube.com/embed/x"></iframe>`;
    const blocks = htmlToCxd(wrapClassicEmbeds(content), { keepUnknown: true }).blocks;
    const htmls = blocks.filter((b) => b.type === 'core/html').map((b) => String(b.attrs.content));
    expect(htmls).toEqual([MAILCHIMP_FORM, BREVO_IFRAME]);
    // The texts, and the video converted as before (an Embed block since 0.84).
    expect(blocks.filter((b) => b.type === 'core/paragraph')).toHaveLength(2);
    expect(blocks.filter((b) => b.type === 'core/embed')).toHaveLength(1);
    // Block content and content without such forms are left alone.
    const withBlocks = `<!-- wp:paragraph --><p>x</p><!-- /wp:paragraph -->${MAILCHIMP_FORM}`;
    expect(wrapClassicEmbeds(withBlocks)).toBe(withBlocks);
    expect(wrapClassicEmbeds('<p>Hi</p>')).toBe('<p>Hi</p>');
  });
});
