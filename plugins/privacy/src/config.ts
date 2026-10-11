/** Settings of the Privacy plugin, shared by the server and the admin. */

/** Optional cookie categories; `necessary` ones never need consent. */
export const CATEGORIES = ['preferences', 'statistics', 'marketing'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface CookieRow {
  name: string;
  provider: string;
  category: 'necessary' | Category;
  purpose: string;
  duration: string;
}

export interface PrivacyConfig {
  banner: {
    enabled: boolean;
    layout: 'bar' | 'box';
    /** Categories visitors can accept, besides the necessary cookies. */
    categories: Category[];
    /** Own texts by language (empty: the default text). */
    title: Record<string, string>;
    message: Record<string, string>;
    /** Accept and reject buttons, and links, in this color. */
    color: string;
    /** A small button to change the choice later, in a corner of every page. */
    floatingButton: boolean;
    /** Google Consent Mode v2: Google tags start "denied" and follow the choice. */
    consentMode: boolean;
    /** HTML loaded only after consent to the category, e.g. an analytics snippet. */
    scripts: Partial<Record<Category, string>>;
    /** Months before asking again (the Garante allows up to 6 for a refusal). */
    months: number;
  };
  /** Bumped when categories or cookies change: visitors answer again. */
  version: number;
  cookies: CookieRow[];
  /** The data controller, for the policies. */
  controller: {
    name: string;
    address: string;
    vat: string;
    email: string;
    phone: string;
    dpoEmail: string;
  };
  /** What the site does with personal data, for the privacy policy. */
  processing: {
    contactForms: boolean;
    accounts: boolean;
    newsletter: boolean;
    /** Name of the analytics service, empty when none. */
    analytics: string;
    /** Videos, maps or posts of other sites embedded in pages. */
    embeds: boolean;
    /** Hosting provider, a processor of the data. */
    hosting: string;
  };
  /** Policy pages by language: entry ids. */
  pages: Record<string, { privacy?: string; cookies?: string }>;
  /** Consent records older than this are deleted. */
  consentRetentionMonths: number;
}

export const DEFAULT_CONFIG: PrivacyConfig = {
  banner: {
    enabled: true,
    layout: 'bar',
    categories: ['statistics', 'marketing'],
    title: {},
    message: {},
    color: '#0f4c81',
    floatingButton: true,
    consentMode: false,
    scripts: {},
    months: 6,
  },
  version: 1,
  cookies: [
    {
      name: 'cx_consent',
      provider: 'This site',
      category: 'necessary',
      purpose: 'Remembers your cookie choices.',
      duration: '6 months',
    },
    {
      name: 'cleitext_session, cleitext_csrf',
      provider: 'This site',
      category: 'necessary',
      purpose: 'Only for people who sign in to the admin: keep them signed in and protect forms.',
      duration: 'Session or 30 days',
    },
  ],
  controller: { name: '', address: '', vat: '', email: '', phone: '', dpoEmail: '' },
  processing: {
    contactForms: true,
    accounts: false,
    newsletter: false,
    analytics: '',
    embeds: false,
    hosting: '',
  },
  pages: {},
  consentRetentionMonths: 24,
};

/** The saved settings over the defaults, so new options get a value. */
export function withDefaults(saved: Partial<PrivacyConfig> | null): PrivacyConfig {
  const value = saved ?? {};
  return {
    ...DEFAULT_CONFIG,
    ...value,
    banner: { ...DEFAULT_CONFIG.banner, ...value.banner },
    controller: { ...DEFAULT_CONFIG.controller, ...value.controller },
    processing: { ...DEFAULT_CONFIG.processing, ...value.processing },
    cookies: value.cookies ?? DEFAULT_CONFIG.cookies,
    pages: value.pages ?? {},
  };
}

/** Texts of the public side, by language (others use English). */
export const TEXTS = {
  en: {
    title: 'Your privacy',
    message:
      'This site uses technical cookies needed for it to work and, only with your consent, other cookies as described in the cookie policy. Choose “Accept all”, “Reject all” or pick the categories in “Customize”. You can change your choice at any time.',
    accept: 'Accept all',
    reject: 'Reject all',
    customize: 'Customize',
    save: 'Save choices',
    close: 'Close and continue without accepting',
    preferences: 'Cookie preferences',
    privacyPolicy: 'Privacy policy',
    cookiePolicy: 'Cookie policy',
    alwaysOn: 'Always on',
    necessary: 'Necessary',
    necessaryHelp: 'Needed for the site to work, for example to remember this choice.',
    preferencesLabel: 'Preferences',
    preferencesHelp: 'Remember options such as the language.',
    statistics: 'Statistics',
    statisticsHelp: 'Help understand how the site is used, in aggregate.',
    marketing: 'Marketing',
    marketingHelp:
      'Show personalized ads, or content of other sites such as videos, maps and social posts.',
    table: {
      name: 'Name',
      provider: 'Provider',
      purpose: 'Purpose',
      category: 'Category',
      duration: 'Duration',
    },
    noCookies: 'No cookies are listed yet.',
    thisSite: 'This site',
  },
  it: {
    title: 'La tua privacy',
    message:
      'Questo sito usa cookie tecnici necessari al funzionamento e, solo con il tuo consenso, altri cookie come descritto nella cookie policy. Scegli “Accetta tutti”, “Rifiuta tutti” o seleziona le categorie in “Personalizza”. Puoi cambiare la tua scelta in qualsiasi momento.',
    accept: 'Accetta tutti',
    reject: 'Rifiuta tutti',
    customize: 'Personalizza',
    save: 'Salva le scelte',
    close: 'Chiudi e continua senza accettare',
    preferences: 'Preferenze cookie',
    privacyPolicy: 'Privacy policy',
    cookiePolicy: 'Cookie policy',
    alwaysOn: 'Sempre attivi',
    necessary: 'Necessari',
    necessaryHelp: 'Servono al funzionamento del sito, per esempio per ricordare questa scelta.',
    preferencesLabel: 'Preferenze',
    preferencesHelp: 'Ricordano opzioni come la lingua.',
    statistics: 'Statistiche',
    statisticsHelp: 'Aiutano a capire come viene usato il sito, in forma aggregata.',
    marketing: 'Marketing',
    marketingHelp:
      'Mostrano pubblicità personalizzata, o contenuti di altri siti come video, mappe e post social.',
    table: {
      name: 'Nome',
      provider: 'Fornitore',
      purpose: 'Finalità',
      category: 'Categoria',
      duration: 'Durata',
    },
    noCookies: 'Nessun cookie ancora elencato.',
    thisSite: 'Questo sito',
  },
};

export type Texts = (typeof TEXTS)['en'];

export function textsFor(locale: string): Texts {
  return locale.toLowerCase().startsWith('it') ? TEXTS.it : TEXTS.en;
}

export function categoryLabel(texts: Texts, category: CookieRow['category']): string {
  return category === 'necessary'
    ? texts.necessary
    : category === 'preferences'
      ? texts.preferencesLabel
      : texts[category];
}
