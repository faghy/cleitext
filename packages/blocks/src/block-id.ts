let counter = 0;

/** New block id: short, URL-safe, unique enough within a document. */
export function newBlockId(): string {
  counter = (counter + 1) % 1_296;
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `b_${time}${counter.toString(36).padStart(2, '0')}${random}`;
}
