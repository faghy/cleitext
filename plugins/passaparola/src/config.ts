/**
 * The plugin's names, in one place. To rename the plugin, change these and
 * the `slug`/`name` of `cleitext.plugin.json` (a test checks that they
 * match): the database schema (`plg_<slug>`), the blocks, the capability,
 * the cookie (`cx_ref_<slug>`), the account page and the cache tag all
 * follow from `SLUG`. Texts shown to people use `NAME`.
 */
export const SLUG = 'passaparola';
export const NAME = { en: 'Passaparola', it: 'Passaparola' } as const;
export const PRO_NAME = 'Passaparola Pro';
/** One line under the name in the admin. */
export const TAGLINE = {
  en: 'Your own affiliate program: the people who love your site bring you customers.',
  it: 'Il tuo programma di affiliazione: chi ama il tuo sito ti porta clienti.',
} as const;

/** Who manages affiliates, referrals and payouts. */
export const CAPABILITY = `manage_${SLUG.replace(/-/g, '_')}`;
/** Blocks: the application form, the link to the affiliate area, the "become an affiliate" box. */
export const BLOCKS = {
  signup: `${SLUG}/signup`,
  link: `${SLUG}/account-link`,
  cta: `${SLUG}/cta`,
} as const;
/** The affiliate area in the visitor's account (`/account/<name>`). */
export const ACCOUNT_PAGE = 'affiliate';
/** Cache tag of pages showing the blocks. */
export const CACHE_TAG = SLUG;
/** The page about the plugin, where Passaparola Pro will be sold. */
export const UPGRADE_URL = `https://cleitext.com/plugins/${SLUG}`;
/** `Symbol.for` key of the server API other plugins (Passaparola Pro) extend. */
export const API_KEY = `cleitext.${SLUG}`;
/** CSS class prefix of the public markup. */
export const CSS = 'ppl';
