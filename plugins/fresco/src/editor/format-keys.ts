/**
 * Ctrl/⌘+B, I and U in rich text, as execCommand names. Firefox has no such
 * shortcuts in editable content (Ctrl+B even opens its bookmarks), so the
 * editor applies them itself in every browser.
 */
export function formatShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): 'bold' | 'italic' | 'underline' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return null;
  return (
    ({ b: 'bold', i: 'italic', u: 'underline' } as const)[
      event.key.toLowerCase() as 'b' | 'i' | 'u'
    ] ?? null
  );
}
