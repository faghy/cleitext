/**
 * The plugin's names and the turboSMTP addresses, in one place. The slug,
 * name and capability must match `cleitext.plugin.json` (a test checks it).
 */
export const SLUG = 'turbosmtp';
export const NAME = 'turboSMTP';

/** Who connects the account, changes the sending and reads the statistics. */
export const CAPABILITY = `manage_${SLUG}`;

/** turboSMTP's account API: keys, account details, statistics. */
export const API_URL = 'https://pro.api.serversmtp.com/api/v2';
/** turboSMTP's sending API. */
export const SEND_URL = 'https://api.turbo-smtp.com/api/v2/mail/send';
/** turboSMTP's dashboard, for what the plugin does not show. */
export const DASHBOARD_URL = 'https://dashboard.serversmtp.com/analytics/overview';

/** turboSMTP's SMTP servers: inside the European Union, or the rest of the world. */
export const SMTP_HOSTS = {
  'pro.eu.turbo-smtp.com': { en: 'European (data in the EU)', it: 'Europeo (dati nell’UE)' },
  'pro.turbo-smtp.com': { en: 'International', it: 'Internazionale' },
} as const;
export type SmtpHost = keyof typeof SMTP_HOSTS;

/** The ports turboSMTP answers on, with the security each one uses. */
export const SMTP_PORTS = [587, 465, 25, 2525] as const;

/**
 * Environment variable for tests only: a local fake endpoint (http on
 * 127.0.0.1 or localhost) that receives every turboSMTP request instead,
 * as `<base>/<host><path>`. Never set in production.
 */
export const TEST_ENDPOINT_ENV = 'TURBOSMTP_TEST_ENDPOINT';
