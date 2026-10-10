import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** Players allowed in frames: the embed providers known to the editor (RF-EDT-02). */
export const EMBED_FRAME_HOSTS = [
  'https://www.youtube-nocookie.com',
  'https://www.youtube.com',
  'https://player.vimeo.com',
  'https://open.spotify.com',
  'https://www.dailymotion.com',
];

/** sha256 sources for the inline `<script>` elements of an HTML page. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const digest = createHash('sha256').update(match[1]!).digest('base64');
    hashes.push(`'sha256-${digest}'`);
  }
  return hashes;
}

/**
 * Content Security Policy of the admin (docs/ASVS.md, V3): only its own
 * scripts (plus hashed inline ones), inline styles for the block editor,
 * images from anywhere over HTTPS, frames for embed previews, never framed.
 */
export function adminCsp(scriptHashes: string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    `frame-src 'self' blob: ${EMBED_FRAME_HOSTS.join(' ')}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Public pages may hold HTML written by administrators (scripts, widgets):
 * their policy only forbids plugins, base hijacking and framing by others.
 */
export const PUBLIC_CSP = "object-src 'none'; base-uri 'self'; frame-ancestors 'self'";

/**
 * Headers for every response (onSend hook): no MIME sniffing, a referrer
 * policy, and HSTS over HTTPS. Route-specific values are not overwritten.
 */
export function securityHeaders(request: FastifyRequest, reply: FastifyReply): void {
  if (!reply.hasHeader('x-content-type-options')) reply.header('x-content-type-options', 'nosniff');
  if (!reply.hasHeader('referrer-policy'))
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
  if (request.protocol === 'https' && !reply.hasHeader('strict-transport-security')) {
    reply.header('strict-transport-security', 'max-age=31536000');
  }
}
