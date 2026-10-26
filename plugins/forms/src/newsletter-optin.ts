/**
 * "Subscribe me to the newsletter" (opt-in) offered by the NewLetter plugin
 * through its registry on `globalThis[Symbol.for('cleitext.newsletter.optIn')]`.
 * This plugin does not depend on it: without the NewLetter plugin (or when
 * it is not active, connected or wanted for this form) there is no box.
 * The interfaces are copied from the NewLetter plugin's `src/optin.ts`.
 */

export interface OptInCheckbox {
  /** The field name of the checkbox, `cx_newsletter`. */
  name: string;
  /** Its label in the form's language, plain text. */
  label: string;
}

export interface OptInSubscriber {
  siteId: string;
  source: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  locale: string;
  ip?: string;
}

export interface OptInApi {
  version: 1;
  checkbox(input: {
    siteId: string;
    locale: string;
    source: string;
  }): Promise<OptInCheckbox | null>;
  subscribe(input: OptInSubscriber): Promise<void>;
}

/** The field the checkbox posts, with the value `1` when ticked. */
export const NEWSLETTER_FIELD = 'cx_newsletter';

export function newsletterOptIn(): OptInApi | undefined {
  const api = (globalThis as unknown as Record<symbol, unknown>)[
    Symbol.for('cleitext.newsletter.optIn')
  ] as OptInApi | undefined;
  return api?.version === 1 ? api : undefined;
}

/** The checkbox for a form, or null; never fails. */
export async function newsletterCheckbox(input: {
  siteId: string;
  locale: string;
  source: string;
}): Promise<OptInCheckbox | null> {
  try {
    const box = await newsletterOptIn()?.checkbox(input);
    return box && typeof box.label === 'string' && box.label ? box : null;
  } catch {
    return null;
  }
}

/** Whether a posted value means the box was ticked. */
export function newsletterTicked(value: unknown): boolean {
  return value === '1' || value === true || value === 'on';
}

/** Subscribes the visitor; never fails. */
export async function newsletterSubscribe(input: OptInSubscriber): Promise<void> {
  try {
    await newsletterOptIn()?.subscribe(input);
  } catch {
    // The NewLetter plugin logs its own errors; the form goes on.
  }
}
