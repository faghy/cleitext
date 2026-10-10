import { inlineText, type CxdBlock, type CxdDocument } from '@cleitext/blocks';

export interface DiffPart {
  text: string;
  change: 'same' | 'added' | 'removed';
}

/** One line per text block, for comparing revisions. */
export function documentLines(doc: CxdDocument | null | undefined): string[] {
  const lines: string[] = [];
  const walk = (blocks: CxdBlock[]) => {
    for (const block of blocks) {
      const text = block.content ? inlineText(block.content).trim() : '';
      if (text) lines.push(text);
      else if (block.type === 'core/image') lines.push(`[${String(block.attrs.alt || 'image')}]`);
      if (block.children) walk(block.children);
    }
  };
  if (doc) walk(doc.blocks);
  return lines;
}

/**
 * Word-level differences (longest common subsequence). Very long texts are
 * compared line by line instead, to stay fast.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const tokenize = (text: string): string[] => text.match(/\s+|[^\s]+/g) ?? [];
  let a = tokenize(before);
  let b = tokenize(after);
  if (a.length * b.length > 4_000_000) {
    a = before.split(/(?<=\n)/);
    b = after.split(/(?<=\n)/);
  }
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + j + 1]! + 1
          : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
    }
  }
  const parts: DiffPart[] = [];
  const push = (text: string, change: DiffPart['change']) => {
    const last = parts.at(-1);
    if (last && last.change === change) last.text += text;
    else parts.push({ text, change });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(a[i]!, 'same');
      i++;
      j++;
    } else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) push(a[i++]!, 'removed');
    else push(b[j++]!, 'added');
  }
  while (i < a.length) push(a[i++]!, 'removed');
  while (j < b.length) push(b[j++]!, 'added');
  return parts;
}
