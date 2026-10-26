/** Shared types of the plugin. */

export type ProviderId = 'brevo' | 'mailchimp' | 'mailerlite' | 'kit' | 'activecampaign';

/** Which fields the signup form asks for, besides the email (always). */
export type FieldSet = 'email' | 'name' | 'name-surname' | 'all';

/** The signup block's attributes (also the Fresco widget's and the shortcode's). */
export interface SignupAttrs {
  heading?: string;
  /** A short text under the heading. */
  text?: string;
  fields?: FieldSet;
  /** List ids, separated by commas; empty: the default lists of the settings. */
  lists?: string;
  /** Tags, separated by commas (where the service has them). */
  tags?: string;
  /** `default` follows the settings. */
  doubleOptIn?: 'default' | 'on' | 'off';
  buttonLabel?: string;
  successMessage?: string;
  errorMessage?: string;
  layout?: 'stacked' | 'inline';
  /** Where an imported form came from, e.g. `mc4wp:12`, `brevo`, `mailchimp` (informational). */
  ref?: string;
}
