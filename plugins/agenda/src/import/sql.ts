/**
 * The rows of a MySQL dump (mysqldump, phpMyAdmin, Adminer, WP-CLI's
 * `wp db export`): every `INSERT INTO` of the tables asked for, with or
 * without a list of columns (then `CREATE TABLE` gives their names). Values
 * are read as strings (NULL as null). Nothing of the dump is ever run.
 */

export type SqlRow = Record<string, string | null>;

/** Tables whose name ends with one of `suffixes` (any prefix: `wp_`, `wp2_`…), by suffix. */
export function readDump(text: string, suffixes: string[]): Record<string, SqlRow[]> {
  const out: Record<string, SqlRow[]> = Object.fromEntries(suffixes.map((s) => [s, []]));
  const columns = new Map<string, string[]>();
  const suffixOf = (table: string) =>
    suffixes
      .filter((s) => table === s || table.endsWith(`_${s}`))
      .sort((a, b) => b.length - a.length)[0];

  // Columns from CREATE TABLE, for INSERTs without a column list.
  for (const m of text.matchAll(
    /CREATE TABLE(?: IF NOT EXISTS)?\s+`?(\w+)`?\s*\(([\s\S]*?)\)\s*(?:ENGINE|;)/gi,
  )) {
    const names: string[] = [];
    for (const line of m[2]!.split('\n')) {
      const col = /^\s*`(\w+)`\s/.exec(line);
      if (col) names.push(col[1]!);
    }
    columns.set(m[1]!, names);
  }

  const insert = /INSERT\s+(?:IGNORE\s+)?INTO\s+`?(\w+)`?\s*(\(([^)]*)\))?\s*VALUES\s*/gi;
  let m: RegExpExecArray | null;
  while ((m = insert.exec(text))) {
    const table = m[1]!;
    const suffix = suffixOf(table);
    const names = m[3]
      ? m[3].split(',').map((c) => c.trim().replace(/`/g, ''))
      : (columns.get(table) ?? []);
    const { tuples, end } = readTuples(text, insert.lastIndex);
    insert.lastIndex = end;
    if (!suffix) continue;
    for (const values of tuples) {
      out[suffix]!.push(Object.fromEntries(names.map((n, i) => [n, values[i] ?? null])));
    }
  }
  return out;
}

/** `(…),(…);` from `at`: the values of each tuple, and where the statement ends. */
function readTuples(text: string, at: number): { tuples: (string | null)[][]; end: number } {
  const tuples: (string | null)[][] = [];
  let i = at;
  let tuple: (string | null)[] | null = null;
  let token = '';
  let quoted = false;
  let wasQuoted = false;
  const push = () => {
    const raw = token.trim();
    tuple!.push(wasQuoted ? token : raw.toUpperCase() === 'NULL' ? null : raw);
    token = '';
    wasQuoted = false;
  };
  for (; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '\\') {
        const next = text[++i] ?? '';
        token +=
          next === 'n'
            ? '\n'
            : next === 'r'
              ? '\r'
              : next === 't'
                ? '\t'
                : next === '0'
                  ? '\0'
                  : next;
      } else if (ch === "'") {
        if (text[i + 1] === "'") {
          token += "'";
          i++;
        } else quoted = false;
      } else token += ch;
      continue;
    }
    if (tuple === null) {
      if (ch === '(') {
        tuple = [];
        token = '';
      } else if (ch === ';') return { tuples, end: i + 1 };
      continue;
    }
    if (ch === "'") {
      quoted = true;
      wasQuoted = true;
      token = '';
    } else if (ch === ',') push();
    else if (ch === ')') {
      push();
      tuples.push(tuple);
      tuple = null;
    } else token += ch;
  }
  return { tuples, end: i };
}
