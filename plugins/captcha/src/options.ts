/**
 * The settings of the Captcha plugin: types and defaults, shared by the
 * server and the admin page (no Node.js modules here).
 */

export const PROVIDERS = ['turnstile', 'recaptcha2', 'recaptcha2-invisible', 'recaptcha3'] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Groups of forms, each with its own switch in the settings. */
export const FORM_GROUPS = [
  'admin',
  'login',
  'register',
  'password',
  'comments',
  'forms',
  'shop',
  'builders',
  'other',
] as const;
export type FormGroup = (typeof FORM_GROUPS)[number];

export interface CaptchaConfig {
  provider: Provider;
  /** The public key of the provider (the secret one is a secret). */
  siteKey: string;
  /** reCAPTCHA v3: the lowest score that passes (0.1–0.9). */
  minScore: number;
  /**
   * Turnstile only, when Cloudflare cannot be reached: `recaptcha` shows a
   * reCAPTCHA v2 checkbox with the fallback keys, `allow` lets submissions
   * through while Cloudflare is down, `off` refuses them.
   */
  failsafe: 'off' | 'recaptcha' | 'allow';
  /** reCAPTCHA v2 (checkbox) site key used by the `recaptcha` failsafe. */
  fallbackSiteKey: string;
  forms: Record<FormGroup, boolean>;
  /** Signed-in people are not asked. */
  skipSignedIn: boolean;
  /** Addresses or ranges (CIDR) whose submissions are never checked. */
  trustedIps: string[];
  theme: 'auto' | 'light' | 'dark';
  /** Turnstile: `normal`, `flexible` (full width) or `compact`; reCAPTCHA v2: normal or compact. */
  size: 'normal' | 'flexible' | 'compact';
  /** Turnstile: always shown, or only when the visitor has to interact. */
  appearance: 'always' | 'interaction-only';
  /** Language of the widget: `auto` follows the page. */
  language: string;
  /** Keep the submit button disabled until the check is passed. */
  disableSubmit: boolean;
  /** The message when a check fails, by language; empty uses the default. */
  messages: Record<string, string>;
  /**
   * `always`: every submission of a protected form is checked. `on-demand`
   * (1.1.0): the widget appears and is checked only when another plugin is
   * unsure of a submission (the Antispam plugin, `challenge` of plugin API
   * 1.45); the others go through without it.
   */
  mode: 'always' | 'on-demand';
}

export const DEFAULT_FORMS: Record<FormGroup, boolean> = {
  /** The admin's sign-in (`/cl-admin`), as wp-login.php in WordPress. */
  admin: true,
  login: true,
  register: true,
  password: true,
  comments: true,
  forms: true,
  // A check at the checkout can cost orders: the shop owner turns it on.
  shop: false,
  builders: true,
  other: true,
};

export const DEFAULT_CONFIG: CaptchaConfig = {
  provider: 'turnstile',
  siteKey: '',
  minScore: 0.5,
  failsafe: 'off',
  fallbackSiteKey: '',
  forms: DEFAULT_FORMS,
  skipSignedIn: true,
  trustedIps: [],
  theme: 'auto',
  size: 'normal',
  appearance: 'always',
  language: 'auto',
  disableSubmit: false,
  messages: {},
  mode: 'always',
};

export const DEFAULT_MESSAGES: Record<string, string> = {
  en: 'Please confirm that you are not a robot, then try again.',
  it: 'Conferma di non essere un robot, poi riprova.',
};
