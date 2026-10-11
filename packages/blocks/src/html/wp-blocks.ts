/**
 * Parser of WordPress block markup (`<!-- wp:name {attrs} -->…<!-- /wp:name -->`),
 * enough to read exported content. Free HTML between blocks becomes
 * blocks with `blockName: null`.
 */
export interface WpBlock {
  blockName: string | null;
  attrs: Record<string, unknown>;
  innerBlocks: WpBlock[];
  /** HTML of the block without its inner blocks. */
  innerHTML: string;
}

const TOKEN =
  /<!--\s+(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)\s+(\{(?:(?!-->).)*?\}\s+)?(\/)?-->/gs;

export function parseBlocks(html: string): WpBlock[] {
  const root: WpBlock = { blockName: null, attrs: {}, innerBlocks: [], innerHTML: '' };
  const stack: WpBlock[] = [root];
  const output: WpBlock[] = [];
  let last = 0;

  const text = (chunk: string) => {
    const parent = stack.at(-1)!;
    if (parent === root) {
      if (chunk.trim())
        output.push({ blockName: null, attrs: {}, innerBlocks: [], innerHTML: chunk });
    } else {
      parent.innerHTML += chunk;
    }
  };

  for (const match of html.matchAll(TOKEN)) {
    text(html.slice(last, match.index));
    last = match.index + match[0].length;
    const [, closing, namespace, name, json, selfClosing] = match;
    const blockName = `${namespace ?? 'core/'}${name}`;
    if (closing) {
      // Close up to the matching block (tolerates missing closers).
      const index = stack.map((b) => b.blockName).lastIndexOf(blockName);
      if (index <= 0) continue;
      while (stack.length > index) {
        const done = stack.pop()!;
        attach(done);
      }
      continue;
    }
    let attrs: Record<string, unknown> = {};
    if (json) {
      try {
        attrs = JSON.parse(json) as Record<string, unknown>;
      } catch {
        attrs = {};
      }
    }
    const block: WpBlock = { blockName, attrs, innerBlocks: [], innerHTML: '' };
    if (selfClosing) attach(block);
    else stack.push(block);
  }
  text(html.slice(last));
  while (stack.length > 1) attach(stack.pop()!);
  return output;

  function attach(block: WpBlock) {
    const parent = stack.at(-1)!;
    if (parent === root) output.push(block);
    else parent.innerBlocks.push(block);
  }
}
