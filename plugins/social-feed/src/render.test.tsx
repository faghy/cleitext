import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  facebookProfileOf,
  instagramProfileOf,
  mergeFeeds,
  normalizeFacebook,
  normalizeInstagram,
} from './normalize';
import { columnsOf, renderFeed, type FeedAttrs, type FeedData } from './render';
import { instanceCss } from './styles';
import { FB_PAGE, FB_POSTS, IG_MEDIA, IG_PROFILE } from './testing';

const ATTRS: FeedAttrs = {
  source: 'all',
  layout: 'grid',
  columns: { desktop: 4, tablet: 3, mobile: 2 },
  count: 2,
  gap: 8,
  aspect: 'square',
  header: true,
  follow: true,
  followLabel: '',
  caption: false,
  captionLength: 120,
  date: false,
  likes: false,
  loadMore: true,
  loadMoreLabel: '',
  lightbox: true,
};

function data(media: FeedData['media'] = 'local'): FeedData {
  const ig = normalizeInstagram(IG_MEDIA.data).map((p, i) => ({
    ...p,
    local: `/social-feed/media/${String(i).repeat(32)}.jpg`,
  }));
  const fb = normalizeFacebook(FB_POSTS.data);
  return {
    posts: mergeFeeds([ig, fb], 100),
    profiles: [
      { ...instagramProfileOf(IG_PROFILE, ''), avatarLocal: '/social-feed/media/a.jpg' },
      facebookProfileOf(FB_PAGE, ''),
    ],
    media,
    consentCategory: 'marketing',
    connected: true,
  };
}

const html = (attrs: Partial<FeedAttrs>, d: FeedData | undefined = data(), extra = {}) =>
  renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      renderFeed({ attrs: { ...ATTRS, ...attrs }, data: d, blockId: 'b1', locale: 'en', ...extra }),
    ),
  );

describe('the Social feed block', () => {
  it('renders the posts as links with pictures copied to the site and alt text', () => {
    const out = html({});
    expect(out).toContain('class="cx-sfeed cx-sfeed--grid cx-sfeed--square cx-sfeed-b1"');
    expect(out).toContain('aria-label="Latest posts from Instagram &amp; Facebook"');
    expect(out).toContain('href="https://www.instagram.com/p/AAA/" target="_blank" rel="noopener"');
    expect(out).toContain(
      `<img src="/social-feed/media/${'0'.repeat(32)}.jpg" alt="Pasta fresca di oggi 🍝 mario" loading="lazy" decoding="async"/>`,
    );
    // Nothing from Meta's servers in local mode.
    expect(out).not.toContain('cdninstagram');
    expect(out).not.toContain('fbcdn');
  });

  it('shows the first posts and hides the rest behind "Load more"', () => {
    const out = html({});
    expect(out.match(/<li /g)).toHaveLength(6);
    expect(out.match(/<li [^>]*hidden=""/g)).toHaveLength(4);
    expect(out).toContain('data-step="2"');
    expect(out).toContain('<div class="cx-sfeed__more" hidden="">');
    expect(out).toContain('>Load more</button>');
    // Without Load more only the count is in the page.
    const fixed = html({ loadMore: false });
    expect(fixed.match(/<li /g)).toHaveLength(2);
    expect(fixed).not.toContain('Load more');
  });

  it('shows a post without picture by its text, and marks videos and albums', () => {
    const out = html({ count: 6 });
    expect(out).toContain('<span class="cx-sfeed__text">Chiusi lunedì per ferie.</span>');
    expect(out).toContain('cx-sfeed__item--video');
    expect(out).toContain('cx-sfeed__item--carousel');
    expect(out).toContain('title="Video"');
  });

  it('renders the header with avatar, followers and follow buttons', () => {
    const out = html({});
    expect(out).toContain('@trattoria.da.mario · 1,234 followers');
    expect(out).toContain('>Follow on Instagram</a>');
    expect(out).toContain('>Follow on Facebook</a>');
    expect(out).toContain('class="wp-block-button__link wp-element-button cx-sfeed__button"');
    expect(html({ header: false })).not.toContain('cx-sfeed__header');
    expect(html({ follow: false })).not.toContain('Follow on');
    // Text attributes without a value are missing, not empty.
    expect(html({ followLabel: undefined, loadMoreLabel: undefined })).toContain(
      '>Load more</button>',
    );
  });

  it('shows caption, date and counts when asked, in Italian too', () => {
    const out = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        renderFeed({
          attrs: { ...ATTRS, caption: true, captionLength: 20, date: true, likes: true },
          data: data(),
          blockId: 'b1',
          locale: 'it',
        }),
      ),
    );
    expect(out).toContain('<p>Pasta fresca di oggi…</p>');
    expect(out).toContain('<time dateTime="2026-09-30T18:00:00.000Z">30 set 2026</time>');
    expect(out).toContain('<span>42 Mi piace</span><span>3 commenti</span>');
    expect(out).toContain('>Segui su Instagram</a>');
  });

  it('gives the lightbox what it shows', () => {
    const out = html({});
    expect(out).toContain('data-lightbox=""');
    expect(out).toContain('data-text="Pasta fresca di oggi 🍝 #pasta @mario"');
    expect(out).toContain('data-network="Instagram"');
    expect(html({ lightbox: false })).not.toContain('data-lightbox');
  });

  it('holds Meta’s pictures until consent in hotlink mode', () => {
    const out = html({}, data('hotlink'));
    expect(out).toContain(
      'data-cx-src="https://scontent.cdninstagram.com/v/1801.jpg?oh=a" data-cx-category="marketing"',
    );
    expect(out).not.toMatch(/<img src="https:\/\/scontent/);
    expect(out).toContain('Accept the cookies of social networks to see the pictures.');
  });

  it('renders a carousel with arrows and no Load more', () => {
    const out = html({ layout: 'carousel', count: 4 });
    expect(out).toContain('cx-sfeed--carousel');
    expect(out).toContain('<div class="cx-sfeed__nav" hidden="">');
    expect(out).not.toContain('Load more');
    expect(out.match(/<li /g)).toHaveLength(4);
  });

  it('renders nothing without posts, and a hint in the editor', () => {
    expect(html({}, { ...data(), posts: [] })).toBe('');
    const none = renderFeed({
      attrs: ATTRS,
      data: undefined,
      blockId: 'b',
      locale: 'en',
      preview: true,
    });
    expect(renderToStaticMarkup(createElement(Fragment, null, none))).toContain(
      'Connect Instagram or Facebook',
    );
    expect(html({}, { ...data(), posts: [] }, { preview: true })).toContain('next refresh');
  });

  it('sets columns per device', () => {
    expect(columnsOf({ desktop: 5 })).toEqual({ desktop: 5, tablet: 5, mobile: 2 });
    expect(columnsOf(4)).toEqual({ desktop: 4, tablet: 3, mobile: 2 });
    expect(columnsOf({ desktop: 99, tablet: 0, mobile: 1 })).toEqual({
      desktop: 8,
      tablet: 1,
      mobile: 1,
    });
    expect(instanceCss('b1', { desktop: 4, tablet: 3, mobile: 2 }, 10)).toBe(
      `.cx-sfeed-b1{--cx-sfeed-cols:4;--cx-sfeed-gap:10px}
@media (max-width:1024px){.cx-sfeed-b1{--cx-sfeed-cols:3}}
@media (max-width:767px){.cx-sfeed-b1{--cx-sfeed-cols:2}}`,
    );
  });
});
