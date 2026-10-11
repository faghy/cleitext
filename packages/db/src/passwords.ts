import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

/**
 * Known breached passwords (ASVS V6): the most used passwords of 12 characters
 * or more found in public breaches, lowercased. Source: SecLists,
 * xato-net-10-million-passwords-1000000.txt (MIT). Checked on the server only,
 * so that no password, or part of it, ever leaves the site.
 */
const listFile = new URL('../data/breached-passwords.txt.gz', import.meta.url);

let list: Set<string> | undefined;

function breachedPasswords(): Set<string> {
  list ??= new Set(gunzipSync(readFileSync(listFile)).toString('utf8').split('\n').filter(Boolean));
  return list;
}

/** Whether the password is in the list of known breached passwords (case-insensitive). */
export function isBreachedPassword(password: string): boolean {
  return breachedPasswords().has(password.toLowerCase());
}

export const BREACHED_PASSWORD_MESSAGE =
  'This password appears in lists of breached passwords: choose another one.';
