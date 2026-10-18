import * as blockEditor from '@wordpress/block-editor';
import * as blocks from '@wordpress/blocks';
import * as components from '@wordpress/components';
import * as compose from '@wordpress/compose';
import * as data from '@wordpress/data';
import * as element from '@wordpress/element';
import * as hooks from '@wordpress/hooks';
import * as i18n from '@wordpress/i18n';
import * as icons from '@wordpress/icons';
import * as keycodes from '@wordpress/keycodes';
import * as primitives from '@wordpress/primitives';
import * as richText from '@wordpress/rich-text';

/** Global through which plugin entries reach the host's modules (`cleitext plugin:build`). */
const SHARED = '__cleitextShared';

/**
 * Block editor entries of plugins (plugin API 1.23): they get the editor's
 * own `@wordpress/*` instances (added to the admin's shared modules), then
 * run, registering their blocks with `registerBlockType`. Entries that fail
 * are reported and skipped: their blocks show as unavailable.
 */
export async function loadPluginEditors(urls: readonly string[]): Promise<string[]> {
  const global = globalThis as Record<string, unknown>;
  global[SHARED] = {
    ...((global[SHARED] as Record<string, unknown> | undefined) ?? {}),
    '@wordpress/block-editor': blockEditor,
    '@wordpress/blocks': blocks,
    '@wordpress/components': components,
    '@wordpress/compose': compose,
    '@wordpress/data': data,
    '@wordpress/element': element,
    '@wordpress/hooks': hooks,
    '@wordpress/i18n': i18n,
    '@wordpress/icons': icons,
    '@wordpress/keycodes': keycodes,
    '@wordpress/primitives': primitives,
    '@wordpress/rich-text': richText,
  };
  const errors: string[] = [];
  for (const url of urls) {
    if (loaded.has(url)) continue;
    try {
      await import(/* @vite-ignore */ url);
      loaded.add(url);
    } catch (error) {
      console.error(`Block editor entry ${url} failed to load`, error);
      errors.push(`${url}: ${String(error)}`);
    }
  }
  return errors;
}

/** Entries already run: registering blocks twice would fail. */
const loaded = new Set<string>();
