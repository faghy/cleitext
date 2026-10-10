import type { AuthContext } from '../common/request-context.js';

/**
 * Toolbar shown on the public site to signed-in users, as in WordPress: it
 * says who is signed in and leads to the admin, or to the editor of the page
 * being viewed. Pages with it are never cached (signed-in requests bypass the
 * page cache), and it works with every theme.
 */

const LABELS = {
  en: {
    toolbar: 'Toolbar',
    dashboard: 'Dashboard',
    editArticle: 'Edit post',
    editPage: 'Edit page',
    edit: 'Edit',
    signedIn: 'Signed in as',
  },
  it: {
    toolbar: 'Barra degli strumenti',
    dashboard: 'Bacheca',
    editArticle: 'Modifica articolo',
    editPage: 'Modifica pagina',
    edit: 'Modifica',
    signedIn: 'Connesso come',
  },
} as const;

const STYLE = `<style>
#cleitext-admin-bar{position:sticky;top:0;z-index:99999;display:flex;align-items:center;gap:4px;
min-height:32px;padding:0 8px;margin:0;background:#1d2327;color:#f0f0f1;
font:13px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-sizing:border-box}
#cleitext-admin-bar a{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;color:#f0f0f1;
text-decoration:none;border-radius:2px}
#cleitext-admin-bar a:hover,#cleitext-admin-bar a:focus-visible{background:#2c3338;color:#72aee6}
#cleitext-admin-bar a:focus-visible{outline:2px solid #72aee6;outline-offset:-2px}
#cleitext-admin-bar .cab-site{font-weight:600}
#cleitext-admin-bar .cab-user{margin-left:auto}
#cleitext-admin-bar .cab-user img,#cleitext-admin-bar .cab-user span[aria-hidden]{width:18px;height:18px;
border-radius:50%;object-fit:cover}
#cleitext-admin-bar .cab-user span[aria-hidden]{display:inline-flex;align-items:center;justify-content:center;
background:#3858e9;font-size:10px;font-weight:600}
@media (max-width:600px){#cleitext-admin-bar .cab-label{position:absolute;width:1px;height:1px;
overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}}
@media print{#cleitext-admin-bar{display:none}}
</style>`;

export interface AdminBarOptions {
  auth: AuthContext;
  siteName: string;
  /** The entry shown, when the page is one. */
  entry?: { id: string; type: string };
}

export function adminBar({ auth, siteName, entry }: AdminBarOptions): string {
  const t = auth.locale.toLowerCase().startsWith('it') ? LABELS.it : LABELS.en;
  const canEdit = auth.capabilities.includes('edit_entries');
  const editLabel =
    entry?.type === 'article' ? t.editArticle : entry?.type === 'page' ? t.editPage : t.edit;
  const initials = auth.displayName.trim().charAt(0).toUpperCase() || '?';
  const avatar = auth.avatarUrl
    ? `<img src="${escape(auth.avatarUrl)}" alt="">`
    : `<span aria-hidden="true">${escape(initials)}</span>`;
  const links = [
    `<a class="cab-site" href="/admin/" title="${escape(t.dashboard)}">${icon('M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z')}<span class="cab-label">${escape(siteName)}</span></a>`,
    canEdit && entry
      ? `<a href="/admin/entries/${encodeURIComponent(entry.id)}">${icon('M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z')}<span class="cab-label">${escape(editLabel)}</span></a>`
      : '',
    `<a class="cab-user" href="/admin/profile"><span class="cab-label">${escape(t.signedIn)} ${escape(auth.displayName)}</span>${avatar}</a>`,
  ];
  return `${STYLE}<nav id="cleitext-admin-bar" aria-label="${escape(t.toolbar)}">${links.join('')}</nav>`;
}

/** Puts the toolbar at the start of the page body. */
export function withAdminBar(html: string, options: AdminBarOptions): string {
  const body = /<body[^>]*>/i.exec(html);
  if (!body) return html;
  const at = body.index + body[0].length;
  return html.slice(0, at) + adminBar(options) + html.slice(at);
}

function icon(path: string): string {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
