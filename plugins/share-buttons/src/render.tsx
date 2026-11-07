import type { ReactNode } from 'react';
import { ICONS } from './icons';
import { BY_ID, DEFAULT_FEDIVERSE, DEFAULT_SOCIAL, NETWORKS, type Network } from './networks';

/** The settings that shape the buttons (Settings → Share Buttons). */
export interface ShareConfig {
  social: string[];
  fediverse: string[];
  email: boolean;
  copy: boolean;
  /** `labels`: icon and name; `icons`: icons only (the name for screen readers). */
  look: 'labels' | 'icons';
}

export const DEFAULT_CONFIG: ShareConfig = {
  social: DEFAULT_SOCIAL,
  fediverse: DEFAULT_FEDIVERSE,
  email: true,
  copy: true,
  look: 'labels',
};

interface Strings {
  social: string;
  fediverse: string;
  others: string;
  othersTitle: string;
  instagramTitle: string;
  orSend: string;
  or: string;
  copy: string;
  copied: string;
  share: string;
}

const STRINGS: Record<'en' | 'it' | 'es' | 'de', Strings> = {
  en: {
    social: 'Share on social networks:',
    fediverse: 'Share on the fediverse:',
    others: 'Others',
    othersTitle: 'Other servers of the fediverse (Misskey, Friendica, GoToSocial…)',
    instagramTitle: 'Copies the link and opens Instagram',
    orSend: 'Or send it by',
    or: 'or',
    copy: 'Copy link',
    copied: 'Link copied',
    share: 'Share',
  },
  it: {
    social: 'Condividi con i social:',
    fediverse: 'Condividi con il fediverso:',
    others: 'Altri',
    othersTitle: 'Altri server del fediverso (Misskey, Friendica, GoToSocial…)',
    instagramTitle: 'Copia il link e apre Instagram',
    orSend: 'Oppure invia via',
    or: 'o',
    copy: 'Copia il link',
    copied: 'Link copiato',
    share: 'Condividi',
  },
  es: {
    social: 'Compartir en redes sociales:',
    fediverse: 'Compartir en el fediverso:',
    others: 'Otros',
    othersTitle: 'Otros servidores del fediverso (Misskey, Friendica, GoToSocial…)',
    instagramTitle: 'Copia el enlace y abre Instagram',
    orSend: 'O envíalo por',
    or: 'o',
    copy: 'Copiar el enlace',
    copied: 'Enlace copiado',
    share: 'Compartir',
  },
  de: {
    social: 'In sozialen Netzwerken teilen:',
    fediverse: 'Im Fediverse teilen:',
    others: 'Andere',
    othersTitle: 'Andere Server des Fediverse (Misskey, Friendica, GoToSocial…)',
    instagramTitle: 'Kopiert den Link und öffnet Instagram',
    orSend: 'Oder per',
    or: 'oder',
    copy: 'Link kopieren',
    copied: 'Link kopiert',
    share: 'Teilen',
  },
};

export function stringsFor(locale: string): Strings {
  const lang = locale.slice(0, 2).toLowerCase();
  return STRINGS[(lang in STRINGS ? lang : 'en') as keyof typeof STRINGS];
}

const encode = (value: string) => encodeURIComponent(value);

/** A share address for a page: `{url}` and `{title}` filled in (URL-encoded). */
export function fill(template: string, url: string, title: string): string {
  return template.split('{url}').join(encode(url)).split('{title}').join(encode(title));
}

function Icon({ name, uid }: { name: string; uid: string }) {
  const icon = ICONS[name];
  if (!icon) return null;
  if (icon.svg) {
    return (
      <svg
        className="sb-icon"
        viewBox={icon.viewBox}
        aria-hidden="true"
        focusable="false"
        dangerouslySetInnerHTML={{ __html: icon.svg.split('{id}').join(`sb-${name}-${uid}`) }}
      />
    );
  }
  return (
    <svg className="sb-icon" viewBox={icon.viewBox} aria-hidden="true" focusable="false">
      <path d={icon.d} />
    </svg>
  );
}

/**
 * The buttons. Their addresses are written for `url` (the page's address,
 * or its path when the host is not known) and completed by the page script
 * with the full address the visitor sees.
 */
export function ShareButtons({
  config,
  url,
  title,
  locale,
  uid,
}: {
  config: ShareConfig;
  url: string;
  title: string;
  locale: string;
  uid: string;
}) {
  const t = stringsFor(locale);
  const iconsOnly = config.look === 'icons';
  const link = (network: Network): ReactNode => {
    const name = network.id === 'fediverse' ? t.others : network.label;
    const title_ =
      network.id === 'fediverse'
        ? t.othersTitle
        : network.copyFirst
          ? t.instagramTitle
          : iconsOnly
            ? name
            : undefined;
    return (
      <li key={network.id}>
        <a
          className={`sb-link sb-${network.id}`}
          href={fill(network.url, url, title)}
          data-sb-tpl={network.url}
          target="_blank"
          rel="noopener noreferrer"
          {...(title_ ? { title: title_ } : {})}
          {...(iconsOnly ? { 'aria-label': name } : {})}
          {...(network.copyFirst ? { 'data-sb-copy': '' } : {})}
        >
          <Icon name={network.id} uid={uid} />
          {iconsOnly ? null : <span>{name}</span>}
        </a>
      </li>
    );
  };
  const rows = (ids: string[]) =>
    ids.map((id) => BY_ID.get(id)).filter((n): n is Network => Boolean(n));
  const social = rows(config.social).filter((n) => n.group === 'social');
  const fediverse = rows(config.fediverse).filter((n) => n.group === 'fediverse');
  const email = 'mailto:?subject={title}&body={url}';
  if (!social.length && !fediverse.length && !config.email && !config.copy) return null;
  return (
    <div
      className={`sb${iconsOnly ? ' sb--icons' : ''}`}
      role="group"
      aria-label={t.share}
      data-sb-title={title}
    >
      {social.length > 0 && (
        <div className="sb-row">
          <span className="sb-label">{t.social}</span>
          <ul className="sb-list">{social.map(link)}</ul>
        </div>
      )}
      {fediverse.length > 0 && (
        <div className="sb-row">
          <span className="sb-label">{t.fediverse}</span>
          <ul className="sb-list">{fediverse.map(link)}</ul>
        </div>
      )}
      {(config.email || config.copy) && (
        <div className="sb-row">
          <span className="sb-label">{t.orSend}</span>
          {config.email && (
            // Cloudflare's email obfuscation turns mailto: links into
            // /cdn-cgi/l/email-protection addresses; these comments tell it not to.
            <span
              dangerouslySetInnerHTML={{
                __html: `<!--email_off--><a class="sb-link sb-email" href="${attr(fill(email, url, title))}" data-sb-tpl="${attr(email)}" rel="noopener noreferrer"${iconsOnly ? ' aria-label="Email" title="Email"' : ''}>${iconHtml('email')}${iconsOnly ? '' : '<span>Email</span>'}</a><!--/email_off-->`,
              }}
            />
          )}
          {config.email && config.copy && <span className="sb-or">{t.or}</span>}
          {config.copy && (
            <button
              type="button"
              className="sb-link sb-copy"
              data-sb-copy=""
              hidden
              {...(iconsOnly ? { 'aria-label': t.copy, title: t.copy } : {})}
            >
              <Icon name="link" uid={uid} />
              <span data-sb-copied={t.copied} className={iconsOnly ? 'sb-sr' : undefined}>
                {t.copy}
              </span>
            </button>
          )}
        </div>
      )}
      <style data-sb-css="" dangerouslySetInnerHTML={{ __html: SHARE_CSS }} />
      <script dangerouslySetInnerHTML={{ __html: SHARE_JS }} />
    </div>
  );
}

function attr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function iconHtml(name: string): string {
  const icon = ICONS[name];
  return icon?.d
    ? `<svg class="sb-icon" viewBox="${icon.viewBox}" aria-hidden="true" focusable="false"><path d="${icon.d}"/></svg>`
    : '';
}

const colors = NETWORKS.filter((n) => n.color)
  .map((n) => `.sb-${n.id} .sb-icon{fill:${n.color}}`)
  .join('');

/** Default look: a row of rounded buttons; themes can override the `sb-` classes. */
export const SHARE_CSS =
  `.sb{display:flex;flex-direction:column;gap:.6rem;font-size:.9em;margin:1.5rem 0}
.sb-row{display:flex;flex-wrap:wrap;gap:.4rem .6rem;align-items:center}.sb-label{font-weight:600;margin-right:.15rem}
.sb-list{display:flex;flex-wrap:wrap;gap:.4rem;list-style:none;margin:0;padding:0}
.sb-link{display:inline-flex;align-items:center;gap:.4em;padding:.3em .75em;border:1px solid rgba(127,127,127,.35);border-radius:999px;background:none;color:inherit;font:inherit;line-height:1.3;text-decoration:none;cursor:pointer}
.sb-link:hover,.sb-link:focus-visible{border-color:currentColor}.sb [hidden]{display:none}
.sb--icons .sb-link{padding:.45em}.sb-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.sb-icon{width:1.05em;height:1.05em;flex:none;fill:currentColor}${colors}`.replace(/\n/g, '');

/**
 * The page script: completes the addresses with the page's full address
 * (its canonical address, else the one shown), and copies the link.
 */
export const SHARE_JS = `(function(){if(window.__sbReady)return;window.__sbReady=1;function run(){var c=document.querySelector('link[rel=canonical]'),u=(c&&c.href)||location.href.split('#')[0];document.querySelectorAll('.sb').forEach(function(g){var t=g.getAttribute('data-sb-title')||document.title;g.querySelectorAll('[data-sb-tpl]').forEach(function(a){a.href=a.getAttribute('data-sb-tpl').split('{url}').join(encodeURIComponent(u)).split('{title}').join(encodeURIComponent(t))});g.querySelectorAll('[data-sb-copy]').forEach(function(b){b.hidden=false;b.addEventListener('click',function(){if(!navigator.clipboard)return;navigator.clipboard.writeText(u).then(function(){var l=b.querySelector('[data-sb-copied]');if(l)l.textContent=l.getAttribute('data-sb-copied')}).catch(function(){})})})})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run()})();`;
