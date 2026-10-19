import { describe, expect, it } from 'vitest';
import { currentTop, itemActive, withPluginPages, type MenuNode } from './admin-menu';

const node = (to: string, label: string, children: MenuNode[] = []): MenuNode => ({
  to,
  label,
  children,
});

describe('the admin sidebar', () => {
  const top = [
    node('/', 'Dashboard'),
    node('/posts', 'Posts', [
      node('/posts', 'All posts'),
      node('/taxonomies/category', 'Categories'),
    ]),
    node('/appearance', 'Appearance', [
      { to: '/appearance', label: 'Themes', children: [] },
      { to: '/appearance', label: 'Menus', tab: 'menus', children: [] },
    ]),
  ];

  it('puts plugin pages under their parent, which then starts its submenu with itself', () => {
    const menu = withPluginPages(top, [
      { to: '/ext/shop', label: 'Shop', icon: 'M1 1' },
      { to: '/ext/shop/orders', label: 'Orders', parent: '/ext/shop' },
      { to: '/ext/vitality/templates', label: 'Templates', parent: '/appearance' },
      { to: '/ext/x/lost', label: 'Lost', parent: '/ext/x' },
    ]);
    const shop = menu.find((n) => n.to === '/ext/shop')!;
    expect(shop.children.map((c) => c.label)).toEqual(['Shop', 'Orders']);
    expect(menu.find((n) => n.to === '/appearance')!.children.map((c) => c.label)).toEqual([
      'Themes',
      'Menus',
      'Templates',
    ]);
    // A theme's menu right after Appearance.
    const placed = withPluginPages(top, [
      { to: '/ext/vitality', label: 'Vitality', after: '/appearance' },
      { to: '/ext/z', label: 'Z' },
    ]);
    expect(placed.map((n) => n.label)).toEqual([
      'Dashboard',
      'Posts',
      'Appearance',
      'Vitality',
      'Z',
    ]);
    // A parent that does not exist: the page stays at the top level.
    expect(menu.map((n) => n.label)).toContain('Lost');
  });

  it('finds the entry of the screen shown, and its active item', () => {
    expect(currentTop(top, '/taxonomies/category')!.label).toBe('Posts');
    expect(currentTop(top, '/')!.label).toBe('Dashboard');
    expect(currentTop(top, '/posts/123')!.label).toBe('Posts');
    const posts = top[1]!.children;
    expect(itemActive(posts[0]!, '/taxonomies/category', undefined, posts)).toBe(false);
    expect(itemActive(posts[1]!, '/taxonomies/category', undefined, posts)).toBe(true);
    const appearance = top[2]!.children;
    expect(itemActive(appearance[0]!, '/appearance', undefined, appearance)).toBe(true);
    expect(itemActive(appearance[1]!, '/appearance', 'menus', appearance)).toBe(true);
    expect(itemActive(appearance[0]!, '/appearance', 'menus', appearance)).toBe(false);
  });
});
