/**
 * Under an announced article: the replies from the fediverse, then the link
 * to the post to comment from any fediverse account.
 */
import type { FediComment } from './types';

export interface SectionData {
  url: string;
  comments: FediComment[];
}

const STRINGS = {
  en: {
    heading: 'Comments from the fediverse',
    cta: 'Comment on the fediverse',
    hint: 'Reply to the post with your Disbigle, Mastodon or other fediverse account: your reply appears here.',
    one: '1 reply',
    many: '{n} replies',
    profile: 'Profile of {name}',
    open: 'Open the reply',
  },
  it: {
    heading: 'Commenti dal fediverso',
    cta: 'Commenta sul fediverso',
    hint: 'Rispondi al post con il tuo account Disbigle, Mastodon o di un altro server del fediverso: la tua risposta compare qui.',
    one: '1 risposta',
    many: '{n} risposte',
    profile: 'Profilo di {name}',
    open: 'Apri la risposta',
  },
};

export const strings = (locale: string) =>
  locale.toLowerCase().startsWith('it') ? STRINGS.it : STRINGS.en;

function date(iso: string, locale: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  try {
    return new Date(time).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return new Date(time).toISOString().slice(0, 10);
  }
}

function Comment({ comment, locale }: { comment: FediComment; locale: string }) {
  const t = strings(locale);
  return (
    <li
      className={`cx-dsb-c cx-dsb-d${comment.depth}`}
      id={`fedi-${comment.id.replace(/[^\w-]/g, '')}`}
    >
      <a
        className="cx-dsb-who"
        href={comment.profileUrl}
        rel="nofollow ugc noopener"
        target="_blank"
        aria-label={t.profile.replace('{name}', comment.displayName)}
      >
        {comment.avatar ? (
          <img
            className="cx-dsb-av"
            src={comment.avatar}
            alt=""
            width={40}
            height={40}
            loading="lazy"
          />
        ) : (
          <span className="cx-dsb-av cx-dsb-in" aria-hidden="true">
            {comment.initials}
          </span>
        )}
      </a>
      <div className="cx-dsb-main">
        <p className="cx-dsb-meta">
          <a href={comment.profileUrl} rel="nofollow ugc noopener" target="_blank">
            <strong>{comment.displayName}</strong>{' '}
            <span className="cx-dsb-acct">@{comment.acct}</span>
          </a>{' '}
          <a
            className="cx-dsb-time"
            href={comment.url}
            rel="nofollow ugc noopener"
            target="_blank"
            title={t.open}
          >
            <time dateTime={comment.createdAt}>{date(comment.createdAt, locale)}</time>
          </a>
        </p>
        {comment.spoiler ? (
          <details className="cx-dsb-body">
            <summary>{comment.spoiler}</summary>
            <div dangerouslySetInnerHTML={{ __html: comment.html }} />
          </details>
        ) : (
          <div className="cx-dsb-body" dangerouslySetInnerHTML={{ __html: comment.html }} />
        )}
      </div>
    </li>
  );
}

export function FediverseSection({ data, locale }: { data: SectionData; locale: string }) {
  const t = strings(locale);
  const count = data.comments.length;
  return (
    <section className="cx-dsb" id="fediverse-comments" aria-labelledby="cx-dsb-title">
      <h2 id="cx-dsb-title" className="cx-dsb-title">
        {t.heading}
        {count > 0 && (
          <span className="cx-dsb-count">
            {' '}
            ({count === 1 ? t.one : t.many.replace('{n}', String(count))})
          </span>
        )}
      </h2>
      {count > 0 && (
        <ol className="cx-dsb-list">
          {data.comments.map((comment) => (
            <Comment key={comment.id} comment={comment} locale={locale} />
          ))}
        </ol>
      )}
      <p className="cx-dsb-cta">
        <a className="cx-dsb-link" href={data.url} rel="noopener" target="_blank">
          {t.cta}
        </a>
      </p>
      <p className="cx-dsb-hint">{t.hint}</p>
    </section>
  );
}

export const CSS = `.cx-dsb{margin:2.5rem 0 1rem;border-top:1px solid color-mix(in srgb,currentColor 15%,transparent);padding-top:1.5rem}
.cx-dsb-title{font-size:1.25rem;margin:0 0 1rem}
.cx-dsb-count{font-weight:400;opacity:.7;font-size:.9em}
.cx-dsb-list{list-style:none;margin:0 0 1.25rem;padding:0;display:grid;gap:1rem}
.cx-dsb-c{display:flex;gap:.75rem;align-items:flex-start}
.cx-dsb-d1{margin-left:2rem}.cx-dsb-d2{margin-left:4rem}.cx-dsb-d3{margin-left:6rem}
@media (max-width:600px){.cx-dsb-d1,.cx-dsb-d2,.cx-dsb-d3{margin-left:1.25rem}}
.cx-dsb-who{flex:none;text-decoration:none}
.cx-dsb-av{display:block;width:40px;height:40px;border-radius:50%;object-fit:cover}
.cx-dsb-in{display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,currentColor 12%,transparent);font-size:.9rem;font-weight:600}
.cx-dsb-main{min-width:0;flex:1}
.cx-dsb-meta{margin:0 0 .25rem;font-size:.9rem}
.cx-dsb-meta a{text-decoration:none;color:inherit}
.cx-dsb-acct,.cx-dsb-time{opacity:.7}
.cx-dsb-body{overflow-wrap:anywhere}
.cx-dsb-body p{margin:0 0 .5rem}
.cx-dsb-body .invisible{display:none}
.cx-dsb-body .ellipsis::after{content:'…'}
.cx-dsb-cta{margin:0 0 .25rem}
.cx-dsb-link{display:inline-block;padding:.5rem 1rem;border-radius:.4rem;border:1px solid currentColor;text-decoration:none;font-weight:600}
.cx-dsb-hint{margin:0;font-size:.85rem;opacity:.75}`;
