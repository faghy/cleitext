import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ICONS } from './icons';
import { NETWORKS, shareUrl } from './networks';
import { DEFAULT_CONFIG, fill, ShareButtons, SHARE_JS } from './render';

const html = (config = DEFAULT_CONFIG, locale = 'it') =>
  renderToStaticMarkup(
    <ShareButtons
      config={config}
      url="https://example.org/post"
      title="Un titolo"
      locale={locale}
      uid="b1"
    />,
  );

describe('share buttons', () => {
  it('give every network an icon and a share address', () => {
    for (const network of NETWORKS) {
      expect(ICONS[network.id], network.id).toBeTruthy();
      expect(shareUrl(network.id, 'https://example.org/a b', 'T & U')).not.toContain(' ');
    }
    expect(shareUrl('disbigle', 'https://example.org/p', 'Ciao')).toBe(
      'https://app.disbigle.com/share?text=Ciao%20https%3A%2F%2Fexample.org%2Fp',
    );
    expect(shareUrl('nope', 'u', 't')).toBeNull();
    expect(fill('{title}|{url}|{url}', 'a&b', 'x y')).toBe('x%20y|a%26b|a%26b');
  });

  it('show social networks, the fediverse, email and copy, in the page language', () => {
    const out = html();
    expect(out).toContain('Condividi con i social:');
    expect(out).toContain('Condividi con il fediverso:');
    expect(out).toContain('Oppure invia via');
    for (const id of [
      'facebook',
      'x',
      'linkedin',
      'instagram',
      'whatsapp',
      'telegram',
      'disbigle',
      'diaspora',
      'mastodon',
      'fediverse',
    ])
      expect(out).toMatch(new RegExp(`class="sb-link sb-${id}"[^>]*>.*?<svg class="sb-icon"`));
    // Disbigle's logo: its mask has an id of its own on the page.
    expect(out).toContain('mask id="sb-disbigle-b1"');
    expect(out).toContain('url(#sb-disbigle-b1)');
    // Instagram copies the link first.
    expect(out).toMatch(/href="https:\/\/www\.instagram\.com\/"[^>]*data-sb-copy=""/);
    expect(out).toContain('<!--email_off--><a class="sb-link sb-email"');
    expect(out).toContain('>Altri</span>');
    expect(html(DEFAULT_CONFIG, 'en')).toContain('Share on the fediverse:');
  });

  it('keep the chosen networks in order, and can show icons only', () => {
    const out = html({
      ...DEFAULT_CONFIG,
      social: ['bluesky', 'x', 'disbigle', 'unknown'],
      fediverse: [],
      email: false,
      copy: false,
      look: 'icons',
    });
    expect(out.indexOf('sb-link sb-bluesky')).toBeLessThan(out.indexOf('sb-link sb-x"'));
    // A fediverse network in the social list is left out; nothing for an empty group.
    expect(out).not.toContain('sb-link sb-disbigle');
    expect(out).not.toContain('Condividi con il fediverso');
    expect(out).toContain('aria-label="Bluesky"');
    expect(out).not.toContain('<span>Bluesky</span>');
    expect(html({ ...DEFAULT_CONFIG, social: [], fediverse: [], email: false, copy: false })).toBe(
      '',
    );
  });

  it('ship a valid page script', () => {
    expect(() => new Function(SHARE_JS)).not.toThrow();
  });
});
