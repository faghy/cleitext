/**
 * The plugin's names, in one place. To rename the plugin, change these and
 * the `slug`/`name` of `cleitext.plugin.json` (a test checks that they
 * match): the database schema (`plg_<slug>`), the block, the capability, the
 * form id, the public addresses and the cookies all follow from `SLUG`.
 */
export const SLUG = 'agenda';
export const NAME = { en: 'Agenda', it: 'Agenda' } as const;
export const PRO_NAME = 'Agenda Pro';

/** The booking block (also the Fresco widget and the shortcode's block). */
export const BLOCK_TYPE = `${SLUG}/booking`;
/** Who manages services and appointments. */
export const CAPABILITY = `manage_${SLUG.replace(/-/g, '_')}`;
/** The booking form's id for the site's bot protection (Captcha, Antispam). */
export const FORM_ID = `${SLUG}/booking`;
/** Cache tag of pages showing the block. */
export const CACHE_TAG = SLUG;
/** Public pages: the appointment's own page (cancel, reschedule, calendar file). */
export const PUBLIC_BASE = `/${SLUG}`;
/** The shortcode of the plugin, `[agenda service="…"]`. */
export const SHORTCODE = SLUG;
/** Marker of the block's markup, for the runtime and the stylesheet. */
export const MARKER = `data-${SLUG}`;
/** The page where Agenda Pro will be sold. */
export const UPGRADE_URL = `https://cleitext.com/plugins/${SLUG}-pro`;
/** `Symbol.for` key of the server API other plugins (Agenda Pro) extend. */
export const API_KEY = `cleitext.${SLUG}`;
