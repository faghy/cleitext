/**
 * Firebase Cloud Messaging (HTTP v1) without libraries: the service account's
 * OAuth 2.0 token (a JWT signed RS256 with node:crypto, RFC 7523), one
 * message per phone, and what the answers mean.
 */
import { createPrivateKey, createSign } from 'node:crypto';

export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const fcmUrl = (projectId: string) =>
  `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

/** The parts of a Google service account JSON key that are used. */
export interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

export class InvalidServiceAccount extends Error {}

/** Reads and checks a service account JSON key, as downloaded from the Firebase console. */
export function parseServiceAccount(text: string): ServiceAccount {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new InvalidServiceAccount('This is not a JSON file.');
  }
  if (!raw || typeof raw !== 'object' || raw.type !== 'service_account')
    throw new InvalidServiceAccount('This is not the JSON key of a service account.');
  const projectId = typeof raw.project_id === 'string' ? raw.project_id.trim() : '';
  const clientEmail = typeof raw.client_email === 'string' ? raw.client_email.trim() : '';
  const privateKey = typeof raw.private_key === 'string' ? raw.private_key : '';
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId))
    throw new InvalidServiceAccount('The project id is missing or not valid.');
  if (!/^[^\s@]+@[^\s@]+$/.test(clientEmail))
    throw new InvalidServiceAccount('The client email is missing or not valid.');
  try {
    const key = createPrivateKey(privateKey);
    if (key.asymmetricKeyType !== 'rsa') throw new Error('not RSA');
  } catch {
    throw new InvalidServiceAccount('The private key is missing or not valid.');
  }
  return { projectId, clientEmail, privateKey };
}

const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64url');

/** The signed assertion of the JWT bearer grant, valid one hour. */
export function signedAssertion(account: ServiceAccount, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64(
    JSON.stringify({
      iss: account.clientEmail,
      scope: FCM_SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(account.privateKey).toString('base64url')}`;
}

/** The body of the token request (application/x-www-form-urlencoded). */
export function tokenRequestBody(account: ServiceAccount, nowMs: number): string {
  return new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: signedAssertion(account, nowMs),
  }).toString();
}

/** What a phone is sent: the notification, the data for the app, sound and priority. */
export function fcmMessage(
  token: string,
  notice: { title: string; body: string; data: Record<string, string> },
) {
  return {
    message: {
      token,
      notification: { title: notice.title, ...(notice.body ? { body: notice.body } : {}) },
      data: notice.data,
      android: { priority: 'HIGH', notification: { sound: 'default' } },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default' } },
      },
    },
  };
}

export type SendOutcome = 'sent' | 'invalid' | 'failed' | 'unauthorized';

/**
 * What FCM's answer means for one phone. `invalid`: the token no longer
 * works (UNREGISTERED), or is not a token at all (INVALID_ARGUMENT about
 * the registration token): the site should forget it. Errors about the
 * message itself never make a token invalid.
 */
export function outcomeOf(status: number, text: string): SendOutcome {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 401) return 'unauthorized';
  let error: { status?: string; message?: string; details?: { errorCode?: string }[] } = {};
  try {
    error = ((JSON.parse(text) as { error?: typeof error }).error ?? {}) as typeof error;
  } catch {
    // Not JSON: a failure like any other.
  }
  const codes = (error.details ?? []).map((d) => d?.errorCode).filter(Boolean);
  if (codes.includes('UNREGISTERED')) return 'invalid';
  const invalidArgument = codes.includes('INVALID_ARGUMENT') || error.status === 'INVALID_ARGUMENT';
  if (invalidArgument && /registration token/i.test(error.message ?? '')) return 'invalid';
  return 'failed';
}
