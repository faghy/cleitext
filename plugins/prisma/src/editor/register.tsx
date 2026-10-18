import { InnerBlocks, RichText, useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';
import { getCategories, registerBlockType, setCategories } from '@wordpress/blocks';
import { createElement, useEffect, type ComponentType, type ReactNode } from 'react';
import { blockCss, withDefaults } from '../lib/css';
import { DEFAULT_GLOBALS, type Globals } from '../lib/globals';
import { safeTag } from '../lib/tags';
import type { Attrs, PrismaBlock } from '../lib/types';

export interface EditProps {
  attributes: Attrs;
  setAttributes: (attrs: Attrs) => void;
  clientId: string;
  isSelected: boolean;
}

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
    const id = useBlockId(props);
    const attrs = withDefaults(block, props.attributes);
    return (
      <>
        <style>{blockCss(block, props.attributes, id, globals)}</style>
        {Settings && <Settings {...props} block={block} />}
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
              allowedFormats={['core/bold', 'core/italic', 'core/link', 'core/strikethrough']}
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

/** Gutenberg's attribute types, from the defaults. */
function attributeTypes(
  defaults: Attrs,
): Record<string, { type?: string | string[]; default?: unknown }> {
  const types: Record<string, { type?: string | string[]; default?: unknown }> = {
    blockId: { type: 'string', default: '' },
  };
  for (const [name, value] of Object.entries(defaults)) {
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
      keywords: block.keywords ?? [],
      attributes: attributeTypes(block.defaults),
      ...(block.parent ? { parent: block.parent.map((p) => `prisma/${p}`) } : {}),
      supports: { html: false, className: true, anchor: true },
      edit: makeEdit(block, settings[block.name]),
      save: () => (block.container ? <InnerBlocks.Content /> : null),
    } as never);
  }
}
