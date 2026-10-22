/**
 * Blocks of the other active plugins in the editor: one panel tile each
 * (placing a `fresco/block` with the block inside), their settings as the
 * block editor shows them, and their preview, rendered by the server.
 */
import {
  api as coreApi,
  FieldsForm,
  labelText,
  t,
  type FieldDefinition,
  type FieldValues,
  type Label,
} from '@cleitext/admin-sdk';
import { useEffect, useState } from 'react';
import type { ElementDefinition, FrescoNode } from '../core/model.js';
import { registerElement } from '../core/registry.js';
import type { Store } from './store.js';

/** A plugin block as `GET /blocks` describes it. */
interface PluginBlockView {
  type: string;
  plugin: string;
  title: Label;
  description: Label | null;
  version: number;
  attributes: FieldDefinition[];
}

/** Fresco's own blocks are elements already. */
const OWN = new Set(['fresco', 'fresco-pro']);
const known = new Map<string, PluginBlockView>();
const ICON = 'M4 7.5l8-4.5 8 4.5v9l-8 4.5-8-4.5z M4 7.5l8 4.5 8-4.5 M12 12v9';

function defaults(fields: FieldDefinition[]): FieldValues {
  const values: FieldValues = {};
  for (const field of fields) {
    if ('default' in field && field.default !== undefined) values[field.name] = field.default;
  }
  return values;
}

/** A plugin's name from its slug: `kross-booking` → "Kross Booking". */
export function pluginName(slug: string): string {
  if (slug === 'fresco') return 'Fresco';
  if (slug === 'fresco-pro') return 'Fresco Pro';
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * The plugin an element of the panel comes from (its slug): a plugin block's
 * plugin, or the first part of the element's type (`fresco-pro/form`).
 */
export function elementSource(type: string): string {
  const block = /^fresco\/block:(.+)$/.exec(type)?.[1];
  if (block) return known.get(block)?.plugin ?? block.split('/')[0]!;
  return type.split('/')[0] ?? 'fresco';
}

/** The title of a plugin block, in the editor's language. */
export function pluginBlockTitle(type: string, locale: string): string {
  const view = known.get(type);
  return view ? labelText(view.title, locale) : type;
}

/** Loads the site's plugin blocks and adds a tile for each to the panel. */
export async function loadPluginBlocks(locale: string): Promise<void> {
  const list = await coreApi<PluginBlockView[]>('GET', '/blocks');
  for (const view of list) {
    if (OWN.has(view.plugin)) continue;
    known.set(view.type, view);
    const tile: ElementDefinition = {
      // A panel tile only: what it places is a `fresco/block`.
      type: `fresco/block:${view.type}`,
      title: labelText(view.title, locale),
      icon: ICON,
      category: 'plugins',
      keywords: ['plugin', 'block', view.plugin, view.type],
      controls: [],
      render: () => null,
      create: () => ({
        type: 'fresco/block',
        v: 1,
        attrs: {},
        children: [{ type: view.type, v: view.version, attrs: defaults(view.attributes) }],
      }),
    };
    registerElement(tile);
  }
}

/** The settings of the block inside a `fresco/block`. */
export function PluginBlockFields({
  store,
  node,
  locale,
  readOnly,
}: {
  store: Store;
  node: FrescoNode;
  locale: string;
  readOnly: boolean;
}) {
  const inner = node.children?.[0];
  const view = inner ? known.get(inner.type) : undefined;
  if (!inner || !view) {
    return (
      <p className="fre-notice">
        {t(
          'This block’s plugin is not active: the block is kept, but it shows nothing on the page.',
        )}
      </p>
    );
  }
  return (
    <div className="fre-plugin-fields">
      {view.description && <p className="fre-help">{labelText(view.description, locale)}</p>}
      {view.attributes.length === 0 ? (
        <p className="fre-help">{t('This block has no settings.')}</p>
      ) : (
        <FieldsForm
          fields={view.attributes}
          values={{ ...defaults(view.attributes), ...inner.attrs }}
          locale={locale}
          disabled={readOnly}
          onChange={(values) => store.actions.setSettings(inner.id, values, `block:${inner.id}`)}
        />
      )}
    </div>
  );
}

type Preview = { html: string; css: string } | { error: string };
const previews = new Map<string, Preview>();
const UUID = /^[0-9a-f-]{36}$/i;

/** The block as the page shows it, rendered by the server (links and forms do nothing here). */
export function PluginBlockPreview({
  block,
  entry,
}: {
  block: FrescoNode;
  entry: { id: string; locale: string };
}) {
  const key = JSON.stringify([block.type, block.attrs, entry.locale]);
  const [preview, setPreview] = useState<Preview | null>(() => previews.get(key) ?? null);
  useEffect(() => {
    const hit = previews.get(key);
    if (hit) {
      setPreview(hit);
      return;
    }
    let cancelled = false;
    // Typing in a setting asks once, when it stops.
    const timer = setTimeout(() => {
      coreApi<{ html: string; css: string }>('POST', '/blocks/preview', {
        block: { id: block.id, type: block.type, v: block.v, attrs: block.attrs },
        locale: entry.locale,
        ...(UUID.test(entry.id) ? { entryId: entry.id } : {}),
      })
        .then((result) => result as Preview)
        .catch((error: unknown) => ({
          error: error instanceof Error ? error.message : String(error),
        }))
        .then((result) => {
          if ('html' in result) previews.set(key, result);
          if (!cancelled) setPreview(result);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  const title = pluginBlockTitle(block.type, entry.locale);
  if (!preview) return <div className="fr-placeholder fr-block__note">{title}…</div>;
  if ('error' in preview) {
    return <div className="fr-placeholder fr-block__note">{`${title}: ${preview.error}`}</div>;
  }
  if (!preview.html.trim()) {
    return (
      <div className="fr-placeholder fr-block__note">
        {t(
          '{title}: nothing to show here yet. On the page it shows when there is content for it.',
          { title },
        )}
      </div>
    );
  }
  const css = preview.css.replace(/<\/style/gi, '<\\/style');
  return (
    <div
      className="fr-block__preview"
      dangerouslySetInnerHTML={{ __html: `${css ? `<style>${css}</style>` : ''}${preview.html}` }}
    />
  );
}
