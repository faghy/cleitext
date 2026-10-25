/**
 * Agenda's booking widget in the browser: a few kilobytes, no library.
 * Service → day → time → details → done, as Calendly does it: only free
 * times are shown, the focus follows each step (announced to screen
 * readers), times show in the site's zone with a switch to the visitor's
 * own, and a slot taken meanwhile sends the visitor back to the times with
 * a polite message. On an appointment's page it moves the appointment.
 */

import { MARKER } from '../config';

interface Strings {
  [key: string]: string;
}

interface Config {
  api: string;
  manage: string;
  locale: string;
  timeZone: string;
  view: 'week' | 'month';
  fixed: string | null;
  token?: string;
  services: {
    id: string;
    name: string;
    duration: number;
    price: string;
    color: string;
    capacity: number;
  }[];
  strings: Strings;
}

interface Slot {
  start: string;
  end: string;
  left: number;
}

interface SlotsAnswer {
  timeZone: string;
  slots: Slot[];
  next: string | null;
  limit?: boolean;
  contact?: string;
}

interface Challenge {
  prepare?: (form: HTMLFormElement) => Promise<void>;
  reset?: (form: HTMLFormElement) => void;
  require?: (form: HTMLFormElement) => void;
}

const w = window as unknown as { cleitextChallenge?: Challenge };

const pad = (n: number) => String(n).padStart(2, '0');

const partsCache = new Map<string, Intl.DateTimeFormat>();
function ymd(ms: number, tz: string): string {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    partsCache.set(tz, f);
  }
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(new Date(ms))) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const dateOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12));
};

const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c !== null) node.append(c);
  return node;
}

class Widget {
  private readonly c: Config;
  private readonly s: Strings;
  private readonly lang: string;
  private readonly visitorZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  private zone: string;
  private service: Config['services'][number] | null = null;
  private slots: Slot[] = [];
  private cursor: string;
  private day: string | null = null;
  private slot: Slot | null = null;
  private busy = false;
  private next: string | null = null;
  /** A message shown above the calendar (a time just taken). */
  private notice = '';
  private loaded = { from: '', to: '', service: '' };

  constructor(private readonly root: HTMLElement) {
    this.c = JSON.parse(root.getAttribute(MARKER) || '{}') as Config;
    this.s = this.c.strings;
    this.lang = this.c.locale.startsWith('it') ? 'it-IT' : this.c.locale || 'en';
    this.zone = this.c.timeZone;
    this.cursor = this.startOfView(ymd(Date.now(), this.zone));
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-ag-service]')) {
      b.addEventListener('click', () => this.chooseService(b.dataset.agService!));
    }
    this.form?.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    const only = this.c.fixed ?? (this.c.services.length === 1 ? this.c.services[0]!.id : null);
    if (only) this.chooseService(only, false);
  }

  private get form() {
    return this.root.querySelector<HTMLFormElement>('.ag-form');
  }

  private step(name: string) {
    return this.root.querySelector<HTMLElement>(`[data-ag-step="${name}"]`)!;
  }

  private announce(text: string) {
    const live = this.root.querySelector('[data-ag-live]');
    if (live) live.textContent = text;
  }

  private show(name: string, focus = true) {
    for (const s of this.root.querySelectorAll<HTMLElement>('[data-ag-step]'))
      s.hidden = s.dataset.agStep !== name;
    const target = this.step(name);
    const title = target.querySelector<HTMLElement>('.ag-step-title') ?? target;
    if (focus) {
      title.focus({ preventScroll: true });
      const top = this.root.getBoundingClientRect().top;
      if (top < 0) this.root.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    this.announce(title.textContent ?? '');
  }

  private fmt(ms: number, options: Intl.DateTimeFormatOptions): string {
    try {
      return new Intl.DateTimeFormat(this.lang, { timeZone: this.zone, ...options }).format(
        new Date(ms),
      );
    } catch {
      return new Date(ms).toISOString();
    }
  }

  private dayLabel(date: string, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.lang, { timeZone: 'UTC', ...options }).format(dateOf(date));
  }

  private time(ms: number) {
    return this.fmt(ms, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  }

  private startOfView(date: string): string {
    if (this.c.view === 'month') return `${date.slice(0, 7)}-01`;
    return date;
  }

  private range(): { from: string; to: string } {
    if (this.c.view === 'month') {
      const [y, m] = this.cursor.split('-').map(Number) as [number, number];
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return { from: this.cursor, to: `${this.cursor.slice(0, 7)}-${pad(last)}` };
    }
    return { from: this.cursor, to: addDays(this.cursor, 6) };
  }

  private summary(withTime: boolean) {
    for (const box of this.root.querySelectorAll<HTMLElement>('[data-ag-summary]')) {
      box.replaceChildren();
      if (!this.service) continue;
      const text = el('span', {}, el('strong', {}, this.service.name));
      if (withTime && this.slot) {
        const start = Date.parse(this.slot.start);
        text.append(
          ' · ',
          this.fmt(start, { weekday: 'long', day: 'numeric', month: 'long' }),
          ' · ',
          this.time(start),
        );
      } else {
        text.append(` · ${fill(this.s.minutes!, { n: this.service.duration })}`);
      }
      box.append(text);
      const multiple = !this.c.fixed && this.c.services.length > 1;
      if (withTime || multiple) {
        const change = el('button', { type: 'button', class: 'ag-link' }, this.s.change!);
        change.addEventListener('click', () =>
          withTime ? this.backToTimes() : this.show('service'),
        );
        box.append(change);
      }
    }
  }

  chooseService(id: string, focus = true) {
    const service = this.c.services.find((s) => s.id === id);
    if (!service) return;
    this.service = service;
    for (const f of this.root.querySelectorAll<HTMLFieldSetElement>('[data-ag-fields]')) {
      const mine = f.dataset.agFields === id;
      f.hidden = !mine;
      f.disabled = !mine;
    }
    this.day = null;
    this.slot = null;
    this.summary(false);
    this.show('time', focus);
    void this.load();
  }

  private async load(jumpTo?: string) {
    if (!this.service) return;
    if (jumpTo) this.cursor = this.startOfView(jumpTo);
    const { from, to } = this.range();
    const box = this.root.querySelector<HTMLElement>('[data-ag-calendar]')!;
    if (
      this.loaded.from !== from ||
      this.loaded.to !== to ||
      this.loaded.service !== this.service.id
    ) {
      box.setAttribute('aria-busy', 'true');
      const params = new URLSearchParams({
        service: this.service.id,
        // One day more on each side: the visitor's zone may move times across midnight.
        from: addDays(from, -1),
        to: addDays(to, 1),
      });
      if (this.c.token) params.set('token', this.c.token);
      try {
        const res = await fetch(`${this.c.api}/public/slots?${params.toString()}`, {
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as SlotsAnswer;
        if (data.limit) {
          this.limit(data.contact ?? '');
          return;
        }
        this.slots = data.slots;
        this.next = data.next;
        this.loaded = { from, to, service: this.service.id };
      } catch {
        box.replaceChildren(el('p', { class: 'ag-error', role: 'alert' }, this.s.error!));
        box.removeAttribute('aria-busy');
        return;
      }
      box.removeAttribute('aria-busy');
    }
    this.draw();
    if (jumpTo) this.pickDay(jumpTo);
  }

  private limit(contact: string) {
    const box = el(
      'div',
      { class: 'ag-limit', role: 'status' },
      el('p', { class: 'ag-limit-title' }, this.s.limit!),
    );
    if (contact) {
      box.append(el('p', {}, this.s.limitContact!));
      const p = el('p', { class: 'ag-contact' });
      contact.split(/\r?\n/).forEach((line) => p.append(line, el('br')));
      box.append(p);
    }
    this.root.replaceChildren(box);
  }

  /** Free slots by day, in the zone shown. */
  private byDay(): Map<string, Slot[]> {
    const map = new Map<string, Slot[]>();
    for (const slot of this.slots) {
      const day = ymd(Date.parse(slot.start), this.zone);
      const list = map.get(day) ?? [];
      list.push(slot);
      map.set(day, list);
    }
    return map;
  }

  private draw() {
    const box = this.root.querySelector<HTMLElement>('[data-ag-calendar]')!;
    const days = this.byDay();
    const { from, to } = this.range();
    const today = ymd(Date.now(), this.zone);
    const month = this.c.view === 'month';
    const prev = el(
      'button',
      {
        type: 'button',
        class: 'ag-icon',
        'aria-label': month ? this.s.prevMonth : this.s.prevWeek,
        disabled: from <= today,
      },
      '‹',
    );
    const next = el(
      'button',
      {
        type: 'button',
        class: 'ag-icon',
        'aria-label': month ? this.s.nextMonth : this.s.nextWeek,
      },
      '›',
    );
    prev.addEventListener('click', () => this.move(-1));
    next.addEventListener('click', () => this.move(1));
    const label = month
      ? this.dayLabel(from, { month: 'long', year: 'numeric' })
      : `${this.dayLabel(from, { day: 'numeric', month: 'short' })} – ${this.dayLabel(to, { day: 'numeric', month: 'short' })}`;
    const nav = el(
      'div',
      { class: 'ag-nav' },
      prev,
      el('span', { class: 'ag-nav-label', 'aria-live': 'polite' }, label),
      next,
    );

    let grid: HTMLElement;
    if (month) {
      grid = el('div', { class: 'ag-month', role: 'group', 'aria-label': label });
      // Monday first.
      for (let i = 0; i < 7; i++) {
        grid.append(
          el(
            'span',
            { class: 'ag-dow', 'aria-hidden': 'true' },
            this.dayLabel(addDays('2024-01-01', i), { weekday: 'narrow' }),
          ),
        );
      }
      const offset = (dateOf(from).getUTCDay() + 6) % 7;
      for (let i = 0; i < offset; i++) grid.append(el('span'));
      for (let d = from; d <= to; d = addDays(d, 1))
        grid.append(this.dayButton(d, days.has(d), 'ag-day', String(Number(d.slice(8)))));
    } else {
      grid = el('div', { class: 'ag-week', role: 'group', 'aria-label': label });
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const b = this.dayButton(d, days.has(d), 'ag-chip', '');
        b.append(
          el('small', {}, this.dayLabel(d, { weekday: 'short' })),
          el('span', {}, String(Number(d.slice(8)))),
        );
        grid.append(b);
      }
    }
    const out: Node[] = [];
    if (this.notice) out.push(el('p', { class: 'ag-error', role: 'alert' }, this.notice));
    out.push(nav, grid);
    const visible = [...days.keys()].filter((d) => d >= from && d <= to);
    if (visible.length === 0) {
      const empty = el('p', { class: 'ag-note' }, this.s.noSlots!);
      out.push(empty);
      if (this.next) {
        const jump = el(
          'button',
          { type: 'button', class: 'ag-link' },
          fill(this.s.nextAvailable!, {
            date: this.dayLabel(this.next, { weekday: 'long', day: 'numeric', month: 'long' }),
          }),
        );
        const target = this.next;
        jump.addEventListener('click', () => void this.load(target));
        out.push(jump);
      } else {
        out.push(el('p', { class: 'ag-note' }, this.s.noneSoon!));
      }
    }
    out.push(el('div', { 'data-ag-times': '' }));
    out.push(this.zoneSwitch());
    box.replaceChildren(...out);
    const first = visible[0];
    if (this.day && days.has(this.day)) this.pickDay(this.day, false);
    else if (first && !month) this.pickDay(first, false);
  }

  private dayButton(date: string, free: boolean, cls: string, text: string) {
    const b = el(
      'button',
      {
        type: 'button',
        class: `${cls}${free ? ' is-free' : ''}`,
        'data-day': date,
        'aria-pressed': this.day === date ? 'true' : 'false',
        'aria-label': this.dayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' }),
        disabled: !free,
      },
      text,
    );
    b.addEventListener('click', () => this.pickDay(date));
    return b;
  }

  private move(direction: number) {
    if (this.c.view === 'month') {
      const [y, m] = this.cursor.split('-').map(Number) as [number, number];
      const t = new Date(Date.UTC(y, m - 1 + direction, 1));
      this.cursor = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
    } else {
      this.cursor = addDays(this.cursor, 7 * direction);
      const today = ymd(Date.now(), this.zone);
      if (this.cursor < today) this.cursor = today;
    }
    this.day = null;
    void this.load();
  }

  private pickDay(date: string, focus = true) {
    this.day = date;
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('[data-day]')) {
      b.setAttribute('aria-pressed', b.dataset.day === date ? 'true' : 'false');
    }
    const list = this.byDay().get(date) ?? [];
    const box = this.root.querySelector<HTMLElement>('[data-ag-times]');
    if (!box) return;
    const title = el(
      'p',
      { class: 'ag-times-title', tabIndex: '-1' },
      this.dayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' }),
    );
    const grid = el('div', { class: 'ag-times', role: 'group', 'aria-label': this.s.chooseTime });
    for (const slot of list) {
      const start = Date.parse(slot.start);
      const b = el('button', { type: 'button', class: 'ag-time' }, this.time(start));
      if (this.service && this.service.capacity > 1)
        b.append(
          el('small', {}, slot.left === 1 ? this.s.place! : fill(this.s.places!, { n: slot.left })),
        );
      b.addEventListener('click', () => this.pickSlot(slot));
      grid.append(b);
    }
    box.replaceChildren(title, grid);
    if (focus) title.focus();
  }

  private zoneSwitch(): HTMLElement {
    const p = el(
      'p',
      { class: 'ag-zone' },
      fill(this.s.timesIn!, { zone: this.zone.replace(/_/g, ' ') }),
    );
    const visitor = this.visitorZone;
    if (visitor && visitor !== this.c.timeZone) {
      const mine = this.zone === this.c.timeZone;
      const other = mine ? visitor : this.c.timeZone;
      const label = fill(mine ? this.s.myZone! : this.s.siteZone!, {
        zone: other.replace(/_/g, ' '),
      });
      const b = el('button', { type: 'button', class: 'ag-link' }, label);
      b.addEventListener('click', () => {
        this.zone = other;
        this.day = null;
        this.draw();
      });
      p.append(' · ', b);
    }
    return p;
  }

  private pickSlot(slot: Slot) {
    this.slot = slot;
    this.notice = '';
    this.summary(true);
    if (this.c.token) {
      void this.reschedule();
      return;
    }
    this.show('details');
    this.form?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
  }

  private backToTimes() {
    this.slot = null;
    this.summary(false);
    this.show('time');
  }

  private error(text: string) {
    const box = this.root.querySelector<HTMLElement>('[data-ag-error]');
    if (!box) return;
    box.textContent = text;
    box.hidden = !text;
    if (text) box.focus?.();
  }

  private async post(path: string, body: unknown) {
    const res = await fetch(`${this.c.api}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      // empty
    }
    return { status: res.status, data };
  }

  private async submit() {
    const form = this.form;
    if (!form || !this.service || !this.slot || this.busy) return;
    this.error('');
    let invalid: HTMLElement | null = null;
    for (const input of form.querySelectorAll<HTMLInputElement>('input, select, textarea')) {
      if (input.closest('fieldset[disabled]') || input.name === 'website') continue;
      const ok = input.checkValidity();
      input.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok && !invalid) invalid = input;
    }
    if (invalid) {
      this.error(this.s.invalid!);
      invalid.focus();
      return;
    }
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    this.busy = true;
    button.disabled = true;
    button.textContent = this.s.booking!;
    try {
      await w.cleitextChallenge?.prepare?.(form);
      const values: Record<string, string> = {};
      const fields: Record<string, string> = {};
      for (const [k, v] of new FormData(form)) {
        if (typeof v !== 'string') continue;
        if (k.startsWith('f_'))
          fields[k.slice(2)] = fields[k.slice(2)] ? `${fields[k.slice(2)]}, ${v}` : v;
        else values[k] = v;
      }
      const { status, data } = await this.post('/public/book', {
        ...values,
        fields,
        service: this.service.id,
        start: this.slot.start,
        consent: values.consent === '1',
        locale: this.c.locale,
        timezone: this.visitorZone,
      });
      if (status === 201 || status === 200) {
        this.done(data);
        return;
      }
      w.cleitextChallenge?.reset?.(form);
      if (data.code === 'taken') {
        this.slots = this.slots.filter((s) => s.start !== this.slot?.start);
        this.loaded = { from: '', to: '', service: '' };
        this.backToTimes();
        void this.load();
        this.notice = this.s.taken!;
        this.announce(this.s.taken!);
      } else if (data.code === 'limit') {
        this.limit(typeof data.contact === 'string' ? data.contact : '');
      } else {
        if (data.challenge === true) w.cleitextChallenge?.require?.(form);
        this.error(typeof data.message === 'string' ? data.message : this.s.error!);
        if (Array.isArray(data.fields))
          for (const name of data.fields as string[])
            form
              .querySelector(`[name="${CSS.escape(name)}"]`)
              ?.setAttribute('aria-invalid', 'true');
      }
    } catch {
      this.error(this.s.error!);
    } finally {
      this.busy = false;
      button.disabled = false;
      button.textContent = this.s.book!;
    }
  }

  private done(data: Record<string, unknown>) {
    const pending = data.status === 'pending';
    const step = this.step('done');
    const start = Date.parse(String(data.start ?? this.slot?.start));
    const box = el(
      'div',
      { class: 'ag-done' },
      el('div', { class: 'ag-done-icon', 'aria-hidden': 'true' }, pending ? '…' : '✓'),
      el('h3', {}, pending ? this.s.pendingTitle! : this.s.confirmedTitle!),
      el(
        'p',
        {},
        el('strong', {}, this.service?.name ?? ''),
        el('br'),
        this.fmt(start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        ' · ',
        this.time(start),
      ),
      el(
        'p',
        {},
        fill(pending ? this.s.pendingText! : this.s.confirmedText!, {
          email: String(data.email ?? ''),
        }),
      ),
    );
    const actions = el('div', { class: 'ag-actions' });
    if (!pending && typeof data.icsUrl === 'string')
      actions.append(
        el(
          'a',
          { class: 'ag-button', href: data.icsUrl, download: 'appointment.ics' },
          this.s.addCalendar!,
        ),
      );
    if (!pending && typeof data.googleUrl === 'string')
      actions.append(
        el(
          'a',
          { class: 'ag-button', href: data.googleUrl, target: '_blank', rel: 'noopener' },
          this.s.googleCalendar!,
        ),
      );
    if (typeof data.manageUrl === 'string')
      actions.append(el('a', { class: 'ag-button', href: data.manageUrl }, this.s.manage!));
    if (actions.childNodes.length) box.append(actions);
    step.replaceChildren(box);
    for (const s of this.root.querySelectorAll<HTMLElement>('[data-ag-summary]'))
      s.replaceChildren();
    this.show('done');
    this.form?.reset();
  }

  private async reschedule() {
    if (!this.slot || !this.c.token || this.busy) return;
    this.busy = true;
    try {
      const { status, data } = await this.post('/public/reschedule', {
        token: this.c.token,
        start: this.slot.start,
      });
      if (status === 200) {
        window.location.href =
          typeof data.manageUrl === 'string'
            ? `${data.manageUrl}&done=moved`
            : window.location.href;
        return;
      }
      this.notice = data.code === 'taken' ? this.s.taken! : String(data.message ?? this.s.error);
      this.loaded = { from: '', to: '', service: '' };
      this.slot = null;
      void this.load();
    } catch {
      // The message below.
    } finally {
      this.busy = false;
    }
  }
}

function start() {
  for (const root of document.querySelectorAll<HTMLElement>(`[${MARKER}]`)) {
    if (root.dataset.agReady) continue;
    root.dataset.agReady = '1';
    try {
      new Widget(root);
    } catch (error) {
      console.error('Agenda', error);
    }
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
