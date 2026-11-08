/**
 * The structured data of a choice ("Lavatrici ad Albenga"), merged into the
 * schema.org graph of the SEO plugin when there is one: its WebPage takes
 * the choice's address and name, and its breadcrumb gets the choice as its
 * last step. One graph, one breadcrumb. Without it, Setax's own breadcrumb.
 */

export interface HeadTag {
  tag: string;
  data?: unknown;
}

type Node = Record<string, unknown>;

/** Every address of the page in the graph (its @id, url, `#fragment` ids) moved to the choice's. */
function moveAddresses(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') {
    if (value === from) return to;
    if (value.startsWith(`${from}#`)) return `${to}${value.slice(from.length)}`;
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => moveAddresses(v, from, to));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Node).map(([k, v]) => [k, moveAddresses(v, from, to)]),
    );
  return value;
}

export function choiceTags<T extends HeadTag>(
  tags: T[] | undefined,
  choice: {
    /** The page's own address, as the graph has it (the canonical before the choice). */
    pageUrl: string;
    url: string;
    /** The page's title in the browser ("Lavatrici ad Albenga – Site"). */
    title: string;
    heading: string;
    description: string;
    /** The page's own title, the step before the choice. */
    pageTitle: string;
  },
): T[] {
  const list: T[] = tags ?? [];
  const at = list.findIndex(
    (t) => t.tag === 'json-ld' && Array.isArray((t.data as Node | null)?.['@graph']),
  );
  if (at < 0 || !choice.pageUrl) {
    return [
      ...list,
      {
        tag: 'json-ld',
        data: {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: choice.pageTitle, item: choice.pageUrl },
            { '@type': 'ListItem', position: 2, name: choice.heading, item: choice.url },
          ],
        },
      } as T,
    ];
  }
  const data = moveAddresses(list[at]!.data, choice.pageUrl, choice.url) as Node;
  const graph = data['@graph'] as Node[];
  const page = graph.find(
    (n) => (n['@type'] === 'WebPage' || n['@type'] === 'CollectionPage') && n['@id'] === choice.url,
  );
  if (page) {
    page.name = choice.title;
    if (choice.description) page.description = choice.description;
  }
  const crumbsId = `${choice.url}#breadcrumb`;
  const crumbs = graph.find((n) => n['@type'] === 'BreadcrumbList');
  if (crumbs && Array.isArray(crumbs.itemListElement)) {
    const items = crumbs.itemListElement as Node[];
    const last = items.at(-1);
    if (last && last.name === choice.heading) {
      // The page already shows the choice as its title (render.title): its own step goes before it.
      items.splice(items.length - 1, 0, {
        '@type': 'ListItem',
        name: choice.pageTitle,
        item: choice.pageUrl,
      });
      delete last.item;
    } else {
      // The page's step (the last one, without an address as Yoast writes it) now leads to it.
      if (last && !last.item) last.item = choice.pageUrl;
      items.push({ '@type': 'ListItem', name: choice.heading });
    }
    items.forEach((item, i) => (item.position = i + 1));
  } else {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': crumbsId,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: choice.pageTitle, item: choice.pageUrl },
        { '@type': 'ListItem', position: 2, name: choice.heading },
      ],
    });
    if (page) page.breadcrumb = { '@id': crumbsId };
  }
  return list.map((t, i) => (i === at ? { ...t, data } : t));
}
