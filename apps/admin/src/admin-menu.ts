/**
 * The sidebar as WordPress has it: top-level entries, each with its submenu.
 * The current entry shows its submenu open below it; the others show it
 * beside the sidebar on hover or focus.
 */

export interface MenuNode {
  to: string;
  label: string;
  icon?: string;
  /** Active only on this exact address (the Dashboard). */
  exact?: boolean;
  /** A tab of the screen (`?tab=menus`). */
  tab?: string;
  /** A box of the screen (`#reading`). */
  hash?: string;
  children: MenuNode[];
}

export interface PluginPageItem {
  to: string;
  label: string;
  icon?: string;
  /** Address of the entry it belongs under (a plugin page or an admin section). */
  parent?: string;
  /** A tab of the screen it opens (a menu link to `/appearance?tab=customize`). */
  tab?: string;
}

/**
 * Plugin pages placed: under their parent when it exists (a plugin's main
 * page, or a section like `/appearance`), otherwise at the top level. A
 * parent that gets a submenu starts it with itself, as WordPress does
 * ("All posts" under Posts).
 */
export function withPluginPages(top: MenuNode[], pages: PluginPageItem[]): MenuNode[] {
  const nodes = top.map((n) => ({ ...n, children: [...n.children] }));
  const own = pages.filter((p) => p.parent === undefined || p.parent === p.to);
  for (const page of own)
    nodes.push({
      to: page.to,
      label: page.label,
      ...(page.icon ? { icon: page.icon } : {}),
      children: [],
    });
  for (const page of pages) {
    if (page.parent === undefined || page.parent === page.to) continue;
    const parent = nodes.find((n) => n.to === page.parent);
    if (!parent) {
      nodes.push({
        to: page.to,
        label: page.label,
        ...(page.icon ? { icon: page.icon } : {}),
        children: [],
      });
      continue;
    }
    if (parent.children.length === 0)
      parent.children.push({ to: parent.to, label: parent.label, children: [] });
    parent.children.push({
      to: page.to,
      label: page.label,
      ...(page.tab ? { tab: page.tab } : {}),
      children: [],
    });
  }
  return nodes;
}

const under = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

/** Whether a submenu item is the screen shown (its tab too, when it has one). */
export function itemActive(
  item: MenuNode,
  pathname: string,
  tab: string | undefined,
  siblings: MenuNode[],
): boolean {
  if (item.tab !== undefined || siblings.some((s) => s.to === item.to && s.tab !== undefined)) {
    return pathname === item.to && (item.tab ?? undefined) === (tab || undefined);
  }
  if (item.hash) return false;
  // The most specific sibling wins: /posts is not active on a taxonomy of posts.
  const better = siblings.some(
    (s) =>
      s !== item && s.to.length > item.to.length && under(pathname, s.to) && under(s.to, item.to),
  );
  return !better && (item.exact ? pathname === item.to : under(pathname, item.to));
}

/** The top-level entry of the screen shown: the deepest address that contains it. */
export function currentTop(nodes: MenuNode[], pathname: string): MenuNode | undefined {
  let best: { node: MenuNode; length: number } | undefined;
  for (const node of nodes) {
    for (const to of [node.to, ...node.children.map((c) => c.to)]) {
      const match = to === '/' ? pathname === '/' : under(pathname, to);
      if (match && (!best || to.length > best.length)) best = { node, length: to.length };
    }
  }
  return best?.node;
}
