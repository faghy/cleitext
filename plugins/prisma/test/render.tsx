/**
 * Draws a Prisma block as the site does (src/server.tsx), without a server:
 * for the unit tests of each block (test/<block>.test.tsx).
 */
import { inlineToHtml, type CxdInline } from '@cleitext/plugin-sdk';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { blockCss, withDefaults } from '../src/lib/css';
import { extensionProps } from '../src/lib/extensions';
import { DEFAULT_GLOBALS, type Globals } from '../src/lib/globals';
import { setIconData, type IconData } from '../src/lib/icons';
import icons from '../src/public/icons.json';
import { safeTag } from '../src/lib/tags';
import type { Attrs, PrismaBlock } from '../src/lib/types';

setIconData(icons as unknown as IconData);

export function renderBlock(
  block: PrismaBlock,
  attrs: Attrs,
  options: { id?: string; children?: string; globals?: Globals } = {},
): { html: string; css: string } {
  const id = options.id ?? 'test0001';
  const globals = options.globals ?? DEFAULT_GLOBALS;
  const all = withDefaults(block, attrs);
  const children: ReactNode = options.children
    ? createElement('div', { dangerouslySetInnerHTML: { __html: options.children } })
    : null;
  const html = renderToStaticMarkup(
    <block.View
      attrs={all}
      id={id}
      editing={false}
      globals={globals}
      text={(name, props) =>
        createElement(safeTag(props.tagName, 'div'), {
          ...(props.className ? { className: props.className } : {}),
          dangerouslySetInnerHTML: {
            __html: inlineToHtml(Array.isArray(all[name]) ? (all[name] as CxdInline[]) : []),
          },
        })
      }
      inner={(props) =>
        createElement(
          safeTag(props.tagName, 'div'),
          props.className ? { className: props.className } : {},
          children,
        )
      }
      root={(tag, props, content, holdsChildren) => {
        const extension = extensionProps(all);
        return createElement(
          safeTag(tag, 'div'),
          { ...props, className: [props.className, extension.className].filter(Boolean).join(' ') },
          content,
          holdsChildren ? children : null,
        );
      }}
    />,
  );
  return { html, css: blockCss(block, attrs, id, globals) };
}

/** Rich text from plain text, for test attributes. */
export const text = (value: string): CxdInline[] => [{ text: value }];
