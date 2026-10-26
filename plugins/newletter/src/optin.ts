/**
 * The opt-in registry: how other plugins offer "Subscribe me to the
 * newsletter" in their own forms (Forms' contact forms, Cleishop's checkout,
 * Agenda's bookings) without depending on this plugin.
 *
 * The newsletter plugin installs an object on
 * `globalThis[Symbol.for('cleitext.newsletter.optIn')]` in its `setup`. A
 * host plugin, when it draws its form, asks `checkbox()`: null means "show
 * nothing" (the plugin is not active on the site, no service is connected,
 * or the owner turned the option off for that form). Otherwise it draws an
 * unchecked checkbox named `name` with `label`. When the form is sent with
 * the box ticked (value `1`) and accepted (not spam), the host calls
 * `subscribe()`, which never throws and returns once the request is logged.
 *
 * Hosts copy the two interfaces below (they are tiny) instead of importing
 * them, so they keep working with or without the newsletter plugin.
 */

export interface OptInCheckbox {
  /** The field name of the checkbox, `cx_newsletter`. */
  name: string;
  /** Its label in the form's language, plain text (also the consent text recorded). */
  label: string;
}

export interface OptInSubscriber {
  siteId: string;
  /** The host: `forms`, `shop`, `agenda`. */
  source: string;
  email: string;
  firstName?: string;
  lastName?: string;
  /** A full name, split when first and last are not given. */
  name?: string;
  locale: string;
  /** The visitor's address, only hashed in the log. */
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

/** The registry's key on `globalThis`. */
export const OPTIN_SYMBOL = Symbol.for('cleitext.newsletter.optIn');

export function installOptIn(api: OptInApi): void {
  (globalThis as unknown as Record<symbol, unknown>)[OPTIN_SYMBOL] = api;
}

export function optInApi(): OptInApi | undefined {
  const api = (globalThis as unknown as Record<symbol, unknown>)[OPTIN_SYMBOL] as
    OptInApi | undefined;
  return api?.version === 1 ? api : undefined;
}
