/**
 * Deterministic order of the plugins active on a site: a plugin comes after
 * the plugins it requires (`requires.plugins` in its manifest), ties are
 * broken by slug. Stylesheets, scripts, hooks and blocks follow this order,
 * so a plugin that extends another one (e.g. its CSS) always loads after it.
 * A dependency cycle (which activation prevents) does not lose plugins: the
 * remaining ones are appended by slug.
 */
export function orderPluginSlugs(
  slugs: Iterable<string>,
  requiresOf: (slug: string) => Iterable<string>,
): string[] {
  const pending = new Set([...slugs].sort());
  const deps = new Map(
    [...pending].map((slug) => [slug, [...requiresOf(slug)].filter((d) => d !== slug)]),
  );
  const result: string[] = [];
  while (pending.size > 0) {
    // The first slug (in alphabetical order) whose active dependencies are all placed.
    let next: string | undefined;
    for (const slug of pending) {
      if (deps.get(slug)!.every((d) => !pending.has(d))) {
        next = slug;
        break;
      }
    }
    if (next === undefined) {
      result.push(...pending);
      break;
    }
    pending.delete(next);
    result.push(next);
  }
  return result;
}
