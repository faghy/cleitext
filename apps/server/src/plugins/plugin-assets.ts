import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PluginHost } from './plugin-host.service.js';

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

/**
 * Files of a plugin's admin entry, at `/admin-plugins/<slug>/<version>/<file>`.
 * The version in the URL makes them cacheable for a year. Only the `dist`
 * folder (or the admin entry's folder) is served, never the sources.
 */
export async function servePluginAsset(
  host: PluginHost,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const params = request.params as { slug: string; version: string; '*': string };
  const plugin = host.get(params.slug);
  const file = params['*'] ?? '';
  const type = TYPES[path.extname(file)];
  const root = plugin?.manifest.admin
    ? path.dirname(path.join(plugin.dir, plugin.manifest.admin))
    : null;
  const target = root ? path.resolve(plugin!.dir, file) : '';
  if (
    !plugin ||
    !root ||
    !type ||
    plugin.version !== params.version ||
    file.includes('\0') ||
    (target !== root && !target.startsWith(`${root}${path.sep}`))
  ) {
    await reply.code(404).type('text/plain; charset=utf-8').send('Not Found');
    return;
  }
  try {
    const content = await readFile(target);
    await reply
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .type(type)
      .send(content);
  } catch {
    await reply.code(404).type('text/plain; charset=utf-8').send('Not Found');
  }
}
