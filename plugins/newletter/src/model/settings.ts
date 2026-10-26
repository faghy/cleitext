/** The plugin's settings of a site, checked and with their defaults. */
import { isProviderId } from '../providers';
import { EDITABLE, stringsFor, type EditableText, type Strings } from './strings';
import type { FieldSet, ProviderId } from './types';

export interface CustomField {
  /** The service's key (Brevo `CITY`, Mailchimp `MMERGE3`, MailerLite `city`, ActiveCampaign field id). */
  key: string;
  /** Labels by language; the first one stands in for the others. */
  label: Record<string, string>;
  required: boolean;
}

export interface Settings {
  provider: ProviderId | null;
  /** ActiveCampaign's API address. */
  apiUrl: string;
  /** Who is connected, as the last test said. */
  account: string;
  /** Default lists (ids) and their names, for the admin. */
  lists: string[];
  listNames: Record<string, string>;
  doubleOptIn: boolean;
  brevoTemplateId: number | null;
  brevoRedirectUrl: string;
  tags: string[];
  /** The service's keys for the name and surname; empty: the service's usual ones. */
  firstNameKey: string;
  lastNameKey: string;
  /** Extra fields of forms set to "all fields". */
  customFields: CustomField[];
  fields: FieldSet;
  layout: 'stacked' | 'inline';
  privacyUrl: string;
  /** Texts by language, replacing the built-in ones. */
  texts: Record<string, Partial<Record<EditableText, string>>>;
  integrations: { forms: boolean; shop: boolean; agenda: boolean };
  /** Lists of the integrations' subscribers; empty: the default lists. */
  integrationLists: string[];
  integrationTags: string[];
  /** Days the log keeps a subscription (0: always). */
  retentionDays: number;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: null,
  apiUrl: '',
  account: '',
  lists: [],
  listNames: {},
  doubleOptIn: true,
  brevoTemplateId: null,
  brevoRedirectUrl: '',
  tags: [],
  firstNameKey: '',
  lastNameKey: '',
  customFields: [],
  fields: 'email',
  layout: 'stacked',
  privacyUrl: '',
  texts: {},
  integrations: { forms: true, shop: true, agenda: true },
  integrationLists: [],
  integrationTags: [],
  retentionDays: 180,
};

const FIELD_SETS: FieldSet[] = ['email', 'name', 'name-surname', 'all'];

export const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** Ids or names from a list or a comma-separated text, unique, at most `max`. */
export function idList(value: unknown, max = 20): string[] {
  const items = Array.isArray(value)
    ? value.map((v) => (typeof v === 'number' ? String(v) : v))
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const out: string[] = [];
  for (const item of items) {
    const v = text(item, 100);
    if (v && !/[<>"]/.test(v) && !out.includes(v)) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

const fieldKey = (value: unknown): string => {
  const v = text(value, 60);
  return /^[\w.-]+$/.test(v) ? v : '';
};

function labels(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value === 'string' && value.trim()) out.en = text(value, 120);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(k) && text(v, 120)) out[k] = text(v, 120);
  return out;
}

const safeUrl = (value: unknown, httpsOnly = false): string => {
  const v = text(value, 500);
  if (httpsOnly) return /^https:\/\/[^\s"<>]+$/.test(v) ? v : '';
  return /^(\/(?![/\\])|https?:\/\/)[^\s"<>]*$/.test(v) ? v : '';
};

export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const integrations = (r.integrations ?? {}) as Record<string, unknown>;
  const texts: Settings['texts'] = {};
  if (r.texts && typeof r.texts === 'object')
    for (const [locale, values] of Object.entries(r.texts as Record<string, unknown>)) {
      if (!/^[a-z]{2}(-[A-Za-z]{2})?$/.test(locale) || !values || typeof values !== 'object')
        continue;
      const one: Partial<Record<EditableText, string>> = {};
      for (const key of EDITABLE) {
        const v = text((values as Record<string, unknown>)[key], key === 'consent' ? 600 : 300);
        if (v) one[key] = v;
      }
      if (Object.keys(one).length) texts[locale] = one;
    }
  const listNames: Record<string, string> = {};
  if (r.listNames && typeof r.listNames === 'object')
    for (const [k, v] of Object.entries(r.listNames as Record<string, unknown>).slice(0, 200))
      if (text(v, 200)) listNames[text(k, 100)] = text(v, 200);
  const template = Number(r.brevoTemplateId);
  const retention = Number(r.retentionDays);
  return {
    provider: isProviderId(r.provider) ? r.provider : null,
    apiUrl: safeUrl(r.apiUrl, true),
    account: text(r.account, 200),
    lists: idList(r.lists),
    listNames,
    doubleOptIn: typeof r.doubleOptIn === 'boolean' ? r.doubleOptIn : d.doubleOptIn,
    brevoTemplateId: Number.isInteger(template) && template > 0 ? template : null,
    brevoRedirectUrl: safeUrl(r.brevoRedirectUrl, true),
    tags: idList(r.tags),
    firstNameKey: fieldKey(r.firstNameKey),
    lastNameKey: fieldKey(r.lastNameKey),
    customFields: (Array.isArray(r.customFields) ? r.customFields : [])
      .slice(0, 10)
      .map((f) => {
        const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
        return { key: fieldKey(o.key), label: labels(o.label), required: o.required === true };
      })
      .filter((f) => f.key && Object.keys(f.label).length > 0),
    fields: FIELD_SETS.includes(r.fields as FieldSet) ? (r.fields as FieldSet) : d.fields,
    layout: r.layout === 'inline' ? 'inline' : 'stacked',
    privacyUrl: safeUrl(r.privacyUrl),
    texts,
    integrations: {
      forms: typeof integrations.forms === 'boolean' ? integrations.forms : true,
      shop: typeof integrations.shop === 'boolean' ? integrations.shop : true,
      agenda: typeof integrations.agenda === 'boolean' ? integrations.agenda : true,
    },
    integrationLists: idList(r.integrationLists),
    integrationTags: idList(r.integrationTags),
    retentionDays:
      Number.isInteger(retention) && retention >= 0 && retention <= 3650
        ? retention
        : d.retentionDays,
  };
}

/** The visitors' texts of a language: the owner's, else the built-in ones. */
export function textsFor(settings: Settings, locale: string): Strings {
  const base = stringsFor(locale);
  const own =
    settings.texts[locale] ?? settings.texts[locale.slice(0, 2)] ?? ({} as Record<string, string>);
  return { ...base, ...own };
}

/** A custom field's label in a language. */
export function labelOf(field: CustomField, locale: string): string {
  return (
    field.label[locale] ??
    field.label[locale.slice(0, 2)] ??
    field.label.en ??
    Object.values(field.label)[0] ??
    field.key
  );
}

/** Whether the site can subscribe anyone: a service and at least one list. */
export function isReady(settings: Settings, hasKey: boolean): boolean {
  return Boolean(
    settings.provider &&
    hasKey &&
    // MailerLite and Kit take subscribers without a group or form.
    (settings.provider === 'mailerlite' ||
      settings.provider === 'kit' ||
      settings.lists.length > 0) &&
    (settings.provider !== 'activecampaign' || settings.apiUrl),
  );
}
