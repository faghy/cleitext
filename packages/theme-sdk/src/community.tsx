/**
 * Comments, likes and sharing under entries (RF-COM), as WordPress themes
 * get them from `comments_template()`. Themes show them with
 * `<EntryCommunity />`, or let `EntryContent` add them (the default).
 * Plain markup with `cx-` classes and a small stylesheet; themes restyle it.
 */
import type { ReactNode } from 'react';
import { usePage } from './context.js';
import { Challenge } from './account.js';
import type { EntryAuthor, EntryComments, PublicComment, PublicEntry } from './types.js';

type Strings = Record<keyof typeof EN, string>;

const EN = {
  comments: 'Comments',
  oneComment: '1 comment',
  manyComments: '{n} comments',
  noComments: 'No comments yet.',
  leaveComment: 'Leave a comment',
  replyTo: 'Reply to {name}',
  cancelReply: 'Cancel reply',
  reply: 'Reply',
  comment: 'Comment',
  name: 'Name',
  email: 'Email',
  emailNote: 'Your email address will not be published.',
  website: 'Website',
  notify: 'Email me when someone replies',
  post: 'Post comment',
  closed: 'Comments are closed.',
  mustLogin: 'You must be signed in to comment.',
  signIn: 'Sign in',
  signUp: 'Create an account',
  signedInAs: 'Signed in as {name}.',
  signOut: 'Sign out',
  pending: 'Your comment is waiting for approval.',
  posted: 'Your comment has been published.',
  awaiting: 'Waiting for approval',
  author: 'Author',
  older: 'Older comments',
  newer: 'Newer comments',
  like: 'Like',
  liked: 'Liked',
  share: 'Share',
  copyLink: 'Copy link',
  copied: 'Link copied',
  required: 'required',
  writtenBy: 'Written by {name}',
  allPosts: 'All posts by {name}',
};
const IT: Strings = {
  comments: 'Commenti',
  oneComment: '1 commento',
  manyComments: '{n} commenti',
  noComments: 'Ancora nessun commento.',
  leaveComment: 'Lascia un commento',
  replyTo: 'Rispondi a {name}',
  cancelReply: 'Annulla risposta',
  reply: 'Rispondi',
  comment: 'Commento',
  name: 'Nome',
  email: 'Email',
  emailNote: 'Il tuo indirizzo email non sarà pubblicato.',
  website: 'Sito web',
  notify: 'Avvisami via email quando qualcuno risponde',
  post: 'Pubblica il commento',
  closed: 'I commenti sono chiusi.',
  mustLogin: 'Devi accedere per commentare.',
  signIn: 'Accedi',
  signUp: 'Crea un account',
  signedInAs: 'Hai effettuato l’accesso come {name}.',
  signOut: 'Esci',
  pending: 'Il tuo commento è in attesa di approvazione.',
  posted: 'Il tuo commento è stato pubblicato.',
  awaiting: 'In attesa di approvazione',
  author: 'Autore',
  older: 'Commenti precedenti',
  newer: 'Commenti successivi',
  like: 'Mi piace',
  liked: 'Ti piace',
  share: 'Condividi',
  copyLink: 'Copia il link',
  copied: 'Link copiato',
  required: 'obbligatorio',
  writtenBy: 'Scritto da {name}',
  allPosts: 'Tutti gli articoli di {name}',
};

export function communityStrings(locale: string): Strings {
  return locale.startsWith('it') ? IT : EN;
}

const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

/** A comment's text: paragraphs, line breaks and links (nofollow), nothing else. */
export function CommentText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <>
      {paragraphs.map((paragraph, i) => {
        const lines = paragraph.split('\n');
        return (
          <p key={i}>
            {lines.map((line, j) => {
              const parts: ReactNode[] = [];
              let last = 0;
              for (const match of line.matchAll(URL_RE)) {
                parts.push(line.slice(last, match.index));
                parts.push(
                  <a key={match.index} href={match[0]} rel="nofollow ugc noopener">
                    {match[0]}
                  </a>,
                );
                last = match.index + match[0].length;
              }
              parts.push(line.slice(last));
              return (
                <span key={j}>
                  {j > 0 && <br />}
                  {parts}
                </span>
              );
            })}
          </p>
        );
      })}
    </>
  );
}

function Avatar({ comment }: { comment: PublicComment }) {
  return comment.avatar.url ? (
    <img
      className="cx-avatar"
      src={comment.avatar.url}
      alt=""
      width={44}
      height={44}
      loading="lazy"
    />
  ) : (
    <span className="cx-avatar cx-avatar--initials" aria-hidden="true">
      {comment.avatar.initials}
    </span>
  );
}

function CommentItem({
  comment,
  depth,
  comments,
  entryUrl,
  t,
  dateFormat,
}: {
  comment: PublicComment;
  depth: number;
  comments: EntryComments;
  entryUrl: string;
  t: Strings;
  dateFormat: Intl.DateTimeFormat;
}) {
  const name = comment.authorUrl ? (
    <a href={comment.authorUrl} rel="nofollow ugc noopener" className="cx-comment__author">
      {comment.authorName}
    </a>
  ) : (
    <span className="cx-comment__author">{comment.authorName}</span>
  );
  return (
    <li
      className={`cx-comment${comment.byPostAuthor ? ' cx-comment--by-author' : ''}`}
      id={`comment-${comment.id}`}
    >
      <article className="cx-comment__body">
        <header className="cx-comment__meta">
          <Avatar comment={comment} />
          <div>
            {name}
            {comment.byPostAuthor && <span className="cx-comment__badge">{t.author}</span>}
            <a className="cx-comment__date" href={`#comment-${comment.id}`}>
              <time dateTime={comment.createdAt}>
                {dateFormat.format(new Date(comment.createdAt))}
              </time>
            </a>
          </div>
        </header>
        {comment.pending && <p className="cx-comment__pending">{t.awaiting}</p>}
        <div className="cx-comment__content">
          <CommentText text={comment.content} />
        </div>
        {comments.open && !comment.pending && depth < comments.threadDepth && (
          <a
            className="cx-comment__reply"
            href={`${entryUrl}?replyto=${comment.id}#respond`}
            data-cx-reply={comment.id}
            data-cx-reply-name={comment.authorName}
            rel="nofollow"
          >
            {t.reply}
          </a>
        )}
      </article>
      {comment.replies.length > 0 && (
        <ol className="cx-comments__children">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              comments={comments}
              entryUrl={entryUrl}
              t={t}
              dateFormat={dateFormat}
            />
          ))}
        </ol>
      )}
    </li>
  );
}

/** The comments of an entry: the list, the pages and the form. */
export function Comments({ entry }: { entry?: PublicEntry }) {
  const page = usePage();
  const current = entry ?? page.entry;
  const comments = current?.comments;
  if (!current || !comments) return null;
  const t = communityStrings(page.locale);
  const viewer = page.viewer ?? null;
  const dateFormat = new Intl.DateTimeFormat(page.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: page.site.timezone,
  });
  const title =
    comments.count === 0
      ? t.comments
      : comments.count === 1
        ? t.oneComment
        : fill(t.manyComments, { n: comments.count });
  const pageUrl = (n: number) => `${current.url}${n > 1 ? `?comments-page=${n}` : ''}#comments`;
  const loginUrl = page.urls.login
    ? `${page.urls.login}?redirect=${encodeURIComponent(current.url)}`
    : null;
  return (
    <section className="cx-comments" id="comments" aria-labelledby="comments-title">
      <h2 className="cx-comments__title" id="comments-title">
        {title}
      </h2>
      {comments.notice && (
        <p
          className={`cx-notice cx-notice--${comments.notice.kind === 'error' ? 'error' : 'ok'}`}
          role="status"
        >
          {comments.notice.kind === 'pending'
            ? t.pending
            : comments.notice.kind === 'posted'
              ? t.posted
              : comments.notice.text}
        </p>
      )}
      {comments.items.length > 0 ? (
        <ol className="cx-comments__list">
          {comments.items.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              depth={1}
              comments={comments}
              entryUrl={current.url}
              t={t}
              dateFormat={dateFormat}
            />
          ))}
        </ol>
      ) : (
        comments.open && <p className="cx-comments__empty">{t.noComments}</p>
      )}
      {comments.pages > 1 && (
        <nav className="cx-comments__pages" aria-label={t.comments}>
          {comments.page > 1 && <a href={pageUrl(comments.page - 1)}>← {t.older}</a>}
          {comments.page < comments.pages && <a href={pageUrl(comments.page + 1)}>{t.newer} →</a>}
        </nav>
      )}
      {!comments.open ? (
        comments.count > 0 && <p className="cx-comments__closed">{t.closed}</p>
      ) : comments.registrationRequired && !viewer ? (
        <p className="cx-comments__login">
          {t.mustLogin} {loginUrl && <a href={loginUrl}>{t.signIn}</a>}
          {page.urls.register && (
            <>
              {' · '}
              <a href={page.urls.register}>{t.signUp}</a>
            </>
          )}
        </p>
      ) : (
        <CommentForm entry={current} comments={comments} t={t} />
      )}
    </section>
  );
}

function CommentForm({
  entry,
  comments,
  t,
}: {
  entry: PublicEntry;
  comments: EntryComments;
  t: Strings;
}) {
  const page = usePage();
  const viewer = page.viewer ?? null;
  const req = comments.requireNameEmail;
  return (
    <div className="cx-respond" id="respond">
      <h3 className="cx-respond__title">
        <span data-cx-reply-title={t.leaveComment}>
          {comments.replyTo
            ? fill(t.replyTo, { name: comments.replyTo.authorName })
            : t.leaveComment}
        </span>{' '}
        <a
          href={`${entry.url}#respond`}
          className="cx-respond__cancel"
          data-cx-cancel-reply=""
          hidden={!comments.replyTo}
        >
          {t.cancelReply}
        </a>
      </h3>
      <form className="cx-form" method="post" action={comments.action} data-cx-comment-form="">
        <input type="hidden" name="entry" value={entry.id} />
        <input type="hidden" name="parent" value={comments.replyTo?.id ?? ''} data-cx-parent="" />
        <input type="hidden" name="back" value={entry.url} />
        {/* Left empty by people; bots fill it in. */}
        <div className="cx-hp" aria-hidden="true">
          <label>
            Website
            <input type="text" name="homepage" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <input type="hidden" name="ts" value="" data-cx-ts="" />
        {viewer ? (
          <p className="cx-form__who">
            {fill(t.signedInAs, { name: viewer.displayName })}{' '}
            {page.urls.logout && (
              <a href={page.urls.account ?? '#'} data-cx-logout={page.urls.logout}>
                {t.signOut}
              </a>
            )}
          </p>
        ) : (
          <p className="cx-form__note">{t.emailNote}</p>
        )}
        <p className="cx-field">
          <label htmlFor="cx-comment">{t.comment}</label>
          <textarea id="cx-comment" name="comment" rows={6} maxLength={10000} required />
        </p>
        {!viewer && (
          <div className="cx-fields">
            <p className="cx-field">
              <label htmlFor="cx-name">
                {t.name}
                {req && <span className="cx-required"> *</span>}
              </label>
              <input
                id="cx-name"
                name="name"
                type="text"
                autoComplete="name"
                maxLength={120}
                required={req}
                data-cx-remember="name"
              />
            </p>
            <p className="cx-field">
              <label htmlFor="cx-email">
                {t.email}
                {req && <span className="cx-required"> *</span>}
              </label>
              <input
                id="cx-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={200}
                required={req}
                data-cx-remember="email"
              />
            </p>
            <p className="cx-field">
              <label htmlFor="cx-url">{t.website}</label>
              <input
                id="cx-url"
                name="url"
                type="url"
                autoComplete="url"
                maxLength={300}
                data-cx-remember="url"
              />
            </p>
          </div>
        )}
        <p className="cx-check">
          <label>
            <input type="checkbox" name="notify" value="1" /> {t.notify}
          </label>
        </p>
        <Challenge html={comments.protection} />
        <p>
          <button type="submit" className="cx-button">
            {t.post}
          </button>
        </p>
      </form>
    </div>
  );
}

/** Like button and share links of an entry. */
export function EntryActions({ entry }: { entry?: PublicEntry }) {
  const page = usePage();
  const current = entry ?? page.entry;
  // Only under entries that take comments or likes (not on account pages).
  if (!current || (!current.likes && !current.comments) || (!current.likes && !page.share))
    return null;
  const t = communityStrings(page.locale);
  const url = new URL(current.url, page.site.origin).href;
  const text = encodeURIComponent(current.title);
  const u = encodeURIComponent(url);
  const networks = [
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ['X', `https://x.com/intent/post?url=${u}&text=${text}`],
    ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ['WhatsApp', `https://wa.me/?text=${text}%20${u}`],
    ['Telegram', `https://t.me/share/url?url=${u}&text=${text}`],
    ['Email', `mailto:?subject=${text}&body=${u}`],
  ] as const;
  return (
    <div className="cx-actions">
      {current.likes && (
        <form method="post" action={current.likes.action} className="cx-like" data-cx-like="">
          <input type="hidden" name="entry" value={current.id} />
          <input type="hidden" name="back" value={current.url} />
          <button type="submit" className="cx-like__button" aria-pressed={current.likes.liked}>
            <span aria-hidden="true">♥</span>{' '}
            <span data-cx-like-label="">{current.likes.liked ? t.liked : t.like}</span>{' '}
            <span className="cx-like__count" data-cx-like-count="">
              {current.likes.count}
            </span>
          </button>
        </form>
      )}
      {page.share && (
        <div className="cx-share" role="group" aria-label={t.share}>
          <span className="cx-share__label">{t.share}:</span>
          {networks.map(([name, href]) =>
            name === 'Email' ? (
              // Cloudflare's email obfuscation turns mailto: links into
              // /cdn-cgi/l/email-protection addresses; these comments tell it not to.
              <span
                key={name}
                className="cx-share__email"
                dangerouslySetInnerHTML={{
                  __html: `<!--email_off--><a href="${attribute(href)}" rel="noopener noreferrer">${name}</a><!--/email_off-->`,
                }}
              />
            ) : (
              <a key={name} href={href} target="_blank" rel="noopener noreferrer">
                {name}
              </a>
            ),
          )}
          <button type="button" data-cx-copy={url} data-cx-copied={t.copied} hidden>
            {t.copyLink}
          </button>
        </div>
      )}
    </div>
  );
}

/** Text for an HTML attribute value. */
function attribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Everything under an entry: like, share and comments. */
/** Two letters for people without a picture. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? [words[0]![0], words.at(-1)![0]] : [...(words[0] ?? '?')].slice(0, 2);
  return letters.join('').toUpperCase();
}

/**
 * The author of an entry with picture, bio and a link to their posts, as
 * WordPress themes show it under posts. With `author`, any person (e.g. on
 * an author page).
 */
export function AuthorBox({
  author: given,
  entry,
  variant = 'entry',
}: {
  author?: EntryAuthor;
  entry?: PublicEntry;
  /** `page`: on the author's own page, without the name and the link to it. */
  variant?: 'entry' | 'page';
}) {
  const page = usePage();
  const author = given ?? (entry ?? page.entry)?.author;
  if (!author) return null;
  const t = communityStrings(page.locale);
  const full = variant === 'entry';
  // On the author's page the name is already the title: without a bio or a
  // website there is nothing to add.
  if (!full && !author.bio && !author.website) return null;
  const links = (full && author.url) || author.website;
  return (
    <section className={`cx-author cx-author--${variant}`} aria-label={t.author}>
      {author.avatarUrl ? (
        <img
          className="cx-avatar cx-author__avatar"
          src={author.avatarUrl}
          alt=""
          width={72}
          height={72}
          loading="lazy"
        />
      ) : (
        <span className="cx-avatar cx-avatar--initials cx-author__avatar" aria-hidden="true">
          {initials(author.displayName)}
        </span>
      )}
      <div className="cx-author__body">
        {full && (
          <h2 className="cx-author__name">{fill(t.writtenBy, { name: author.displayName })}</h2>
        )}
        {author.bio && (
          <div className="cx-author__bio">
            <CommentText text={author.bio} />
          </div>
        )}
        {links && (
          <p className="cx-author__links">
            {full && author.url && (
              <a href={author.url} rel="author">
                {fill(t.allPosts, { name: author.displayName })}
              </a>
            )}
            {author.website && (
              <a href={author.website} rel="me nofollow noopener">
                {t.website}
              </a>
            )}
          </p>
        )}
      </div>
    </section>
  );
}

export function EntryCommunity({ entry }: { entry?: PublicEntry }) {
  const page = usePage();
  const target = entry ?? page.entry;
  return (
    <div className="cx-community">
      {target?.author?.bio && <AuthorBox entry={target} />}
      <EntryActions {...(entry ? { entry } : {})} />
      <Comments {...(entry ? { entry } : {})} />
    </div>
  );
}

/** Default look, added to pages that show comments or likes. Themes override it. */
export const COMMUNITY_CSS = `
.cx-community{margin:3rem auto 0;max-width:var(--cx-content-width,46rem);padding:0 1rem}
.cx-actions{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1.5rem;padding:1rem 0;border-top:1px solid rgba(127,127,127,.25);border-bottom:1px solid rgba(127,127,127,.25)}
.cx-like{margin:0}.cx-like__button{display:inline-flex;align-items:center;gap:.4em;padding:.4em .9em;border:1px solid currentColor;border-radius:999px;background:none;color:inherit;font:inherit;cursor:pointer}
.cx-like__button[aria-pressed=true]{color:#e11d48}
.cx-share{display:flex;flex-wrap:wrap;gap:.25rem .75rem;align-items:center;font-size:.9em}.cx-share button{font:inherit;background:none;border:0;padding:0;color:inherit;text-decoration:underline;cursor:pointer}
.cx-comments{margin-top:2rem}.cx-comments__list,.cx-comments__children{list-style:none;margin:0;padding:0}
.cx-comments__children{margin-left:1.25rem;padding-left:1rem;border-left:2px solid rgba(127,127,127,.2)}
.cx-comment{margin:1.25rem 0}.cx-comment__meta{display:flex;gap:.75rem;align-items:center}.cx-comment__meta>div{display:flex;flex-wrap:wrap;gap:.25rem .6rem;align-items:baseline}
.cx-comment__author{font-weight:600}.cx-comment__date{font-size:.85em;opacity:.75}.cx-comment__badge{font-size:.75em;padding:.05em .5em;border-radius:999px;background:rgba(127,127,127,.15)}
.cx-comment__content{margin:.5rem 0 0 calc(44px + .75rem)}.cx-comment__content p{margin:.4rem 0}.cx-comment__reply{margin-left:calc(44px + .75rem);font-size:.9em}
.cx-comment__pending{margin:.4rem 0 0 calc(44px + .75rem);font-size:.85em;font-style:italic;opacity:.8}
.cx-avatar{width:44px;height:44px;border-radius:50%;flex:0 0 auto;object-fit:cover}.cx-avatar--initials{display:inline-grid;place-items:center;background:rgba(127,127,127,.2);font-weight:700;font-size:.9em}
.cx-respond{margin-top:2rem}.cx-form .cx-field{margin:0 0 1rem}.cx-form label{display:block;font-weight:600;margin-bottom:.3rem}
.cx-form input[type=text],.cx-form input[type=email],.cx-form input[type=url],.cx-form input[type=password],.cx-form textarea{width:100%;box-sizing:border-box;padding:.6em .7em;border:1px solid rgba(127,127,127,.45);border-radius:6px;font:inherit;background:transparent;color:inherit}
.cx-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:0 1rem}.cx-check label{display:flex;gap:.5rem;font-weight:400;align-items:center}
.cx-button{padding:.65em 1.4em;border:0;border-radius:6px;background:var(--cx-accent,#1d4ed8);color:#fff;font:inherit;font-weight:600;cursor:pointer}
.cx-notice{padding:.75rem 1rem;border-radius:6px;background:rgba(22,163,74,.12)}.cx-notice--error{background:rgba(220,38,38,.12)}
.cx-hp{position:absolute!important;left:-9999px;width:1px;height:1px;overflow:hidden}.cx-required{color:#dc2626}.cx-challenge{margin:0 0 1rem}
.cx-author{display:flex;gap:1rem;align-items:flex-start;margin-block:0 1.5rem;padding:1.25rem;border-radius:8px;background:rgba(127,127,127,.08)}
.cx-author__avatar{width:72px;height:72px;font-size:1.2em}.cx-author__name{margin:0 0 .4rem;font-size:1.05em}.cx-author__bio p{margin:.3rem 0}
.cx-author__links{display:flex;flex-wrap:wrap;gap:.25rem 1rem;margin:.5rem 0 0;font-size:.9em}
.cx-comments__pages{display:flex;justify-content:space-between;margin:1rem 0}
.cx-account{margin-block-end:3rem}.cx-account>*{max-width:28rem}.cx-account__links{font-size:.95em}.cx-account h2{margin-top:2.5rem;font-size:1.2em}
.cx-button--quiet{background:transparent;color:inherit;border:1px solid currentColor}.cx-button--danger{background:#dc2626}
.cx-danger{margin-top:2.5rem;padding:1rem;border:1px solid rgba(220,38,38,.4);border-radius:6px}.cx-danger summary{cursor:pointer;font-weight:600}
.cx-account-links ul{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;list-style:none;margin:0 0 1.5rem;padding:0 0 1rem;border-bottom:1px solid rgba(127,127,127,.25)}.cx-account-links a{font-weight:600}
`;

/** Small script: replies in place, remembered name and email, likes without reloading, copy link. */
export const COMMUNITY_JS = `(function(){
var f=document.querySelector('[data-cx-comment-form]');
document.querySelectorAll('[data-cx-ts]').forEach(function(i){i.value=String(Date.now())});
if(f){
var store={};try{store=JSON.parse(localStorage.getItem('cx-commenter')||'{}')}catch(e){}
f.querySelectorAll('[data-cx-remember]').forEach(function(i){var k=i.getAttribute('data-cx-remember');if(store[k]&&!i.value)i.value=store[k]});
f.addEventListener('submit',function(){var s={};f.querySelectorAll('[data-cx-remember]').forEach(function(i){s[i.getAttribute('data-cx-remember')]=i.value});try{localStorage.setItem('cx-commenter',JSON.stringify(s))}catch(e){}});
var reset=function(){var c=window.cleitextChallenge;if(c&&c.reset)c.reset(f)};
var respond=document.getElementById('respond'),home=respond&&respond.parentNode,next=respond&&respond.nextSibling,title=respond&&respond.querySelector('[data-cx-reply-title]'),cancel=respond&&respond.querySelector('[data-cx-cancel-reply]'),parent=f.querySelector('[data-cx-parent]'),original=title&&(title.getAttribute('data-cx-reply-title')||title.textContent);
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('[data-cx-reply]');if(a&&respond){e.preventDefault();a.closest('article').after(respond);parent.value=a.getAttribute('data-cx-reply');title.textContent=a.textContent+' — '+a.getAttribute('data-cx-reply-name');cancel.hidden=false;reset();f.querySelector('textarea').focus()}
var c=e.target.closest&&e.target.closest('[data-cx-cancel-reply]');if(c&&respond){e.preventDefault();home.insertBefore(respond,next);parent.value='';title.textContent=original;cancel.hidden=true;reset()}});
var q=new URLSearchParams(location.search).get('replyto');if(q){var link=document.querySelector('[data-cx-reply="'+q+'"]');if(link)link.click()}}
document.querySelectorAll('[data-cx-like]').forEach(function(form){form.addEventListener('submit',function(e){e.preventDefault();fetch(form.action,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:new URLSearchParams(new FormData(form)),credentials:'same-origin'}).then(function(r){return r.json()}).then(function(d){if(typeof d.count!=='number')return;var b=form.querySelector('button');b.setAttribute('aria-pressed',String(d.liked));form.querySelector('[data-cx-like-count]').textContent=d.count;var l=form.querySelector('[data-cx-like-label]');if(l&&d.label)l.textContent=d.label}).catch(function(){form.submit()})})});
document.querySelectorAll('[data-cx-copy]').forEach(function(b){b.hidden=false;b.addEventListener('click',function(){navigator.clipboard&&navigator.clipboard.writeText(b.getAttribute('data-cx-copy')).then(function(){b.textContent=b.getAttribute('data-cx-copied')})})});
document.querySelectorAll('[data-cx-logout]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var form=document.createElement('form');form.method='post';form.action=a.getAttribute('data-cx-logout');document.body.appendChild(form);form.submit()})});
})();`;
