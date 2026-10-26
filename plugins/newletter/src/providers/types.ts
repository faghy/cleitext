/**
 * One interface for every email-marketing service. Each adapter speaks the
 * service's official public REST API through `Http` (the core's `ctx.http`
 * on a site, a fake in tests), and turns its answers into the same results
 * and errors.
 */
import type { ProviderId } from '../model/types';

export interface HttpRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  text: string;
}

export type Http = (request: HttpRequest) => Promise<HttpResponse>;

/** How to reach an account: the API key, and the account's address where the service needs one. */
export interface Credentials {
  key: string;
  /** ActiveCampaign: the account's API address, e.g. `https://acme.api-us1.com`. */
  url?: string;
}

export interface ProviderList {
  id: string;
  name: string;
  /** Subscribers, when the service says. */
  count?: number;
}

export interface ProviderField {
  /** What the service calls it in requests (Brevo `FIRSTNAME`, Mailchimp `FNAME`, MailerLite `name`). */
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'other';
  required?: boolean;
}

export interface ProviderAccount {
  /** The account's name or email, to show who is connected. */
  name: string;
}

/** Double opt-in settings a service needs (Brevo: a template and a page). */
export interface DoubleOptInSettings {
  /** Brevo's DOI confirmation template id. */
  templateId?: number;
  /** Brevo: where the confirmation link leads (an absolute address). */
  redirectUrl?: string;
}

export interface SubscribeInput {
  email: string;
  /** Values by the service's field keys; `firstName` and `lastName` are mapped by each adapter. */
  fields: Record<string, string>;
  firstName?: string;
  lastName?: string;
  tags: string[];
  listIds: string[];
  doubleOptIn: boolean;
  doi?: DoubleOptInSettings;
  /** Consent: when given and its text, sent to services that keep it. */
  consent?: { at: string; text: string };
  /** The visitor's address (services that record the signup IP). */
  ip?: string;
  locale?: string;
}

/**
 * `subscribed`: on the list; `pending`: waiting for the confirmation email
 * (double opt-in); `already`: was on the list before (nothing changed, or
 * the contact updated).
 */
export type SubscribeStatus = 'subscribed' | 'pending' | 'already';

export interface SubscribeResult {
  status: SubscribeStatus;
  /** Things the visitor need not know, for the log (e.g. tags not supported). */
  notes?: string[];
}

export type ProviderErrorCode =
  | 'invalid-key'
  | 'invalid-email'
  | 'invalid-list'
  | 'config'
  | 'rate-limit'
  | 'network'
  | 'provider';

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface Provider {
  id: ProviderId;
  name: string;
  /** Whether the service has tags on contacts. */
  tags: boolean;
  /** Whether the connection needs the account's address (`Credentials.url`). */
  needsUrl: boolean;
  verify(credentials: Credentials): Promise<ProviderAccount>;
  lists(credentials: Credentials): Promise<ProviderList[]>;
  /** Custom fields; Mailchimp's are per list (the first of `listId`). */
  fields(credentials: Credentials, listId?: string): Promise<ProviderField[]>;
  subscribe(credentials: Credentials, input: SubscribeInput): Promise<SubscribeResult>;
}
