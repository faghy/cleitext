/**
 * Helpers of the content timeline shared by the block, the editor and the
 * site's script: dates written with PHP-style formats (as WordPress does)
 * and the connector line that fills while the page scrolls.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Parts {
  y: number;
  m: number; // 0–11
  d: number;
  h: number;
  i: number;
  s: number;
}

/** A date as typed (`mm/dd/yyyy`, `yyyy-mm-dd[Thh:mm[:ss]]`), else what the browser reads. */
export function parseDate(raw: unknown): Parts | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (m) return valid({ y: +m[3]!, m: +m[1]! - 1, d: +m[2]!, h: 0, i: 0, s: 0 });
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (m)
    return valid({
      y: +m[1]!,
      m: +m[2]! - 1,
      d: +m[3]!,
      h: +(m[4] ?? 0),
      i: +(m[5] ?? 0),
      s: +(m[6] ?? 0),
    });
  const t = Date.parse(text);
  if (Number.isNaN(t)) return null;
  const date = new Date(t);
  return {
    y: date.getFullYear(),
    m: date.getMonth(),
    d: date.getDate(),
    h: date.getHours(),
    i: date.getMinutes(),
    s: date.getSeconds(),
  };
}

function valid(p: Parts): Parts | null {
  const date = new Date(Date.UTC(p.y, p.m, p.d));
  return date.getUTCMonth() === p.m && date.getUTCDate() === p.d ? p : null;
}

const pad = (n: number, size = 2) => String(n).padStart(size, '0');

function suffix(d: number): string {
  if (d % 100 >= 11 && d % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][d % 10] ?? 'th';
}

/**
 * A date written with a PHP date format (`F j, Y`, `d/m/Y`…, English
 * names); `custom` or an unreadable date gives the text as typed.
 */
export function formatDate(format: unknown, raw: unknown): string {
  const text = typeof raw === 'string' ? raw : '';
  if (format === 'custom' || typeof format !== 'string') return text;
  const p = parseDate(text);
  if (!p) return text;
  const weekday = new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay();
  const leap = (p.y % 4 === 0 && p.y % 100 !== 0) || p.y % 400 === 0;
  const h12 = p.h % 12 || 12;
  let out = '';
  for (let k = 0; k < format.length; k++) {
    const c = format[k]!;
    switch (c) {
      case 'd':
        out += pad(p.d);
        break;
      case 'D':
        out += DAYS[weekday]!.slice(0, 3);
        break;
      case 'j':
        out += p.d;
        break;
      case 'l':
        out += DAYS[weekday];
        break;
      case 'N':
        out += weekday || 7;
        break;
      case 'S':
        out += suffix(p.d);
        break;
      case 'w':
        out += weekday;
        break;
      case 'F':
        out += MONTHS[p.m];
        break;
      case 'M':
        out += MONTHS[p.m]!.slice(0, 3);
        break;
      case 'm':
        out += pad(p.m + 1);
        break;
      case 'n':
        out += p.m + 1;
        break;
      case 't':
        out += new Date(Date.UTC(p.y, p.m + 1, 0)).getUTCDate();
        break;
      case 'L':
        out += leap ? 1 : 0;
        break;
      case 'Y':
        out += p.y;
        break;
      case 'y':
        out += pad(p.y % 100);
        break;
      case 'a':
        out += p.h < 12 ? 'am' : 'pm';
        break;
      case 'A':
        out += p.h < 12 ? 'AM' : 'PM';
        break;
      case 'g':
        out += h12;
        break;
      case 'G':
        out += p.h;
        break;
      case 'h':
        out += pad(h12);
        break;
      case 'H':
        out += pad(p.h);
        break;
      case 'i':
        out += pad(p.i);
        break;
      case 's':
        out += pad(p.s);
        break;
      case '\\':
        k++;
        out += format[k] ?? '';
        break;
      default:
        out += c;
    }
  }
  return out;
}

/**
 * Places the connector line between the first and the last marker, fills
 * it down to two thirds of the window, and marks the items whose marker
 * has reached the middle of the window (`is-in-view`).
 */
export function updateTimeline(root: HTMLElement): void {
  const view = root.ownerDocument.defaultView;
  if (!view) return;
  const line = root.querySelector<HTMLElement>(':scope > .pr-timeline__line');
  const fill = line?.querySelector<HTMLElement>('.pr-timeline__line-inner');
  const items = [...root.children].filter((c): c is HTMLElement =>
    c.classList.contains('pr-timeline-item'),
  );
  const markers = items
    .map((item) => item.querySelector<HTMLElement>(':scope > .pr-timeline-item__marker'))
    .filter((m): m is HTMLElement => m !== null);
  if (!line || markers.length === 0) return;
  const first = markers[0]!;
  const last = markers[markers.length - 1]!;
  const lastItem = items[items.length - 1]!;
  line.style.top = `${first.offsetTop}px`;
  line.style.bottom = root.classList.contains('pr-timeline--arrow-center')
    ? `${last.offsetTop}px`
    : `${lastItem.offsetHeight - last.offsetTop}px`;
  const height = view.innerHeight;
  const firstTop = first.getBoundingClientRect().top;
  const total = last.getBoundingClientRect().top - firstTop;
  if (fill) {
    const filled = Math.max(0, (height * 2) / 3 - firstTop);
    fill.style.height = `${Math.min(filled, Math.max(0, total) + 60, line.offsetHeight)}px`;
  }
  const limit = height / 2 + 3 * first.offsetHeight;
  items.forEach((item, i) => {
    const marker = markers[i];
    if (!marker) return;
    const inView = marker.getBoundingClientRect().top < limit;
    marker.classList.toggle('is-in-view', inView);
    item.classList.toggle('is-in-view', inView);
  });
}
