/**
 * A copy of a site on another address (a clone made by a hosting panel, a
 * move): the absolute addresses of the old domain written in the content
 * (links pasted in the editor, menu items, settings) are rewritten to the
 * new one, as `site:domain:replace --content` does.
 */
import { withSiteContext, type Database } from '@cleitext/db';
import { findSite, rewriteStoredText } from './media-rename.js';

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `//<from>` and `//www.<from>` (with http:, https: or no scheme) become
 * `//<to>` in the site's stored content: a longer name that only starts with
 * `<from>` (`<from>.au`, `<from>-shop.it`) and e-mail addresses stay. Rows and
 * addresses changed, by table.
 */
export async function rewriteHost(
  db: Database,
  siteRef: string,
  from: string,
  to: string,
): Promise<Record<string, { rows: number; addresses: number }>> {
  const site = await findSite(db, siteRef);
  const source = from
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  const target = to.trim().toLowerCase();
  if (source === target) return {};
  const pattern = new RegExp(
    `((?:https?:)?)//(?:www\\.)?${escape(source)}(?![a-z0-9-]|\\.[a-z0-9])`,
    'gi',
  );
  return withSiteContext(db, site.id, (tx) =>
    rewriteStoredText(
      tx,
      site.id,
      `%${source}%`,
      pattern,
      (_match, scheme) => `${scheme ?? ''}//${target}`,
    ),
  );
}
