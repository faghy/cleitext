/**
 * Page errors that come from the browser rather than from Cleitext, so that
 * the same suite runs in Chromium, Firefox and WebKit (RNF-10).
 */
const BROWSER_NOISE = [
  // Firefox and WebKit: a lazy import aborted by leaving the page while it loads.
  /^error loading dynamically imported module/,
  /^TypeError: Importing a module script failed\.$/,
  // WebKit: requests cancelled by a navigation, even when the code handles them.
  /due to access control checks\.$/,
  // WebKit: Gutenberg reads the selection of a canvas that was just removed.
  /^null is not an object \(evaluating 'node\.ownerDocument\.defaultView\.getSelection'\)$/,
];

export function appErrors(errors: string[]): string[] {
  return errors.filter((error) => !BROWSER_NOISE.some((pattern) => pattern.test(error)));
}
