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
  /** An external consent manager instead of the built-in banner. */
  cmp: CmpConfig;
}

/** External consent managers (CMPs) the plugin can work with. */
export const CMP_PROVIDERS = ['iubenda', 'cookiebot', 'cookieyes'] as const;
export type CmpProvider = (typeof CMP_PROVIDERS)[number];

export interface CmpConfig {
  /** `none`: the built-in banner. */
  provider: 'none' | CmpProvider;
  /**
   * Who sets Google Consent Mode, when it is on: the CMP (`cmp`, it emits
   * the defaults and updates itself) or this plugin (`privacy`: the CMP's
   * own Consent Mode must then be off).
   */
  consentMode: 'cmp' | 'privacy';
  /** Policy pages show the CMP's policy (iubenda) or cookie declaration (iubenda, Cookiebot). */
  policies: boolean;
  iubenda: {
    /** The site's ID, the same for every language. */
    siteId: string;
    /** The cookie policy's ID (also the privacy policy's), for the default language. */
    cookiePolicyId: string;
    /** Other policy IDs by site language (iubenda has one policy per language). */
    cookiePolicyIds: Record<string, string>;
    /** Banner language: empty follows the page's language, or a fixed code such as `it`. */
    lang: string;
    /** Extra `_iub.csConfiguration` options, as a JSON object. */
    options: string;
    /** Policies as a link opening iubenda's window (all plans) or as text in the page (Advanced, Ultimate). */
    embed: 'button' | 'text';
  };
  cookiebot: {
    /** The domain group ID. */
    cbid: string;
    /** `manual`: scripts are held by this plugin; `auto`: Cookiebot rewrites them. */
    blocking: 'manual' | 'auto';
  };
  cookieyes: {
    /** The site key, from `https://cdn-cookieyes.com/client_data/<key>/script.js`. */
    key: string;
  };
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
  cmp: {
    provider: 'none',
    consentMode: 'cmp',
    policies: false,
    iubenda: {
      siteId: '',
      cookiePolicyId: '',
      cookiePolicyIds: {},
      lang: '',
      options: '',
      embed: 'button',
    },
    cookiebot: { cbid: '', blocking: 'manual' },
    cookieyes: { key: '' },
  },
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
    cmp: {
      ...DEFAULT_CONFIG.cmp,
      ...value.cmp,
      iubenda: { ...DEFAULT_CONFIG.cmp.iubenda, ...value.cmp?.iubenda },
      cookiebot: { ...DEFAULT_CONFIG.cmp.cookiebot, ...value.cmp?.cookiebot },
      cookieyes: { ...DEFAULT_CONFIG.cmp.cookieyes, ...value.cmp?.cookieyes },
    },
  };
}

export const CMP_PATTERNS = {
  /** iubenda: numeric IDs. */
  iubendaId: /^\d{4,12}$/,
  /** Cookiebot: a UUID. */
  cbid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /** CookieYes: letters and digits. */
  cookieyesKey: /^[a-z0-9]{16,64}$/i,
  lang: /^[a-z]{2,3}([-_][A-Za-z]{2,4})?$/,
};

/** The CookieYes key from the key itself, the script's address or its whole tag. */
export function cookieyesKey(input: string): string {
  const value = input.trim();
  const fromUrl = /client_data\/([A-Za-z0-9]+)\/script\.js/.exec(value);
  return fromUrl ? fromUrl[1]! : value;
}

/** The extra iubenda options as an object, or null when they are not a JSON object. */
export function iubendaOptions(json: string): Record<string, unknown> | null {
  if (!json.trim()) return {};
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export type CmpProblem =
  | 'iubenda.siteId'
  | 'iubenda.cookiePolicyId'
  | 'iubenda.cookiePolicyIds'
  | 'iubenda.lang'
  | 'iubenda.options'
  | 'cookiebot.cbid'
  | 'cookieyes.key';

/** What is missing or malformed for the chosen consent manager. */
export function cmpProblems(cmp: CmpConfig): CmpProblem[] {
  const problems: CmpProblem[] = [];
  if (cmp.provider === 'iubenda') {
    const i = cmp.iubenda;
    if (!CMP_PATTERNS.iubendaId.test(i.siteId)) problems.push('iubenda.siteId');
    if (!CMP_PATTERNS.iubendaId.test(i.cookiePolicyId)) problems.push('iubenda.cookiePolicyId');
    if (Object.values(i.cookiePolicyIds).some((id) => id && !CMP_PATTERNS.iubendaId.test(id))) {
      problems.push('iubenda.cookiePolicyIds');
    }
    if (i.lang && !CMP_PATTERNS.lang.test(i.lang)) problems.push('iubenda.lang');
    if (iubendaOptions(i.options) === null) problems.push('iubenda.options');
  } else if (cmp.provider === 'cookiebot') {
    if (!CMP_PATTERNS.cbid.test(cmp.cookiebot.cbid)) problems.push('cookiebot.cbid');
  } else if (cmp.provider === 'cookieyes') {
    if (!CMP_PATTERNS.cookieyesKey.test(cmp.cookieyes.key)) problems.push('cookieyes.key');
  }
  return problems;
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
    embed: {
      title: (name: string) => `Content of ${name}`,
      map: (name: string) =>
        `To see the map, accept the “Marketing” cookies: ${name} may use cookies and collect data.`,
      other: (name: string) =>
        `To see it, accept the “Marketing” cookies: ${name} may use cookies and collect data.`,
      accept: 'Accept and show',
      open: (name: string) => `Open on ${name}`,
    },
    table: {
      name: 'Name',
      provider: 'Provider',
      purpose: 'Purpose',
      category: 'Category',
      duration: 'Duration',
    },
    noCookies: 'No cookies are listed yet.',
    thisSite: 'This site',
    consentCookie: 'Remembers your cookie choices.',
    months: 'months',
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
    embed: {
      title: (name: string) => `Contenuto di ${name}`,
      map: (name: string) =>
        `Per vedere la mappa accetta i cookie “Marketing”: ${name} potrebbe usare cookie e raccogliere dati.`,
      other: (name: string) =>
        `Per vederlo accetta i cookie “Marketing”: ${name} potrebbe usare cookie e raccogliere dati.`,
      accept: 'Accetta e mostra',
      open: (name: string) => `Apri su ${name}`,
    },
    table: {
      name: 'Nome',
      provider: 'Fornitore',
      purpose: 'Finalità',
      category: 'Categoria',
      duration: 'Durata',
    },
    noCookies: 'Nessun cookie ancora elencato.',
    thisSite: 'Questo sito',
    consentCookie: 'Ricorda le tue scelte sui cookie.',
    months: 'mesi',
  },
  de: {
    title: 'Ihre Privatsphäre',
    message:
      'Diese Website verwendet technisch notwendige Cookies und, nur mit Ihrer Einwilligung, weitere Cookies, wie in der Cookie-Richtlinie beschrieben. Wählen Sie „Alle akzeptieren“, „Alle ablehnen“ oder die Kategorien unter „Anpassen“. Sie können Ihre Wahl jederzeit ändern.',
    accept: 'Alle akzeptieren',
    reject: 'Alle ablehnen',
    customize: 'Anpassen',
    save: 'Auswahl speichern',
    close: 'Schließen und ohne Zustimmung fortfahren',
    preferences: 'Cookie-Einstellungen',
    privacyPolicy: 'Datenschutzerklärung',
    cookiePolicy: 'Cookie-Richtlinie',
    alwaysOn: 'Immer aktiv',
    necessary: 'Notwendig',
    necessaryHelp: 'Für den Betrieb der Website nötig, zum Beispiel um diese Wahl zu speichern.',
    preferencesLabel: 'Präferenzen',
    preferencesHelp: 'Speichern Einstellungen wie die Sprache.',
    statistics: 'Statistiken',
    statisticsHelp: 'Helfen in zusammengefasster Form zu verstehen, wie die Website genutzt wird.',
    marketing: 'Marketing',
    marketingHelp:
      'Zeigen personalisierte Werbung oder Inhalte anderer Websites wie Videos, Karten und Social-Media-Beiträge.',
    embed: {
      title: (name: string) => `Inhalt von ${name}`,
      map: (name: string) =>
        `Um die Karte zu sehen, akzeptieren Sie die „Marketing“-Cookies: ${name} kann Cookies verwenden und Daten erheben.`,
      other: (name: string) =>
        `Um ihn zu sehen, akzeptieren Sie die „Marketing“-Cookies: ${name} kann Cookies verwenden und Daten erheben.`,
      accept: 'Akzeptieren und anzeigen',
      open: (name: string) => `Auf ${name} öffnen`,
    },
    table: {
      name: 'Name',
      provider: 'Anbieter',
      purpose: 'Zweck',
      category: 'Kategorie',
      duration: 'Dauer',
    },
    noCookies: 'Noch keine Cookies aufgeführt.',
    thisSite: 'Diese Website',
    consentCookie: 'Speichert Ihre Cookie-Auswahl.',
    months: 'Monate',
  },
};

export type Texts = (typeof TEXTS)['en'];

/** The language of the built-in texts for a locale (`it-IT` → `it`), English when there are none. */
export function textsLang(locale: string): keyof typeof TEXTS {
  const lang = locale.toLowerCase().slice(0, 2);
  return lang === 'it' || lang === 'de' ? lang : 'en';
}

export function textsFor(locale: string): Texts {
  return TEXTS[textsLang(locale)];
}

export function categoryLabel(texts: Texts, category: CookieRow['category']): string {
  return category === 'necessary'
    ? texts.necessary
    : category === 'preferences'
      ? texts.preferencesLabel
      : texts[category];
}
