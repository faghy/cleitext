/**
 * Newsletter forms of a WordPress site that become the signup block on
 * import, with the list ids when the form says them:
 *
 * - shortcodes: the plugin's own, The Newsletter Plugin's `[newsletter]`
 *   and `[newsletter_form]` (with its `[newsletter_field]`s), Mailchimp for
 *   WP's `[mc4wp_form id]` (its lists from the `mc4wp-form` post, read in
 *   `import.wxrMeta`), MailPoet's `[mailpoet_form id]` and Brevo's
 *   `[sibwp_form id]`;
 * - blocks: Mailchimp for WP's, MailPoet's and The Newsletter Plugin's, and
 *   HTML blocks with a form embedded from Brevo (sibforms.com), Mailchimp
 *   (list-manage.com), MailerLite, Kit or ActiveCampaign (the WordPress
 *   Importer 1.30 offers those to plugins as `core/html` placeholders).
 *
 * `ref` says where a form came from (`mc4wp:12`, `mailchimp`, `brevo`…);
 * lists belong to the service named by the ref's provider, so the plugin
 * uses them only when that is the service connected (see `refProvider`).
 * Pure functions: no context, no network.
 */
import type { CxdBlock } from '@cleitext/plugin-sdk';
import { BLOCK_TYPE, SHORTCODE } from '../config';
import type { FieldSet, ProviderId, SignupAttrs } from '../model/types';

/** A Mailchimp for WP form, from its `mc4wp-form` post. */
export interface Mc4wpForm {
  lists: string[];
  html: string;
  title: string;
}

/** Mailchimp for WP's forms by WordPress post id. */
export type Mc4wpForms = Map<string, Mc4wpForm>;

/** What `import.wxrMeta` gives of an item (the fields used here). */
export interface WxrItemLike {
  id: number;
  type: string;
  title: string;
  content: string;
  meta: Record<string, string>;
}

/** The Newsletter Plugin's shortcodes (not this plugin's, whatever its name). */
const TNP_TAGS = new Set(['newsletter', 'newsletter_form']);
const OTHER_TAGS = new Set(['mc4wp_form', 'mailpoet_form', 'sibwp_form']);

export function isNewsletterShortcode(tag: string): boolean {
  const t = tag.toLowerCase();
  return t === SHORTCODE || TNP_TAGS.has(t) || OTHER_TAGS.has(t);
}

/** The service whose lists a `ref` carries, or null (lists not portable). */
export function refProvider(ref: string | undefined): ProviderId | null {
  const head = (ref ?? '').split(':')[0];
  if (head === 'mc4wp' || head === 'mailchimp') return 'mailchimp';
  if (head === 'brevo' || head === 'sibwp') return 'brevo';
  if (head === 'mailerlite' || head === 'kit' || head === 'activecampaign') return head;
  return null;
}

const block = (id: string, attrs: SignupAttrs): CxdBlock => ({
  id,
  type: BLOCK_TYPE,
  v: 1,
  attrs: Object.fromEntries(
    Object.entries(attrs).filter(([, v]) => v !== undefined && v !== ''),
  ) as Record<string, unknown>,
});

const clip = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const decode = (text: string) =>
  text
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));

const plain = (html: string) =>
  decode(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const ids = (value: unknown): string[] =>
  String(value ?? '')
    .split(/[\s,;]+/)
    .map((v) => v.trim())
    .filter((v) => /^[\w-]{1,64}$/.test(v));

/** Names of the first-name and last-name inputs of the services and plugins. */
const FIRST =
  /^(?:fname|firstname|first_name|nome|name|nn|fields\[name\]|fields\[first_name\]|first-name)$/i;
const LAST =
  /^(?:lname|lastname|last_name|cognome|surname|ns|fields\[last_name\]|fields\[surname\]|last-name)$/i;

function fieldSet(names: string[]): FieldSet {
  const last = names.some((n) => LAST.test(n));
  const first = names.some((n) => FIRST.test(n));
  return last ? 'name-surname' : first ? 'name' : 'email';
}

/** Input names of a form's markup (visible ones, not hidden or submit). */
function inputNames(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<(?:input|select|textarea)\b([^>]*)>/gi)) {
    const attrs = m[1] ?? '';
    const type = /\btype\s*=\s*["']?([\w-]+)/i.exec(attrs)?.[1]?.toLowerCase() ?? 'text';
    if (type === 'hidden' || type === 'submit' || type === 'button') continue;
    const name = /\bname\s*=\s*["']([^"']+)["']|\bname\s*=\s*([^\s>]+)/i.exec(attrs);
    if (name) out.push(decode(name[1] ?? name[2] ?? ''));
  }
  return out;
}

/** The text of the form's button. */
function buttonLabel(html: string): string {
  for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
    const attrs = m[1] ?? '';
    if (!/\btype\s*=\s*["']?submit/i.test(attrs)) continue;
    const value = /\bvalue\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1];
    if (value?.trim()) return clip(decode(value), 80);
  }
  const button = /<button\b[^>]*>([\s\S]*?)<\/button>/i.exec(html);
  return button ? clip(plain(button[1] ?? ''), 80) : '';
}

/** A short plain heading before the form's fields, if any. */
function headingOf(html: string): string {
  const form = html.search(/<input\b|<label\b|<iframe\b/i);
  const before = form >= 0 ? html.slice(0, form) : html;
  const h = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(before);
  const text = h ? plain(h[1] ?? '') : '';
  return text.length <= 120 ? text : '';
}

function fromFormHtml(html: string): Pick<SignupAttrs, 'fields' | 'buttonLabel'> {
  return { fields: fieldSet(inputNames(html)), buttonLabel: buttonLabel(html) };
}

/** A query parameter of the first URL matching `host` in the markup. */
function urlParam(html: string, host: RegExp, name: string): string {
  for (const m of html.matchAll(/(?:action|src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const raw = decode(m[1] ?? '');
    if (!host.test(raw)) continue;
    try {
      const value = new URL(raw, 'https://x.invalid').searchParams.get(name);
      if (value) return value;
    } catch {
      // not a URL
    }
  }
  return '';
}

/** Values of hidden inputs named `name` (e.g. ActiveCampaign's lists). */
function hiddenValues(html: string, name: RegExp): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
    const attrs = m[1] ?? '';
    const n = /\bname\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    const v = /\bvalue\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1];
    if (n && v && name.test(decode(n))) out.push(...ids(v));
  }
  return out;
}

/**
 * The signup form of an embedded form's markup: Brevo, Mailchimp,
 * MailerLite, Kit, ActiveCampaign. Null for anything else.
 */
export function embeddedForm(html: string): SignupAttrs | null {
  const shows = /<(?:form|iframe)\b|class=["'][^"']*\bml-embedded\b|data-sv-form/i.test(html);
  if (!shows) return null;
  const heading = headingOf(html);
  if (/\blist-manage\.com\b/i.test(html)) {
    const id = urlParam(html, /list-manage\.com/i, 'id');
    return {
      ...fromFormHtml(html),
      heading,
      lists: ids(id).join(','),
      ref: 'mailchimp',
    };
  }
  if (/\bsibforms\.com\b|\bsib-form\b/i.test(html))
    return { ...fromFormHtml(html), heading, ref: 'brevo' };
  if (/\bmailerlite\.com\b|\bml-embedded\b|\bml-form-embed/i.test(html))
    return {
      ...fromFormHtml(html),
      heading,
      lists: hiddenValues(html, /^groups\[\]$/i).join(','),
      ref: 'mailerlite',
    };
  if (/\bconvertkit\.com\b|\bkit\.com\/forms\b|\.ck\.page\b|data-sv-form/i.test(html)) {
    // Kit's "lists" are its forms: the one the markup posts to.
    const form =
      /\/forms\/(\d+)\/subscriptions/i.exec(html)?.[1] ??
      /data-sv-form\s*=\s*["'](\d+)["']/i.exec(html)?.[1] ??
      '';
    return { ...fromFormHtml(html), heading, lists: form, ref: 'kit' };
  }
  if (/\bactivehosted\.com\b/i.test(html))
    return {
      ...fromFormHtml(html),
      heading,
      lists: hiddenValues(html, /^nlbox\[\]$|^nlbox$/i).join(','),
      ref: 'activecampaign',
    };
  return null;
}

/** The block's attributes from the plugin's own shortcode's. */
function ownAttrs(a: Record<string, string>): SignupAttrs {
  const fields = ['email', 'name', 'name-surname', 'all'].includes(a.fields ?? '')
    ? (a.fields as FieldSet)
    : undefined;
  const doi = a.double_optin ?? a.doubleoptin;
  return {
    heading: clip(a.heading ?? a.title, 200),
    text: clip(a.text, 500),
    fields,
    lists: ids(a.lists ?? a.list).join(','),
    tags: clip(a.tags, 300),
    buttonLabel: clip(a.button ?? a.button_label, 80),
    layout: a.layout === 'inline' ? 'inline' : a.layout === 'stacked' ? 'stacked' : undefined,
    doubleOptIn: doi === undefined ? undefined : /^(1|yes|true|on)$/i.test(doi) ? 'on' : 'off',
  };
}

/** The Newsletter Plugin's form: its fields from `[newsletter_field name="…"]`. */
function tnpAttrs(a: Record<string, string>, content: string | null | undefined): SignupAttrs {
  const names = [...(content ?? '').matchAll(/\[newsletter_field\b([^\]]*)\]/gi)].map(
    (m) => /\bname\s*=\s*["']?([\w-]+)/i.exec(m[1] ?? '')?.[1] ?? '',
  );
  const submit = [...(content ?? '').matchAll(/\[newsletter_field\b([^\]]*)\]/gi)]
    .map((m) => m[1] ?? '')
    .find((s) => /\bname\s*=\s*["']?button/i.test(s));
  const label = submit ? (/\blabel\s*=\s*["']([^"']*)["']/i.exec(submit)?.[1] ?? '') : '';
  return {
    fields: fieldSet(names.map((n) => (n === 'surname' ? 'last_name' : n))),
    buttonLabel: clip(a.button_label ?? label, 80),
    ref: 'tnp',
  };
}

/**
 * A shortcode standing alone as the signup block, or null when it is not
 * a newsletter form's. `content` is what sits between the opening and the
 * closing tag (The Newsletter Plugin's fields).
 */
export function blockFromShortcode(
  tag: string,
  attrs: Record<string, string>,
  id: string,
  options: { content?: string | null; forms?: Mc4wpForms } = {},
): CxdBlock | null {
  const t = tag.toLowerCase();
  const a = Object.fromEntries(
    Object.entries(attrs).map(([k, v]) => [k.toLowerCase(), String(v).trim()]),
  );
  if (t === SHORTCODE) return block(id, ownAttrs(a));
  if (TNP_TAGS.has(t)) return block(id, tnpAttrs(a, options.content));
  const formId = ids(a.id)[0] ?? '';
  if (t === 'mc4wp_form') return block(id, mc4wpAttrs(formId, options.forms));
  if (t === 'mailpoet_form') return block(id, { ref: `mailpoet:${formId}` });
  if (t === 'sibwp_form') return block(id, { ref: `sibwp:${formId}` });
  return null;
}

/** A Mailchimp for WP form: the lists and fields of its post, when the export has it. */
function mc4wpAttrs(formId: string, forms: Mc4wpForms | undefined): SignupAttrs {
  // Without an id, MC4WP shows the first (default) form.
  const form = formId ? forms?.get(formId) : forms?.values().next().value;
  return {
    ...(form ? fromFormHtml(form.html) : {}),
    lists: form?.lists.join(',') ?? '',
    ref: `mc4wp:${formId}`,
  };
}

/**
 * A WordPress block as the signup block: Mailchimp for WP's, MailPoet's,
 * The Newsletter Plugin's, and HTML blocks embedding a service's form.
 * Null for any other block, so other plugins keep their chance.
 */
export function blocksFromImportedBlock(
  name: string,
  attrs: Record<string, unknown>,
  html: string,
  id: string,
  forms?: Mc4wpForms,
): CxdBlock[] | null {
  if (name === 'mailchimp-for-wp/form')
    return [block(id, mc4wpAttrs(ids(attrs.id)[0] ?? '', forms))];
  if (name === 'mailpoet/subscription-form-block')
    return [block(id, { ref: `mailpoet:${ids(attrs.formId)[0] ?? ''}` })];
  if (name.startsWith('tnp/')) return [block(id, { ...fromFormHtml(html), ref: 'tnp' })];
  if (name === 'core/html') {
    const content = typeof attrs.content === 'string' ? attrs.content : html;
    const form = embeddedForm(content);
    return form ? [block(id, form)] : null;
  }
  return null;
}

/**
 * Mailchimp for WP's forms of an export, from `import.wxrMeta`'s items:
 * their lists (`_mc4wp_settings`, serialized PHP) and markup, by post id.
 */
export function collectMc4wpForms(
  items: WxrItemLike[],
  metaValue: (text: string | undefined) => unknown,
): Mc4wpForms {
  const out: Mc4wpForms = new Map();
  for (const item of items) {
    if (item.type !== 'mc4wp-form') continue;
    const settings = metaValue(item.meta._mc4wp_settings);
    const raw =
      settings && typeof settings === 'object'
        ? (settings as Record<string, unknown>).lists
        : undefined;
    const lists =
      raw && typeof raw === 'object'
        ? Object.values(raw as Record<string, unknown>).flatMap((v) => ids(v))
        : ids(raw);
    out.set(String(item.id), { lists, html: item.content ?? '', title: item.title ?? '' });
  }
  return out;
}
