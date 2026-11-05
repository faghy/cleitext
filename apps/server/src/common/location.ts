import type { FastifyReply } from 'fastify';

/**
 * A redirect target as the Location header carries it: ASCII only, with
 * anything else percent-encoded in UTF-8 (`cè.jpg` → `c%C3%A8.jpg`). Node
 * writes header values in latin1, so `è` left as it is went out as one byte
 * and browsers answered 400. What is already encoded (`%C3%A8`) stays as it is.
 */
export function asciiLocation(target: string): string {
  return target.replace(/[^\x21-\x7e]|%(?![0-9A-Fa-f]{2})/gu, (c) => {
    try {
      return encodeURIComponent(c);
    } catch {
      return '%EF%BF%BD'; // a lone surrogate
    }
  });
}

/** The reply's Location header, made safe (every redirect of the server passes here). */
export function safeLocation(reply: FastifyReply): void {
  const location = reply.getHeader('location');
  if (typeof location === 'string') {
    const safe = asciiLocation(location);
    if (safe !== location) reply.header('location', safe);
  }
}
