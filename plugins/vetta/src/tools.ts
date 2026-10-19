/**
 * Small pure parts of the server: link attributes and image texts in the
 * page's HTML, the rules of the 404 log, llms.txt and robots.txt.
 */
import { filenameWords, replaceVariables, resetCounters } from './variables.js';

const hostOf = (href: string) =>
  /^(?:https?:)?\/\/([^/:?#]+)/i
    .exec(href)?.[1]
    ?.toLowerCase()
    .replace(/^www\./, '') ?? null;

const inList = (host: string, domains: string[]) =>
  domains.some((d) => host === d || host.endsWith(`.${d}`));

export interface LinkOptions {
  host: string;
  nofollowExternal: boolean;
  newWindowExternal: boolean;
  nofollowImages: boolean;
  /** Always nofollow / never nofollow, whatever the rest says. */
  nofollowDomains: string[];
  followDomains: string[];
}

function setAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i');
  return re.test(tag)
    ? tag.replace(re, ` ${name}="${value}"`)
    : tag.replace(/\s*\/?>$/, (end) => ` ${name}="${value}"${end}`);
}

function getAttr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
}

/**
 * Links to other sites in the content: `nofollow` and a new window as the
 * settings say, always `noopener`. Links with `role="button"` and those
 * already marked `dofollow` are left alone.
 */
export function linkAttributes(html: string, o: LinkOptions): string {
  const own = o.host
    .toLowerCase()
    .replace(/^www\./, '')
    .split(':')[0]!;
  return html.replace(/<a\b[^>]*>/gi, (tag) => {
    const href = getAttr(tag, 'href');
    const host = href ? hostOf(href) : null;
    if (!host || host === own || /role\s*=\s*["']?button/i.test(tag)) return tag;
    const rel = new Set((getAttr(tag, 'rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean));
    if (rel.has('dofollow')) return tag;
    const image = /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(href!);
    const nofollow =
      inList(host, o.nofollowDomains) ||
      (!inList(host, o.followDomains) && (o.nofollowExternal || (image && o.nofollowImages)));
    if (nofollow) rel.add('nofollow');
    let out = tag;
    if (o.newWindowExternal && !getAttr(tag, 'target')) out = setAttr(out, 'target', '_blank');
    if (getAttr(out, 'target') === '_blank') rel.add('noopener');
    return rel.size ? setAttr(out, 'rel', [...rel].join(' ')) : out;
  });
}

/** Images without an alternative text (or a title) get one from the format: `%filename%`, `%title%`… */
export function imageTexts(
  html: string,
  o: {
    addAlt: boolean;
    altFormat: string;
    addTitle: boolean;
    titleFormat: string;
    title: string;
    sitename: string;
  },
): string {
  resetCounters();
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = getAttr(tag, 'src') ?? getAttr(tag, 'data-src') ?? '';
    const vars = { sep: '', sitename: o.sitename, title: o.title, filename: filenameWords(src) };
    let out = tag;
    if (
      o.addAlt &&
      !(getAttr(tag, 'alt') ?? '').trim() &&
      !/aria-hidden\s*=\s*["']?true/i.test(tag)
    ) {
      const alt = replaceVariables(o.altFormat || '%filename%', vars);
      if (alt) out = setAttr(out, 'alt', escape(alt));
    }
    if (o.addTitle && !(getAttr(tag, 'title') ?? '').trim()) {
      const title = replaceVariables(o.titleFormat || '%title%', vars);
      if (title) out = setAttr(out, 'title', escape(title));
    }
    return out;
  });
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Lines `comparison:pattern` (exact, contains, start, end, regex) of addresses kept out of the 404 log. */
export function excluded(path: string, rules: string): boolean {
  for (const line of rules
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)) {
    const m = /^(exact|contains|start|end|regex):\s*(.+)$/i.exec(line);
    const [kind, pattern] = m ? [m[1]!.toLowerCase(), m[2]!] : ['contains', line];
    if (kind === 'exact' && path === pattern) return true;
    if (kind === 'contains' && path.includes(pattern)) return true;
    if (kind === 'start' && path.startsWith(pattern)) return true;
    if (kind === 'end' && path.endsWith(pattern)) return true;
    if (kind === 'regex') {
      try {
        if (pattern.length <= 200 && new RegExp(pattern).test(path)) return true;
      } catch {
        // A broken pattern excludes nothing.
      }
    }
  }
  return false;
}

/** Addresses bots ask for on every site: not worth logging. */
export const NOISE =
  /\.(php|asp|aspx|env|git|sql|bak|ini|cgi)(\/|$)|^\/(wp-|xmlrpc|\.well-known\/|cgi-bin|vendor\/|\.)/i;

export interface LlmsSection {
  title: string;
  items: { title: string; url: string; excerpt: string }[];
}

/** llms.txt: the site, a summary, its sitemap and its main pages, in Markdown. */
export function llmsText(input: {
  name: string;
  summary: string;
  origin: string;
  sections: LlmsSection[];
  extra: string;
}): string {
  const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/[[\]]/g, '').trim();
  const out = [`# ${clean(input.name)}`, ''];
  if (input.summary.trim()) out.push(`> ${clean(input.summary)}`, '');
  out.push('## Sitemaps', '', `- [XML sitemap](${input.origin}/sitemap.xml)`, '');
  for (const section of input.sections) {
    if (section.items.length === 0) continue;
    out.push(`## ${clean(section.title)}`, '');
    for (const item of section.items) {
      const url = item.url.startsWith('http') ? item.url : `${input.origin}${item.url}`;
      const excerpt = clean(item.excerpt).slice(0, 200);
      out.push(`- [${clean(item.title)}](${url})${excerpt ? `: ${excerpt}` : ''}`);
    }
    out.push('');
  }
  if (input.extra.trim()) out.push(input.extra.trim(), '');
  return `${out.join('\n').trim()}\n`;
}

/** The owner's robots.txt, with the sitemap line when they left it out. */
export function robotsText(custom: string, sitemap: string): string {
  const text = custom.replace(/\r\n/g, '\n').trim();
  return /^\s*sitemap\s*:/im.test(text) ? `${text}\n` : `${text}\n\nSitemap: ${sitemap}\n`;
}
