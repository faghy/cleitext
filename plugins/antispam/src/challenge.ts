/**
 * The markup placed in a protected form: a hidden box with the honeypot,
 * the marker and the empty time token, and the plugin's small script that
 * fills the token. The same for every visitor: pages of guests are cached.
 */

/** Field names (the server reads them, the script fills `TOKEN_FIELD`). */
export const HONEYPOT_FIELD = 'cl_as_hp';
export const MARKER_FIELD = 'cl_as';
export const TOKEN_FIELD = 'cl_as_t';
export const TOKEN_PATH = '/_antispam/token';

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The markup of a form. */
export function challengeHtml(input: { form: string; locale: string }, scriptUrl: string): string {
  const label = input.locale.startsWith('it')
    ? 'Lascia vuoto questo campo'
    : 'Leave this field empty';
  return (
    `<div class="cl-antispam" data-cl-antispam="${escapeAttr(input.form)}" aria-hidden="true" ` +
    `style="position:absolute!important;left:-9999px;width:1px;height:1px;overflow:hidden">` +
    `<label>${label} <input type="text" name="${HONEYPOT_FIELD}" value="" tabindex="-1" autocomplete="off"></label>` +
    `<input type="hidden" name="${MARKER_FIELD}" value="1">` +
    `<input type="hidden" name="${TOKEN_FIELD}" value="">` +
    `</div><script src="${escapeAttr(scriptUrl)}" defer></script>`
  );
}
