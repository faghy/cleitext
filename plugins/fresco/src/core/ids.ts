/** Short ids for new elements: 8 characters, unique enough within a page. */
export function newId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-2);
}
