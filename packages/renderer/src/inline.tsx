import type { CxdInline, CxdText, Mark } from '@cleitext/blocks';
import { Fragment, type ReactNode } from 'react';
import { safeUrl } from './url.js';

const MARK_TAGS: Record<Mark, 'strong' | 'em' | 'u' | 's' | 'code' | 'sup' | 'sub' | 'mark'> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strike: 's',
  code: 'code',
  sup: 'sup',
  sub: 'sub',
  highlight: 'mark',
};

/** Rich text (CXD inline nodes) as React elements. React escapes all text. */
export function Inline({ nodes }: { nodes: CxdInline[] | undefined }): ReactNode {
  if (!nodes || nodes.length === 0) return null;
  return nodes.map((node, index) => {
    if ('type' in node) {
      const href = safeUrl(node.href);
      const children = node.children.map((child, i) => <Text key={i} node={child} />);
      if (!href) return <Fragment key={index}>{children}</Fragment>;
      const external = node.target === '_blank';
      const rel = [node.rel, external ? 'noopener noreferrer' : undefined]
        .filter(Boolean)
        .join(' ');
      return (
        <a key={index} href={href} target={external ? '_blank' : undefined} rel={rel || undefined}>
          {children}
        </a>
      );
    }
    return <Text key={index} node={node} />;
  });
}

function Text({ node }: { node: CxdText }): ReactNode {
  const lines = node.text.split('\n');
  let content: ReactNode = lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </Fragment>
  ));
  for (const mark of node.marks ?? []) {
    const Tag = MARK_TAGS[mark];
    content = <Tag>{content}</Tag>;
  }
  return content;
}

/** Whether rich text has any visible text. */
export function hasText(nodes: CxdInline[] | undefined): boolean {
  return Boolean(
    nodes?.some((n) => ('type' in n ? n.children.some((c) => c.text.trim()) : n.text.trim())),
  );
}
