/**
 * The plugin's names, in one place. To rename the plugin, change these and the `slug`/`name`/`capabilities` of
 * `cleitext.plugin.json` (a test checks that they match), then follow
 * "Renaming the plugin" in the README. The database schema (`plg_<slug>`),
 * the block, the capability, the form id, the public address, the shortcode,
 * the CSS marker and the test override all follow from `SLUG`.
 */
export const SLUG = 'newletter';
export const NAME = { en: 'NewLetter', it: 'NewLetter' } as const;
/** The plugin's claim, shown in the admin and the READMEs. */
export const TAGLINE = {
  en: 'Every subscriber, a new letter',
  it: 'Ogni iscritto, una nuova lettera',
} as const;

/**
 * Prefix of the plugin's tables (inside its own schema). The migrations are
 * SQL and cannot import it: a test checks that they use it. It follows the
 * slug, as the schema does (`plg_<slug>`).
 */
export const TABLE_PREFIX = `${SLUG.replace(/-/g, '_')}_`;

/** The signup block (also the Fresco widget and the shortcode's block). */
export const BLOCK_TYPE = `${SLUG}/form`;
/** Who connects the service and reads the log. */
export const CAPABILITY = `manage_${SLUG.replace(/-/g, '_')}`;
/** The signup form's id for the site's bot protection (Captcha, Antispam). */
export const FORM_ID = `${SLUG}/form`;
/** Cache tag of pages showing the block. */
export const CACHE_TAG = SLUG;
/** Where the form posts (a public address of the site, works without JavaScript). */
export const SUBMIT_PATH = `/_${SLUG}/subscribe`;
/** The plugin's shortcode, `[newletter]`. */
export const SHORTCODE = SLUG;
/** Marker of the block's markup, for the script and the stylesheet. */
export const MARKER = `data-${SLUG}`;
/** CSS class prefix of the form. */
export const CSS = 'cx-nl';

/**
 * Environment variable for tests only: a local fake endpoint (http on
 * 127.0.0.1 or localhost) that receives every provider request instead of
 * the provider, as `<base>/<provider host><path>`. Never set in production.
 */
export const TEST_ENDPOINT_ENV = `${SLUG.toUpperCase().replace(/-/g, '_')}_TEST_ENDPOINT`;

/**
 * The opt-in registry other plugins (Forms, Cleishop, Agenda) use to show
 * "Subscribe me to the newsletter" in their forms. Deliberately not derived
 * from `SLUG`: the hosts name it literally, and it stays the same whatever
 * this plugin is called (see `src/optin.ts`); a newsletter is what it is about.
 */
export const OPTIN_KEY = 'cleitext.newsletter.optIn';
/** The checkbox's field name in the hosts' forms. */
export const OPTIN_FIELD = 'cx_newsletter';
