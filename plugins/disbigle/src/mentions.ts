/**
 * Mentions written `@user@server` in an article become links to the
 * person's profile, as Disbigle resolved them when it published the post.
 * Works on the block document before rendering; text already in a link and
 * code are left alone. No I/O here.
 */
import type { CxdBlock, CxdInline } from '@cleitext/plugin-sdk';
import { LINKED_MENTION_RE } from './payload';
import type { Mention } from './types';

type CxdText = Exclude<CxdInline, { type: 'link' }>;

/** `acct` as the server gives it (`user` for its own people) → `user@host`. */
export function fullAcct(acct: string, instanceHost: string): string {
  const clean = acct.replace(/^@/, '').toLowerCase();
  return clean.includes('@') ? clean : `${clean}@${instanceHost.toLowerCase()}`;
}

/** The mentions of a status, by `user@host`, with http(s) profile addresses only. */
export function mentionMap(mentions: Mention[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const mention of mentions ?? []) {
    if (!/^https?:\/\//i.test(mention.url)) continue;
    map.set(mention.acct.toLowerCase(), mention.url);
  }
  return map;
}

function linkText(node: CxdText, profiles: Map<string, string>): CxdInline[] | null {
  if (node.marks?.includes('code') || !node.text.includes('@')) return null;
  const out: CxdInline[] = [];
  let last = 0;
  for (const match of node.text.matchAll(LINKED_MENTION_RE)) {
    const url = profiles.get(`${match[1]}@${match[2]}`.toLowerCase());
    if (!url) continue;
    const start = match.index;
    if (start > last) out.push({ ...node, text: node.text.slice(last, start) });
    out.push({
      type: 'link',
      href: url,
      rel: 'nofollow noopener',
      ...(node.color ? { color: node.color } : {}),
      children: [{ ...node, text: match[0] }],
    });
    last = start + match[0].length;
  }
  if (last === 0) return null;
  if (last < node.text.length) out.push({ ...node, text: node.text.slice(last) });
  return out;
}

export function linkInline(nodes: CxdInline[], profiles: Map<string, string>): CxdInline[] {
  let changed = false;
  const out: CxdInline[] = [];
  for (const node of nodes) {
    const linked = 'type' in node ? null : linkText(node, profiles);
    if (linked) {
      changed = true;
      out.push(...linked);
    } else out.push(node);
  }
  return changed ? out : nodes;
}

/** The blocks with the known mentions linked; the same array when nothing changed. */
export function linkMentions(blocks: CxdBlock[], profiles: Map<string, string>): CxdBlock[] {
  if (profiles.size === 0) return blocks;
  let changed = false;
  const out = blocks.map((block) => {
    const content = Array.isArray(block.content) ? linkInline(block.content, profiles) : undefined;
    const children = Array.isArray(block.children)
      ? linkMentions(block.children, profiles)
      : undefined;
    if (content === block.content && children === block.children) return block;
    changed = true;
    return {
      ...block,
      ...(content ? { content } : {}),
      ...(children ? { children } : {}),
    };
  });
  return changed ? out : blocks;
}
