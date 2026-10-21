/**
 * The Social feed block's markup, rendered on the server: the posts are in
 * the page for search engines and for visitors without JavaScript, with
 * real links to the originals. The small script of the plugin adds the
 * lightbox, "Load more" and the carousel's arrows.
 */
import type { ReactNode } from 'react';
import { altText, excerpt } from './normalize';
import type { Channel, MediaMode, SocialPost, SocialProfile } from './types';

export type Source = 'all' | 'instagram' | 'facebook';
export type Layout = 'grid' | 'carousel' | 'list';
export type Aspect = 'square' | 'portrait' | 'original';

export interface FeedAttrs {
  source: Source;
  layout: Layout;
  columns: unknown;
  count: number;
  gap: number;
  aspect: Aspect;
  header: boolean;
  follow: boolean;
  followLabel?: string;
  caption: boolean;
  captionLength: number;
  date: boolean;
  likes: boolean;
  loadMore: boolean;
  loadMoreLabel?: string;
  lightbox: boolean;
}

export interface FeedData {
  posts: SocialPost[];
  profiles: SocialProfile[];
  media: MediaMode;
  consentCategory: 'marketing' | 'preferences';
  /** A channel of the block is connected (the posts may still be coming). */
  connected: boolean;
}

/** Most posts in a page (the rest of "Load more" waits hidden in it). */
export const MAX_RENDERED = 100;

export const TEXTS = {
  en: {
    label: (names: string) => `Latest posts from ${names}`,
    follow: (network: string) => `Follow on ${network}`,
    loadMore: 'Load more',
    previous: 'Previous posts',
    next: 'Next posts',
    followers: (n: string) => `${n} followers`,
    likes: (n: string) => `${n} likes`,
    comments: (n: string) => `${n} comments`,
    open: (network: string) => `Open on ${network}`,
    album: 'Album',
    video: 'Video',
    consent: 'Accept the cookies of social networks to see the pictures.',
    empty: 'No posts yet. Connect Instagram or Facebook in Settings → Social feed.',
    waiting: 'The posts arrive at the next refresh (Settings → Social feed → Refresh now).',
  },
  it: {
    label: (names: string) => `Ultimi post da ${names}`,
    follow: (network: string) => `Segui su ${network}`,
    loadMore: 'Carica altri',
    previous: 'Post precedenti',
    next: 'Post successivi',
    followers: (n: string) => `${n} follower`,
    likes: (n: string) => `${n} Mi piace`,
    comments: (n: string) => `${n} commenti`,
    open: (network: string) => `Apri su ${network}`,
    album: 'Album',
    video: 'Video',
    consent: 'Accetta i cookie dei social network per vedere le immagini.',
    empty: 'Ancora nessun post. Collega Instagram o Facebook in Impostazioni → Feed social.',
    waiting:
      'I post arrivano al prossimo aggiornamento (Impostazioni → Feed social → Aggiorna ora).',
  },
};

export const textsFor = (locale: string) =>
  locale.toLowerCase().startsWith('it') ? TEXTS.it : TEXTS.en;

const NETWORK: Record<Channel, string> = { instagram: 'Instagram', facebook: 'Facebook' };

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
};

/** Columns per device, from a responsive value or a plain number. */
export function columnsOf(value: unknown): { desktop: number; tablet: number; mobile: number } {
  if (typeof value === 'number') {
    const n = clamp(value, 1, 8, 3);
    return { desktop: n, tablet: Math.min(n, 3), mobile: Math.min(n, 2) };
  }
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const desktop = clamp(v.desktop, 1, 8, 3);
  const tablet = v.tablet === undefined || v.tablet === null ? desktop : clamp(v.tablet, 1, 8, 3);
  const mobile =
    v.mobile === undefined || v.mobile === null ? Math.min(tablet, 2) : clamp(v.mobile, 1, 8, 2);
  return { desktop, tablet, mobile };
}

function formatNumber(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { notation: n >= 10000 ? 'compact' : 'standard' }).format(
      n,
    );
  } catch {
    return String(n);
  }
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 10);
  }
}

const PLAY = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const ALBUM = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M7 3h12a2 2 0 0 1 2 2v12h-2V5H7zM3 7h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
  </svg>
);

/** The picture of a post as this site shows it: its copy, Meta's address, or none. */
export function pictureOf(post: SocialPost, media: MediaMode): string | null {
  return media === 'local' ? post.local : post.image;
}

function Picture({
  src,
  alt,
  hotlink,
  consent,
  t,
}: {
  src: string;
  alt: string;
  hotlink: boolean;
  consent: string;
  t: (typeof TEXTS)['en'];
}) {
  // Meta's addresses wait for consent: the script sets `src` once given.
  if (hotlink)
    return (
      <>
        <img
          data-cx-src={src}
          data-cx-category={consent}
          alt={alt}
          loading="lazy"
          decoding="async"
        />
        <span className="cx-sfeed__consent" data-cx-sfeed-consent="">
          {t.consent}
        </span>
      </>
    );
  return <img src={src} alt={alt} loading="lazy" decoding="async" />;
}

function Header({
  profiles,
  attrs,
  data,
  t,
  locale,
}: {
  profiles: SocialProfile[];
  attrs: FeedAttrs;
  data: FeedData;
  t: (typeof TEXTS)['en'];
  locale: string;
}) {
  return (
    <div className="cx-sfeed__header">
      <div className="cx-sfeed__profiles">
        {profiles.map((p) => {
          const avatar = data.media === 'local' ? p.avatarLocal : p.avatar;
          return (
            <a
              key={p.channel}
              className={`cx-sfeed__profile cx-sfeed__profile--${p.channel}`}
              href={p.url}
              target="_blank"
              rel="noopener"
            >
              {avatar && (
                <span className="cx-sfeed__media cx-sfeed__avatar">
                  <Picture
                    src={avatar}
                    alt=""
                    hotlink={data.media === 'hotlink'}
                    consent={data.consentCategory}
                    t={{ ...t, consent: '' }}
                  />
                </span>
              )}
              <span className="cx-sfeed__names">
                <strong>{p.name || p.username}</strong>
                <span>
                  {[
                    p.username && p.channel === 'instagram' ? `@${p.username}` : NETWORK[p.channel],
                    p.followers !== null ? t.followers(formatNumber(p.followers, locale)) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </a>
          );
        })}
      </div>
      {attrs.follow && (
        <div className="cx-sfeed__follows">
          {profiles.map((p) => (
            <a
              key={p.channel}
              className="wp-block-button__link wp-element-button cx-sfeed__button"
              href={p.url}
              target="_blank"
              rel="noopener"
            >
              {attrs.followLabel?.trim() && profiles.length === 1
                ? attrs.followLabel.trim()
                : t.follow(NETWORK[p.channel])}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function renderFeed(props: {
  attrs: FeedAttrs;
  data: FeedData | undefined;
  blockId: string;
  locale: string;
  preview?: boolean;
}): ReactNode {
  const { attrs, data, blockId, locale } = props;
  const t = textsFor(locale);
  if (!data || data.posts.length === 0) {
    if (!props.preview) return null;
    return <p className="cx-sfeed__empty">{data?.connected ? t.waiting : t.empty}</p>;
  }
  const layout: Layout = ['grid', 'carousel', 'list'].includes(attrs.layout)
    ? attrs.layout
    : 'grid';
  const aspect: Aspect = ['square', 'portrait', 'original'].includes(attrs.aspect)
    ? attrs.aspect
    : 'square';
  const count = clamp(attrs.count, 1, 50, 9);
  const more = Boolean(attrs.loadMore) && layout !== 'carousel';
  const shown = data.posts.slice(0, more ? MAX_RENDERED : count);
  const hotlink = data.media === 'hotlink';
  const names = [...new Set(shown.map((p) => NETWORK[p.channel]))].join(' & ');
  const captionLength = clamp(attrs.captionLength, 0, 2200, 120);
  const scope = `cx-sfeed-${blockId.replace(/[^\w-]/g, '')}`;

  return (
    <section
      className={`cx-sfeed cx-sfeed--${layout} cx-sfeed--${aspect} ${scope}`}
      aria-label={t.label(names)}
      data-cx-sfeed=""
      data-step={count}
      {...(attrs.lightbox ? { 'data-lightbox': '' } : {})}
    >
      {attrs.header && data.profiles.length > 0 && (
        <Header profiles={data.profiles} attrs={attrs} data={data} t={t} locale={locale} />
      )}
      <ul className="cx-sfeed__items" role="list">
        {shown.map((post, index) => {
          const network = NETWORK[post.channel];
          const src = pictureOf(post, data.media);
          const alt = altText(post, locale);
          const caption =
            attrs.caption && captionLength > 0 ? excerpt(post.text, captionLength) : '';
          const info = [
            attrs.likes && post.likes !== null ? t.likes(formatNumber(post.likes, locale)) : '',
            attrs.likes && post.comments !== null
              ? t.comments(formatNumber(post.comments, locale))
              : '',
          ].filter(Boolean);
          const album = hotlink ? post.album : [];
          return (
            <li
              key={post.id}
              className={`cx-sfeed__item cx-sfeed__item--${post.channel} cx-sfeed__item--${post.type}`}
              {...(index >= count ? { hidden: true } : {})}
            >
              <a
                className="cx-sfeed__link"
                href={post.permalink}
                target="_blank"
                rel="noopener"
                aria-label={`${t.open(network)}: ${alt}`}
                data-network={network}
                data-text={post.text}
                data-date={formatDate(post.timestamp, locale)}
                {...(src ? { 'data-image': src } : {})}
                {...(album.length > 1 ? { 'data-album': album.join(' ') } : {})}
                {...(info.length ? { 'data-info': info.join(' · ') } : {})}
              >
                <span className="cx-sfeed__media">
                  {src ? (
                    <Picture
                      src={src}
                      alt={alt}
                      hotlink={hotlink}
                      consent={data.consentCategory}
                      t={t}
                    />
                  ) : (
                    <span className="cx-sfeed__text">{excerpt(post.text, 160) || network}</span>
                  )}
                  {post.type === 'video' && (
                    <span className="cx-sfeed__badge" title={t.video}>
                      {PLAY}
                    </span>
                  )}
                  {post.type === 'carousel' && (
                    <span className="cx-sfeed__badge" title={t.album}>
                      {ALBUM}
                    </span>
                  )}
                </span>
              </a>
              {(caption || attrs.date || info.length > 0 || (post.link && layout === 'list')) && (
                <div className="cx-sfeed__meta">
                  {caption && <p>{caption}</p>}
                  {post.link && layout === 'list' && (
                    <p>
                      <a href={post.link.url} target="_blank" rel="noopener nofollow">
                        {post.link.title || post.link.url}
                      </a>
                    </p>
                  )}
                  {(attrs.date || info.length > 0) && (
                    <span className="cx-sfeed__info">
                      {attrs.date && (
                        <time dateTime={post.timestamp}>{formatDate(post.timestamp, locale)}</time>
                      )}
                      {info.map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {layout === 'carousel' && shown.length > 1 && (
        <div className="cx-sfeed__nav" hidden>
          <button type="button" data-cx-sfeed-prev="" aria-label={t.previous}>
            ‹
          </button>
          <button type="button" data-cx-sfeed-next="" aria-label={t.next}>
            ›
          </button>
        </div>
      )}
      {more && shown.length > count && (
        <div className="cx-sfeed__more" hidden>
          <button
            type="button"
            className="wp-block-button__link wp-element-button cx-sfeed__button"
            data-cx-sfeed-more=""
          >
            {attrs.loadMoreLabel?.trim() || t.loadMore}
          </button>
        </div>
      )}
    </section>
  );
}
