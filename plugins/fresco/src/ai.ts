/**
 * Fresco for Cleitext's AI assistants (plugin API 1.40): the guide they read
 * before writing a Fresco page (format, elements, devices, the site's kit),
 * blocks converted to Fresco, and Fresco trees they write, checked here.
 */
import type { AiEditorDefinition, AiValidation, CxdBlock, CxdDocument } from '@cleitext/plugin-sdk';
import { fromBlocks, toBlocks } from './core/convert.js';
import { newId } from './core/ids.js';
import type { Kit } from './core/kit.js';
import type { Control, ElementDefinition, FrescoNode, Settings } from './core/model.js';
import { getElement, listElements } from './core/registry.js';
import { sanitizeRich } from './core/sanitize.js';

/** The deepest tree an assistant may send (containers in containers…). */
const MAX_DEPTH = 12;
const MAX_NODES = 2000;
/** Content settings listed per element in the guide. */
const MAX_SETTINGS = 10;

const GUIDE = `A Fresco page is a tree of **elements**. The document's top level holds only
\`fresco/container\` elements (the sections of the page); containers hold widgets and other
containers. Each element is:

\`\`\`json
{ "type": "fresco/heading", "attrs": { "title": "Our services", "tag": "h2" } }
\`\`\`

- \`attrs\` are **sparse**: only the settings that differ from the defaults. Containers have
  \`children\`; widgets do not. Ids are added when missing (keep those of get_entry when you send a
  page back).
- **Devices.** A setting is for every device (desktop first); \`key@tablet\`, \`key@mobile\` (and
  \`@laptop\`, \`@tablet_extra\`, \`@mobile_extra\`, \`@widescreen\` when the site has them) override it
  from that breakpoint down, e.g. \`"flex_direction": "row", "flex_direction@mobile": "column"\`.
- **Hover.** \`key:hover\` is the value on hover, e.g. \`"background_color:hover"\` on a container.
- **Values.** Sizes are \`{ "size": 40, "unit": "px" }\` (units px, %, em, rem, vw, vh); spacing
  boxes are \`{ "top": 80, "right": 20, "bottom": 80, "left": 20, "unit": "px" }\`; links
  \`{ "url": "/contact", "newTab": false }\`; images \`{ "id": "<media id>", "url": "…", "alt": "…" }\`
  (upload_image or list_media); colors \`#rrggbb\` or a global color \`var(--fr-c-<id>)\` (below).
- **Rich text** (\`content\` of fresco/text) is HTML: paragraphs, headings, lists, links, bold and
  italic only. It is cleaned on save; no styles or scripts.
- **Advanced settings** of every element: \`_margin\` and \`_padding\` (boxes), \`_css_classes\`
  (classes of the theme), \`_css_id\`, \`_background_type\` ("classic") with \`_background_color\`.

## Containers

\`fresco/container\` is a flexbox (default) or a grid: \`container_type\` ("flex" or "grid"),
\`content_width\` ("boxed": the site's width, default; "full"), \`flex_direction\` ("column" default,
"row"), \`justify_content\`, \`align_items\`, \`flex_wrap\`, \`gap\` (\`{ "size": 24, "unit": "px" }\`),
\`grid_columns\` (number) for grids, \`min_height\`, \`html_tag\` ("section", "div", "header"…),
\`background_type\` ("classic" or "gradient") with \`background_color\` / \`background_image\`,
\`padding\` is \`_padding\`. Columns side by side: a container with \`"flex_direction": "row"\` and
\`"flex_direction@mobile": "column"\` holding one container per column.

## Example: a section with a title, text and a button

\`\`\`json
[{ "type": "fresco/container",
   "attrs": { "html_tag": "section", "_padding": { "top": 80, "right": 20, "bottom": 80, "left": 20, "unit": "px" },
              "background_type": "classic", "background_color": "var(--fr-c-primary)" },
   "children": [
     { "type": "fresco/heading", "attrs": { "title": "Fresh bread every day", "tag": "h2", "align": "center" } },
     { "type": "fresco/text", "attrs": { "content": "<p>Baked at dawn with local flour.</p>" } },
     { "type": "fresco/button", "attrs": { "text": "Visit us", "link": { "url": "/contact" }, "align": "center" } }
   ] }]
\`\`\`

Send it as \`native\` to create_entry or update_entry. Blocks (\`content\` or \`blocks\`) are converted
too, but a page written in Fresco's own elements is easier to edit in Fresco. Other plugins' blocks
go in a \`fresco/block\` element whose only child is the block, as Cleitext stores it.`;

/** One content setting, e.g. `tag (select: h1…h6)`. */
function describeControl(control: Control): string {
  const values =
    control.options && control.options.length > 0
      ? `: ${control.options
          .slice(0, 8)
          .map((o) => (o.value === '' ? '""' : o.value))
          .join(', ')}${control.options.length > 8 ? '…' : ''}`
      : '';
  const fields =
    control.type === 'repeater' && control.fields
      ? ` of { ${control.fields.map((f) => f.name).join(', ')} }`
      : '';
  return `${control.name} (${control.type}${fields}${values})`;
}

/** The elements assistants use, with their main content settings. */
function elementList(): string {
  return listElements()
    .filter(
      (e) =>
        e.type.startsWith('fresco/') &&
        !e.hidden &&
        !e.atomic &&
        !e.pro &&
        e.type !== 'fresco/container',
    )
    .map((e) => {
      const settings = e.controls
        .filter(
          (c) =>
            c.tab === 'content' &&
            !['heading', 'notice', 'children', 'pluginBlock'].includes(c.type) &&
            !c.name.startsWith('_'),
        )
        .slice(0, MAX_SETTINGS)
        .map(describeControl);
      const items = e.itemsLabel ? '; items are child containers with `_title`' : '';
      return `- \`${e.type}\` — ${e.title}${settings.length ? `: ${settings.join(', ')}` : ''}${items}`;
    })
    .join('\n');
}

/** The site's global colors and fonts, as assistants refer to them. */
function kitSection(kit: Kit): string {
  const colors = kit.colors
    .filter((c) => c.id && c.value)
    .map((c) => `- \`var(--fr-c-${c.id})\` — ${c.title} (${c.value})`)
    .join('\n');
  const fonts = kit.fonts
    .filter((f) => f.id)
    .map((f) => `- \`${f.id}\` — ${f.title}${f.family ? ` (${f.family})` : ''}`)
    .join('\n');
  return [
    '## The site’s kit (global colors and fonts)',
    'Prefer these to fixed values, so the site keeps one style.',
    colors ? `Colors:\n${colors}` : '',
    fonts
      ? `Fonts, by id: set \`<prefix>typography_global\` to the id, e.g. \`"title_typography_global": "primary"\` on a heading.\n${fonts}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ---- Validation ---------------------------------------------------------------------------

/** Names of the rich text settings of an element (and of its repeaters' items). */
function richSettings(controls: Control[]): {
  rich: Set<string>;
  repeaters: Map<string, Set<string>>;
} {
  const rich = new Set<string>();
  const repeaters = new Map<string, Set<string>>();
  for (const control of controls) {
    if (control.type === 'richtext') rich.add(control.name);
    if (control.type === 'repeater' && control.fields) {
      const inner = control.fields.filter((f) => f.type === 'richtext').map((f) => f.name);
      if (inner.length > 0) repeaters.set(control.name, new Set(inner));
    }
  }
  return { rich, repeaters };
}

/** Rich text settings cleaned on every device and state (`content@mobile`…). */
function cleanSettings(definition: ElementDefinition, attrs: Settings): Settings {
  const { rich, repeaters } = richSettings(definition.controls);
  const out: Settings = {};
  for (const [key, value] of Object.entries(attrs)) {
    const name = key.replace(/[:@].*$/, '');
    if (rich.has(name) && typeof value === 'string') {
      out[key] = sanitizeRich(value);
    } else if (repeaters.has(name) && Array.isArray(value)) {
      const fields = repeaters.get(name)!;
      out[key] = value.map((item) =>
        item && typeof item === 'object'
          ? Object.fromEntries(
              Object.entries(item as Record<string, unknown>).map(([k, v]) => [
                k,
                fields.has(k) && typeof v === 'string' ? sanitizeRich(v) : v,
              ]),
            )
          : item,
      );
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * A Fresco tree from an assistant, checked: known element types, containers
 * at the top level, children only where accepted, rich text cleaned. Blocks
 * inside `fresco/block` are left to Cleitext's own validation.
 */
export function validateTree(document: CxdDocument): AiValidation {
  const errors: string[] = [];
  let count = 0;

  const walk = (raw: unknown, path: string, depth: number, parent: ElementDefinition | null) => {
    if (++count > MAX_NODES) {
      if (count === MAX_NODES + 1) errors.push(`Too many elements (at most ${MAX_NODES}).`);
      return null;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push(`${path}: an element is an object with "type" and "attrs".`);
      return null;
    }
    const node = raw as Partial<FrescoNode>;
    const type = typeof node.type === 'string' ? node.type : '';
    // Another plugin's block inside a plugin block element: kept as Cleitext stores it.
    if (parent?.type === 'fresco/block') {
      return {
        ...(raw as FrescoNode),
        id: node.id || newId(),
        v: node.v ?? 1,
        attrs: node.attrs ?? {},
      };
    }
    const definition = getElement(type);
    if (!definition) {
      errors.push(`${path}: unknown element type "${type}".`);
      return null;
    }
    if (depth === 0 && type !== 'fresco/container') {
      errors.push(`${path}: the top level holds only fresco/container elements, not "${type}".`);
    }
    if (parent?.accepts && !parent.accepts(type)) {
      errors.push(`${path}: "${parent.type}" cannot hold "${type}".`);
    }
    if (node.attrs !== undefined && (typeof node.attrs !== 'object' || Array.isArray(node.attrs))) {
      errors.push(`${path}: "attrs" is an object.`);
      return null;
    }
    if (depth >= MAX_DEPTH) {
      errors.push(`${path}: the tree is too deep (at most ${MAX_DEPTH} levels).`);
      return null;
    }
    const children = node.children;
    if (children !== undefined && !Array.isArray(children)) {
      errors.push(`${path}: "children" is an array.`);
      return null;
    }
    if (children && children.length > 0 && !definition.container) {
      errors.push(`${path}: "${type}" is a widget and has no children.`);
    }
    if (type === 'fresco/block' && (children?.length ?? 0) !== 1) {
      errors.push(`${path}: a fresco/block holds exactly one block.`);
    }
    const out: FrescoNode = {
      id: typeof node.id === 'string' && /^[\w-]{1,64}$/.test(node.id) ? node.id : newId(),
      type,
      v: typeof node.v === 'number' ? node.v : 1,
      attrs: cleanSettings(definition, (node.attrs ?? {}) as Settings),
    };
    if (definition.container) {
      out.children = (children ?? [])
        .map((child, i) => walk(child, `${path}.children[${i}]`, depth + 1, definition))
        .filter((child): child is FrescoNode => child !== null);
    }
    return out;
  };

  const blocks = (document.blocks as unknown[])
    .map((node, i) => walk(node, `native[${i}]`, 0, null))
    .filter((node): node is FrescoNode => node !== null);
  if (errors.length > 0) return { errors };
  return {
    document: {
      schema: 1,
      blocks: blocks as unknown as CxdBlock[],
      editor: { ...document.editor, id: 'fresco' },
    },
  };
}

/** Fresco as an editor of Cleitext's AI assistants; `kit` reads the site's kit. */
export function aiEditor(kit: (siteId: string) => Promise<Kit>): AiEditorDefinition {
  return {
    id: 'fresco',
    title: 'Fresco',
    async guide({ siteId }) {
      return [GUIDE, `## Elements\n\n${elementList()}`, kitSection(await kit(siteId))].join('\n\n');
    },
    fromBlocks: (blocks) => fromBlocks({ schema: 1, blocks }),
    toBlocks: (document) => toBlocks(document).blocks,
    validate: (document) => validateTree(document),
  };
}
