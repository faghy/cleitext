/**
 * Sites translated with WPML, exported with WP-CLI: the WXR file says nothing
 * about languages, but every translation of a page carries the address of the
 * page in the main language (`<link>`). Entries of the same type that share it
 * are one translation group; the language of each is recognised from its text,
 * among the site's languages, one entry per language.
 */

/** Frequent short words of each language (articles, prepositions, pronouns). */
const WORDS: Record<string, string[]> = Object.fromEntries(
  Object.entries({
    it: 'il lo la gli le di della del che e per con una un sono nel nella alla dei delle anche più come non ci al questo tra tutti vostro nostro',
    en: 'the and of to in is for with our you your are on this that from by we an at it be or all can more have which their will',
    de: 'der die das und mit für ist ein eine den dem des von zu auf im sie wir unsere ihre nicht auch sich oder bei aus wie zum zur sind',
    fr: 'le la les des et est une un pour avec dans du que qui nous vous sur au aux ce cette sont pas par plus notre votre leur ou comme',
    es: 'el la los las de del y en que para con una un es por su sus al lo como más nuestro nuestra son se o pero este esta muy',
    pt: 'o a os as de do da dos das e em no na que para com um uma é por mais nosso nossa seu sua ao são como não ou',
    nl: 'de het een en van in is met voor op te dat die zijn wij onze uw aan ook als bij om naar niet of door je er meer dit',
  }).map(([code, words]) => [code, words.split(' ')]),
);

/** How much a text looks like each candidate language (share of its frequent words). */
export function languageScores(text: string, candidates: string[]): Record<string, number> {
  const words = text
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/g, ' ')
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  const scores: Record<string, number> = {};
  for (const code of candidates) {
    const list = new Set(WORDS[code.split('-')[0]!] ?? []);
    const hits = words.filter((w) => list.has(w)).length;
    scores[code] = words.length ? hits / words.length : 0;
  }
  return scores;
}

/**
 * Languages for the members of one group: the assignment with the best total
 * score, each language at most once. Members left over (more members than
 * languages) get null.
 */
export function assignLanguages(texts: string[], candidates: string[]): (string | null)[] {
  const scores = texts.map((t) => languageScores(t, candidates));
  let best: { total: number; pick: (string | null)[] } = { total: -1, pick: [] };
  const walk = (i: number, used: Set<string>, pick: (string | null)[], total: number) => {
    if (i === texts.length) {
      if (total > best.total) best = { total, pick: [...pick] };
      return;
    }
    for (const code of candidates) {
      if (used.has(code)) continue;
      used.add(code);
      pick.push(code);
      walk(i + 1, used, pick, total + scores[i]![code]!);
      pick.pop();
      used.delete(code);
    }
    if (texts.length - i > candidates.length - used.size) {
      pick.push(null);
      walk(i + 1, used, pick, total);
      pick.pop();
    }
  };
  // Groups are small (one entry per language); larger ones are not WPML groups.
  if (texts.length > 8 || candidates.length > 8) return texts.map(() => null);
  walk(0, new Set(), [], 0);
  return best.pick;
}
