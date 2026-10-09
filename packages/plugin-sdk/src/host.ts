import { SHARED_MODULES_GLOBAL, SHARED_SERVER_MODULES } from './manifest.js';

/**
 * Host side (server and CLI only): publishes the shared modules that plugin
 * server bundles read from `globalThis`. Must run before importing a plugin.
 */
export async function installServerSharedModules(): Promise<void> {
  const target = globalThis as unknown as Record<string, Record<string, unknown> | undefined>;
  const shared = (target[SHARED_MODULES_GLOBAL] ??= {});
  for (const name of SHARED_SERVER_MODULES) {
    if (shared[name]) continue;
    shared[name] = (await import(name)) as unknown;
  }
}
