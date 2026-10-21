// @vitest-environment jsdom
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeInstagram } from './normalize';
import { renderFeed, type FeedAttrs, type FeedData } from './render';
import { IG_MEDIA } from './testing';

const ATTRS: FeedAttrs = {
  source: 'instagram',
  layout: 'grid',
  columns: 3,
  count: 1,
  gap: 8,
  aspect: 'square',
  header: false,
  follow: false,
  caption: false,
  captionLength: 120,
  date: false,
  likes: false,
  loadMore: true,
  lightbox: true,
};

function page(media: FeedData['media'], banner = false) {
  const data: FeedData = {
    posts: normalizeInstagram(IG_MEDIA.data).map((p, i) => ({
      ...p,
      local: `/social-feed/media/${String(i).repeat(32)}.jpg`,
    })),
    profiles: [],
    media,
    consentCategory: 'marketing',
    connected: true,
  };
  document.body.innerHTML =
    (banner ? '<div id="cx-consent" hidden></div>' : '') +
    renderToStaticMarkup(
      createElement(Fragment, null, renderFeed({ attrs: ATTRS, data, blockId: 'b', locale: 'en' })),
    );
}

/** The script, as the page runs it (once per import). */
async function run() {
  vi.resetModules();
  await import('./public/feed');
}

const visible = () => document.querySelectorAll('.cx-sfeed__item:not([hidden])').length;

afterEach(() => {
  delete (window as { cleitextConsent?: unknown }).cleitextConsent;
});

describe('the feed in the browser', () => {
  it('shows "Load more" and reveals the next posts until none is left', async () => {
    page('local');
    await run();
    const more = document.querySelector<HTMLButtonElement>('[data-cx-sfeed-more]')!;
    expect(more.parentElement!.hidden).toBe(false);
    expect(visible()).toBe(1);
    more.click();
    expect(visible()).toBe(2);
    more.click();
    expect(visible()).toBe(3);
    expect(document.querySelector('[data-cx-sfeed-more]')).toBeNull();
  });

  it('loads Meta’s pictures at once on a site without a consent banner', async () => {
    page('hotlink');
    await run();
    const image = document.querySelector('img')!;
    expect(image.getAttribute('src')).toBe('https://scontent.cdninstagram.com/v/1801.jpg?oh=a');
    expect(document.querySelector('[data-cx-sfeed-consent]')).toBeNull();
  });

  it('waits for consent with the banner, then loads them', async () => {
    page('hotlink', true);
    (window as { cleitextConsent?: unknown }).cleitextConsent = { categories: [] };
    await run();
    const image = document.querySelector('img')!;
    expect(image.hasAttribute('src')).toBe(false);
    (window as { cleitextConsent?: unknown }).cleitextConsent = { categories: ['marketing'] };
    document.dispatchEvent(new CustomEvent('cleitext:consent'));
    expect(image.getAttribute('src')).toBe('https://scontent.cdninstagram.com/v/1801.jpg?oh=a');
  });

  it('opens a post in the lightbox, with its caption and the link to the original', async () => {
    page('local');
    // jsdom has dialogs without showModal.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
    await run();
    document.querySelector<HTMLAnchorElement>('a.cx-sfeed__link')!.click();
    const dialog = document.querySelector('dialog.cx-sfeed-lightbox')!;
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('.cx-sfeed-lightbox__caption')!.textContent).toBe(
      'Pasta fresca di oggi 🍝 #pasta @mario',
    );
    expect(dialog.querySelector('img')!.getAttribute('src')).toBe(
      `/social-feed/media/${'0'.repeat(32)}.jpg`,
    );
    const original = dialog.querySelector<HTMLAnchorElement>('a')!;
    expect(original.href).toBe('https://www.instagram.com/p/AAA/');
    expect(original.textContent).toBe('Open on Instagram →');
  });
});
