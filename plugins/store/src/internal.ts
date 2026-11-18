/**
 * Internal and external installations (Store 1.6): sites on our own servers
 * and domains are internal, every other one external. The list of internal
 * domains and servers is a setting, one pattern per line:
 *
 * - `*.2clic.it`: every host under 2clic.it (not 2clic.it itself);
 * - `sitoup.it`: that host only;
 * - `203.0.113.7` or `203.0.113.0/24`: the address (or network) the reports come from.
 *
 * A pattern of a name is matched against the site's own host and against the
 * name of the server the report came from (reverse DNS of its address, e.g.
 * server1.2clic.it). Sites of one Cleitext installation (same install id) run
 * on one server: when one of them is internal by its host, its server or its
 * address, they all are. An installation can also be marked by hand.
 */

export const DEFAULT_INTERNAL_HOSTS = [
  '*.2clic.it',
  '2clic.it',
  '*.sitoup.it',
  'sitoup.it',
  '*.dnsbazar.com',
  'dnsbazar.com',
].join('\n');

export type InternalReason = 'manual' | 'origin' | 'server' | 'address' | 'installation';

export interface Pattern {
  kind: 'host' | 'suffix' | 'ip' | 'cidr';
  value: string;
  bits?: number;
}

const HOST_RE =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const V4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function v4(value: string): number | null {
  const m = V4_RE.exec(value);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

/** An IPv6 address written as IPv4 (`::ffff:1.2.3.4`) is that IPv4 address. */
const plainIp = (ip: string) =>
  ip
    .trim()
    .toLowerCase()
    .replace(/^::ffff:(?=\d+\.)/, '');

/** The patterns of the setting; lines that are not patterns (and `#` comments) are skipped. */
export function parsePatterns(text: unknown): Pattern[] {
  const source = typeof text === 'string' ? text : DEFAULT_INTERNAL_HOSTS;
  const out: Pattern[] = [];
  for (const raw of source.split(/[\n,]/)) {
    const line = raw.replace(/#.*$/, '').trim().toLowerCase().replace(/\.$/, '');
    if (!line) continue;
    const cidr = /^([\d.]+)\/(\d{1,2})$/.exec(line);
    if (cidr && v4(cidr[1]!) !== null && Number(cidr[2]) <= 32) {
      out.push({ kind: 'cidr', value: cidr[1]!, bits: Number(cidr[2]) });
    } else if (v4(line) !== null || (line.includes(':') && /^[0-9a-f:]+$/.test(line))) {
      out.push({ kind: 'ip', value: plainIp(line) });
    } else if (line.startsWith('*.') && HOST_RE.test(line.slice(2))) {
      out.push({ kind: 'suffix', value: line.slice(2) });
    } else if (HOST_RE.test(line)) {
      out.push({ kind: 'host', value: line });
    }
  }
  return out;
}

/** Whether a host name matches one of the name patterns. */
export function hostMatches(patterns: Pattern[], host: string | null | undefined): boolean {
  const h = (host ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  return patterns.some((p) =>
    p.kind === 'host' ? h === p.value : p.kind === 'suffix' ? h.endsWith(`.${p.value}`) : false,
  );
}

/** Whether an address matches one of the address patterns. */
export function ipMatches(patterns: Pattern[], ip: string | null | undefined): boolean {
  if (!ip) return false;
  const address = plainIp(ip);
  const n = v4(address);
  return patterns.some((p) => {
    if (p.kind === 'ip') return p.value === address;
    if (p.kind !== 'cidr' || n === null) return false;
    const bits = p.bits ?? 32;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) >>> 0 === (v4(p.value)! & mask) >>> 0;
  });
}

const hostOf = (origin: string) => {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return '';
  }
};

export interface Classifiable {
  origin: string;
  installId?: string | null;
  serverHost?: string | null;
  serverIp?: string | null;
  /** Marked by hand: true internal, false external, null automatic. */
  internal?: boolean | null;
}

export interface Classified {
  internal: boolean;
  reason: InternalReason | null;
}

/** Why one site is internal by itself (not by its installation), or null. */
function ownReason(patterns: Pattern[], row: Classifiable): InternalReason | null {
  if (hostMatches(patterns, hostOf(row.origin))) return 'origin';
  if (hostMatches(patterns, row.serverHost)) return 'server';
  if (ipMatches(patterns, row.serverIp)) return 'address';
  return null;
}

/**
 * Internal or external, with the reason, for each row (by origin). A site
 * marked by hand keeps its mark; the others are internal by their own host,
 * their server's name or address, or because a site of the same installation
 * is (sites marked external by hand do not count for their installation).
 */
export function classify(patterns: Pattern[], rows: Classifiable[]): Map<string, Classified> {
  const own = new Map(rows.map((r) => [r.origin, ownReason(patterns, r)] as const));
  const internalInstalls = new Set(
    rows
      .filter((r) => r.installId && r.internal !== false && (own.get(r.origin) || r.internal))
      .map((r) => r.installId!),
  );
  const out = new Map<string, Classified>();
  for (const row of rows) {
    if (row.internal === true || row.internal === false) {
      out.set(row.origin, { internal: row.internal, reason: 'manual' });
      continue;
    }
    const reason =
      own.get(row.origin) ??
      (row.installId && internalInstalls.has(row.installId) ? 'installation' : null);
    out.set(row.origin, { internal: reason !== null, reason });
  }
  return out;
}

/** One origin without a report (e.g. a site of a license): by its host only. */
export function classifyOrigin(patterns: Pattern[], origin: string): Classified {
  const reason = hostMatches(patterns, hostOf(origin)) ? 'origin' : null;
  return { internal: reason !== null, reason };
}
