/**
 * The settings of the Antispam plugin: types, defaults and the points of
 * each rule, shared by the server and the admin page (no Node.js modules
 * here).
 */

/** Groups of forms, each with its own switch in the settings. */
export const FORM_GROUPS = ['comments', 'register', 'forms', 'builders', 'other'] as const;
export type FormGroup = (typeof FORM_GROUPS)[number];

/** Alphabets the language filter knows; Latin is always allowed. */
export const SCRIPTS = [
  'latin',
  'cyrillic',
  'greek',
  'cjk',
  'arabic',
  'hebrew',
  'devanagari',
  'thai',
  'armenian',
  'georgian',
] as const;
export type ScriptName = (typeof SCRIPTS)[number];

export interface Thresholds {
  /** From this score the submission is doubtful: the Captcha plugin decides, or the queue. */
  challenge: number;
  /** From this score it is spam: kept in the queue (or refused by forms that cannot keep it). */
  spam: number;
  /** From this score it is dropped, while the sender is told it went through. */
  reject: number;
}

export interface AntispamConfig {
  forms: Record<FormGroup, boolean>;
  /** Signed-in people are not checked. */
  skipSignedIn: boolean;
  /** Submissions sent sooner than this after the visitor started (seconds) are bots. */
  minSeconds: number;
  /** More links than this in a message add points. */
  maxLinks: number;
  /** Words, addresses (URLs, domains), emails (or @domain) and IPs (or ranges) of spam. */
  blocklist: string[];
  /** Emails, @domains and IPs (or ranges) never checked. */
  allowlist: string[];
  /** Alphabets: `auto` from the site's languages, `custom` from `allowedScripts`, `off`. */
  scripts: 'auto' | 'custom' | 'off';
  allowedScripts: ScriptName[];
  /** `[url]`, `[link]` and `[img]` tags of forums. */
  bbcode: boolean;
  /** An author name that is a web address. */
  authorLink: boolean;
  /** Email domains without a mail server (a DNS query: off by default). */
  checkMx: boolean;
  /** The same text sent again and again, and texts marked as spam before. */
  fingerprints: boolean;
  /** Addresses that sent spam before (kept as salted hashes). */
  senders: boolean;
  thresholds: Thresholds;
  /** Days the queue keeps spam, spam comments included. */
  retentionDays: number;
  /** Delete the core's spam comments too after `retentionDays`. */
  purgeComments: boolean;
}

export const DEFAULT_FORMS: Record<FormGroup, boolean> = {
  comments: true,
  register: true,
  forms: true,
  builders: true,
  // Other plugins' forms (a shop's checkout…): the owner turns them on.
  other: false,
};

export const DEFAULT_THRESHOLDS: Thresholds = { challenge: 3, spam: 6, reject: 10 };

export const DEFAULT_CONFIG: AntispamConfig = {
  forms: DEFAULT_FORMS,
  skipSignedIn: true,
  minSeconds: 3,
  maxLinks: 2,
  blocklist: [],
  allowlist: [],
  scripts: 'auto',
  allowedScripts: ['latin'],
  bbcode: true,
  authorLink: true,
  checkMx: false,
  fingerprints: true,
  senders: true,
  thresholds: DEFAULT_THRESHOLDS,
  retentionDays: 15,
  purgeComments: true,
};

/** Why a submission got points: the rules, as stored in the queue and the statistics. */
export const REASONS = [
  'honeypot',
  'token',
  'too-fast',
  'links',
  'bbcode',
  'blocklist',
  'script',
  'author-link',
  'no-mx',
  'repeated',
  'known-spam',
  'known-good',
  'sender',
  'no-js',
] as const;
export type Reason = (typeof REASONS)[number];

/** Points of each rule (`links` and `script` grow with what they find, see rules.ts). */
export const POINTS = {
  honeypot: 10,
  token: 6,
  'too-fast': 6,
  bbcode: 4,
  blocklist: 6,
  'author-link': 3,
  'no-mx': 3,
  repeated: 3,
  'known-spam': 5,
  'known-good': -3,
} as const;

/** What happens to a submission. */
export type Outcome = 'accepted' | 'challenged' | 'held' | 'refused' | 'rejected';

/** A message of the queue, as the admin page lists it. */
export interface QueueItem {
  /** `c:<comment id>` or `q:<queue id>`. */
  id: string;
  /** `comment`: a spam comment; `form`: a form message kept aside; `refused`: refused as spam. */
  kind: 'comment' | 'form' | 'refused';
  form: string;
  createdAt: string;
  author: string;
  email: string;
  text: string;
  /** The other fields of a form message. */
  fields: { name: string; value: string }[];
  score: number | null;
  reasons: string[];
  /** "Not spam" publishes or delivers it (otherwise it only teaches the filter). */
  deliverable: boolean;
}

/** Statistics of the last days. */
export interface Stats {
  days: { day: string; held: number; refused: number; rejected: number; challenged: number }[];
  reasons: { reason: string; n: number }[];
}
