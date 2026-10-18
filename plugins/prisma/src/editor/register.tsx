import { inlineToHtml, type CxdInline } from '@cleitext/blocks/inline';
import { InnerBlocks, RichText, useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';
import { getCategories, registerBlockType, setCategories } from '@wordpress/blocks';
import {
  createElement,
  useEffect,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from 'react';
import {
  arrowRight as arrowRightIcon,
  button as buttonIcon,
  buttons as buttonsIcon,
  calendar as calendarIcon,
  category as categoryIcon,
  caution as cautionIcon,
  chartBar as chartIcon,
  column as columnIcon,
  columns as columnsIcon,
  commentContent as commentIcon,
  cover as coverIcon,
  details as detailsIcon,
  file as fileIcon,
  formatListBullets as listIcon,
  gallery as galleryIcon,
  grid as gridIcon,
  heading as headingIcon,
  help as helpIcon,
  image as imageIcon,
  info as infoIcon,
  layout as layoutIcon,
  listItem as listItemIcon,
  mapMarker as mapIcon,
  megaphone as megaphoneIcon,
  payment as paymentIcon,
  people as peopleIcon,
  postDate as postDateIcon,
  postList as postListIcon,
  quote as quoteIcon,
  separator as separatorIcon,
  share as shareIcon,
  starFilled as starIcon,
  symbol as symbolIcon,
  tableOfContents as tocIcon,
  update as updateIcon,
  video as videoIcon,
} from '@wordpress/icons';
import { iconsLoaded, onIconData } from '../lib/icons';
import { ExtensionBind } from './controls/extensions';
import { blockCss, withDefaults } from '../lib/css';
import { DEFAULT_GLOBALS, variablesCss, type Globals } from '../lib/globals';
import { safeTag } from '../lib/tags';
import type { Attrs, PrismaBlock } from '../lib/types';

export interface EditProps {
  attributes: Attrs;
  setAttributes: (attrs: Attrs) => void;
  clientId: string;
  isSelected: boolean;
}

/** Each block's icon in the inserter, toolbar and sidebar, in Prisma's color. */
const ICONS: Record<string, unknown> = {
  container: layoutIcon,
  heading: headingIcon,
  image: imageIcon,
  gallery: galleryIcon,
  'info-box': infoIcon,
  buttons: buttonsIcon,
  button: buttonIcon,
  icon: symbolIcon,
  'icon-list': listIcon,
  'icon-list-item': listItemIcon,
  separator: separatorIcon,
  'call-to-action': megaphoneIcon,
  'marketing-button': arrowRightIcon,
  blockquote: quoteIcon,
  counter: chartIcon,
  countdown: calendarIcon,
  'star-rating': starIcon,
  'inline-notice': cautionIcon,
  tabs: columnsIcon,
  tab: columnIcon,
  faq: helpIcon,
  'faq-item': detailsIcon,
  modal: coverIcon,
  slider: videoIcon,
  slide: coverIcon,
  'content-timeline': postDateIcon,
  'content-timeline-item': postDateIcon,
  'table-of-contents': tocIcon,
  testimonial: commentIcon,
  team: peopleIcon,
  'social-share': shareIcon,
  'social-share-item': shareIcon,
  'restaurant-menu': paymentIcon,
  'restaurant-menu-item': paymentIcon,
  review: starIcon,
  'how-to': listIcon,
  'how-to-step': listItemIcon,
  'google-map': mapIcon,
  lottie: updateIcon,
  'post-grid': gridIcon,
  'post-carousel': postListIcon,
  'post-timeline': postDateIcon,
  'taxonomy-list': categoryIcon,
  form: fileIcon,
};
const ACCENT = '#6d28d9';

/** A block's icon: its own, or the form's for the fields of a form. */
const iconOf = (name: string): unknown =>
  ICONS[name] ?? (name.startsWith('form-') ? ICONS.form : undefined);

/** The settings of a block in the sidebar (General / Style / Advanced). */
export type Inspector = ComponentType<EditProps & { block: PrismaBlock }>;

/** The site's defaults (Settings → Prisma), once read. */
let globals: Globals = DEFAULT_GLOBALS;
export function setGlobals(value: Globals): void {
  globals = value;
}

/** Ids given in this editor session: a copied block gets a new one. */
const taken = new Map<string, string>();

/** A short id for the block's CSS class, kept while it stays unique. */
function useBlockId({ attributes, setAttributes, clientId }: EditProps): string {
  const current = typeof attributes.blockId === 'string' ? attributes.blockId : '';
  const owner = current ? taken.get(current) : undefined;
  const id = current && (!owner || owner === clientId) ? current : clientId.slice(0, 8);
  taken.set(id, clientId);
  useEffect(() => {
    if (id !== current) setAttributes({ blockId: id });
  }, [id, current, setAttributes]);
  return id;
}

/** The inner blocks of a container, laid out by the container's own wrapper. */
function InnerWrap({
  className,
  tagName,
  allowedBlocks,
}: {
  className?: string;
  tagName?: string;
  allowedBlocks?: string[];
}) {
  const props = useInnerBlocksProps(
    { className },
    {
      ...(allowedBlocks ? { allowedBlocks } : {}),
      renderAppender: InnerBlocks.ButtonBlockAppender,
    },
  );
  return createElement(safeTag(tagName, 'div'), props);
}

/** The block's root element, carrying the editor's props (and the inner blocks). */
function Root({
  tagName,
  props,
  content,
  holdsChildren,
  allowedBlocks,
}: {
  tagName: string;
  props: { className: string; id?: string; style?: Record<string, string> };
  content: ReactNode;
  holdsChildren?: boolean;
  allowedBlocks?: string[];
}) {
  const blockProps = useBlockProps(props);
  const innerProps = useInnerBlocksProps(blockProps, {
    ...(allowedBlocks ? { allowedBlocks } : {}),
    renderAppender: InnerBlocks.ButtonBlockAppender,
  });
  const { children: innerChildren, ...rest } = innerProps as { children?: ReactNode };
  return createElement(
    safeTag(tagName, 'div'),
    holdsChildren ? rest : blockProps,
    content,
    holdsChildren ? innerChildren : null,
  );
}

function makeEdit(block: PrismaBlock, Settings: Inspector | undefined) {
  return function Edit(props: EditProps) {
    // Icons arrive after the first draw: drawn again then.
    useSyncExternalStore(onIconData, iconsLoaded);
    const id = useBlockId(props);
    const attrs = withDefaults(block, props.attributes);
    return (
      <>
        <style>{variablesCss(globals) + blockCss(block, props.attributes, id, globals)}</style>
        <ExtensionBind.Provider
          value={{
            attributes: props.attributes,
            setAttributes: props.setAttributes,
            defaults: { ...EXTENSION_DEFAULTS, ...block.defaults },
          }}
        >
          {Settings && <Settings {...props} block={block} />}
        </ExtensionBind.Provider>
        <block.View
          attrs={attrs}
          id={id}
          editing
          globals={globals}
          text={(name, text) => (
            <RichText
              tagName={safeTag(text.tagName, 'div') as never}
              className={text.className}
              value={
                typeof props.attributes[name] === 'string' ? (props.attributes[name] as string) : ''
              }
              onChange={(value: string) => props.setAttributes({ [name]: value })}
              placeholder={text.placeholder}
              allowedFormats={[
                'core/bold',
                'core/italic',
                'core/link',
                'core/strikethrough',
                'prisma/highlight',
              ]}
            />
          )}
          inner={(inner) => (
            <InnerWrap
              {...(inner.className ? { className: inner.className } : {})}
              {...(inner.tagName ? { tagName: inner.tagName } : {})}
              {...(block.allowedBlocks ? { allowedBlocks: block.allowedBlocks } : {})}
            />
          )}
          root={(tagName, rootProps, content, holdsChildren) => (
            <Root
              tagName={tagName}
              props={rootProps}
              content={content}
              {...(holdsChildren ? { holdsChildren } : {})}
              {...(block.allowedBlocks ? { allowedBlocks: block.allowedBlocks } : {})}
            />
          )}
        />
      </>
    );
  };
}

/** Attributes every block has (visibility, animation). */
const EXTENSION_DEFAULTS = {
  hideDesktop: false,
  hideTablet: false,
  hideMobile: false,
  responsiveConditions: false,
  animationType: '',
  animationTime: 400,
  animationDelay: 0,
  animationEasing: 'ease',
  animationRepeat: false,
};

/** Gutenberg's attribute types, from the defaults. */
function attributeTypes(
  defaults: Attrs,
  rich: string[] = [],
): Record<string, { type?: string | string[]; default?: unknown }> {
  const types: Record<string, { type?: string | string[]; default?: unknown }> = {
    blockId: { type: 'string', default: '' },
  };
  for (const [name, value] of Object.entries(defaults)) {
    // Rich text is HTML in the editor (stored as CXD inline nodes).
    if (rich.includes(name)) {
      types[name] = {
        type: 'string',
        default: Array.isArray(value) ? inlineToHtml(value as CxdInline[]) : '',
      };
      continue;
    }
    types[name] = {
      type:
        typeof value === 'number'
          ? ['number', 'string']
          : typeof value === 'boolean'
            ? 'boolean'
            : Array.isArray(value)
              ? 'array'
              : value && typeof value === 'object'
                ? 'object'
                : ['string', 'number'],
      default: value,
    };
  }
  return types;
}

/** Registers the blocks in Gutenberg, in their own "Prisma" category. */
export function registerPrismaBlocks(
  blocks: PrismaBlock[],
  settings: Record<string, Inspector>,
): void {
  if (!getCategories().some((c) => c.slug === 'prisma')) {
    setCategories([{ slug: 'prisma', title: 'Prisma' }, ...getCategories()]);
  }
  for (const block of blocks) {
    registerBlockType(`prisma/${block.name}`, {
      apiVersion: 3,
      title: block.title,
      description: block.description,
      category: 'prisma',
      ...(iconOf(block.name) ? { icon: { src: iconOf(block.name), foreground: ACCENT } } : {}),
      keywords: block.keywords ?? [],
      attributes: attributeTypes(
        { ...EXTENSION_DEFAULTS, ...block.defaults },
        block.richAttributes,
      ),
      ...(block.parent ? { parent: block.parent.map((p) => `prisma/${p}`) } : {}),
      supports: { html: false, className: true, anchor: true },
      edit: makeEdit(block, settings[block.name]),
      save: () => (block.container ? <InnerBlocks.Content /> : null),
    } as never);
  }
}
