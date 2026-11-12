import {
  addMessages,
  Alert,
  api as coreApi,
  Button,
  defineAdminPlugin,
  errorMessage,
  useT,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CADENCES, zonedDay, zonedInstant, type Cadence } from './model/cadence';
import { IT } from './admin/it';

addMessages('it', IT);

type Api = AdminPageProps['api'];

interface Rule {
  id: string;
  name: string;
  cadence: Cadence;
  times: string[];
  startsOn: string;
  producer: string;
  contentType: string;
  locale: string | null;
  autoPublish: boolean;
  withTranslations: boolean;
  enabled: boolean;
}

interface Slot {
  id: string;
  ruleId: string;
  at: string;
  plannedAt: string;
  status: string;
  entryId: string | null;
  error: string | null;
  entry: { id: string; title: string } | null;
}

interface State {
  rules: Rule[];
  slots: Slot[];
  producers: { id: string; label: string; description: string; plugin: string }[];
  supported: boolean;
  timeZone: string;
  locales: string[];
  defaultLocale: string;
}

interface EntryItem {
  id: string;
  title: string;
  status: string;
  type: string;
  scheduledAt: string | null;
  publishedAt: string | null;
}

/** The page's own styles, on the admin's palette (light and dark themes). */
const CSS = `
.pl{max-width:1200px;display:flex;flex-direction:column;gap:1rem;color:var(--color-slate-900,#0f172a)}
.pl h1{font-size:1.5rem;font-weight:700;margin:0}
.pl-muted{color:var(--color-slate-500,#64748b)}
.pl-small{font-size:.8125rem}
.pl-row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.pl-between{justify-content:space-between}
.pl-tabs{display:flex;gap:.25rem;border-bottom:1px solid var(--color-slate-200,#e2e8f0)}
.pl-tab{padding:.5rem .9rem;font-size:.875rem;font-weight:500;color:var(--color-slate-600,#475569);border:0;border-bottom:2px solid transparent;background:none;cursor:pointer}
.pl-tab[aria-selected=true]{color:var(--color-sky-700,#0369a1);border-bottom-color:var(--color-sky-700,#0369a1)}
.pl-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.5rem}
@media (max-width:900px){.pl-week{grid-template-columns:1fr}}
.pl-day{border:1px solid var(--color-slate-200,#e2e8f0);border-radius:.375rem;background:var(--color-white,#fff);padding:.5rem;min-height:8rem;display:flex;flex-direction:column;gap:.4rem}
.pl-day.is-today{border-color:var(--color-sky-600,#0284c7)}
.pl-day h3{margin:0;font-size:.8rem;font-weight:600;text-transform:capitalize;color:var(--color-slate-600,#475569)}
.pl-item{border:1px solid var(--color-slate-200,#e2e8f0);border-left:3px solid var(--color-sky-600,#0284c7);border-radius:.25rem;padding:.35rem .45rem;font-size:.8rem;display:flex;flex-direction:column;gap:.25rem;background:var(--color-slate-50,#f8fafc)}
.pl-item.is-entry{border-left-color:var(--color-emerald-600,#059669)}
.pl-item.is-off{opacity:.55}
.pl-item.is-failed{border-left-color:var(--color-red-600,#dc2626)}
.pl-item a{color:var(--color-sky-700,#0369a1)}
.pl-badge{display:inline-block;font-size:.7rem;font-weight:600;padding:0 .4rem;border-radius:999px;background:var(--color-slate-100,#f1f5f9);color:var(--color-slate-700,#334155)}
.pl-link{background:none;border:0;padding:0;color:var(--color-sky-700,#0369a1);cursor:pointer;font-size:.75rem;text-decoration:underline}
.pl-card{border:1px solid var(--color-slate-200,#e2e8f0);border-radius:.375rem;background:var(--color-white,#fff);padding:1rem;display:flex;flex-direction:column;gap:.6rem}
.pl-card h2{font-size:1rem;font-weight:600;margin:0}
.pl-field{display:flex;flex-direction:column;gap:.25rem;font-size:.875rem}
.pl-field>span{font-weight:500}
.pl-input{border:1px solid var(--color-slate-300,#cbd5e1);border-radius:.25rem;padding:.4rem .55rem;font:inherit;font-size:.875rem;background:var(--color-white,#fff);color:inherit}
.pl-check{display:flex;gap:.45rem;align-items:flex-start;font-size:.875rem}
.pl-check input{margin-top:.2rem}
.pl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));gap:.75rem}
.pl-warn{color:var(--color-amber-700,#b45309)}
`;

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** The Monday of a day's week. */
const mondayOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
};

function PalinsestPage({ api: call }: AdminPageProps) {
  const { t, language } = useT();
  const [tab, setTab] = useState<'calendar' | 'rules'>('calendar');
  const [state, setState] = useState<State | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<EntryItem[]>([]);
  /** The last answer: its time zone places the week asked next. */
  const known = useRef<State | null>(null);

  const zone = state?.timeZone ?? 'UTC';
  const monday = week ?? mondayOf(zonedDay(new Date(), zone));

  const load = useCallback(async () => {
    try {
      // The zone comes with the answer: a first call finds it, then the week is asked in it.
      const first = known.current ?? (await call<State>('GET', '/state'));
      const tz = first.timeZone;
      const start = week ?? mondayOf(zonedDay(new Date(), tz));
      const from = zonedInstant(start, '00:00', tz).toISOString();
      const to = zonedInstant(addDays(start, 7), '00:00', tz).toISOString();
      const next = await call<State>('GET', `/state?from=${from}&to=${to}`);
      known.current = next;
      setState(next);
      const [scheduled, published] = await Promise.all(
        ['scheduled', 'published'].map((status) =>
          coreApi<{ items: EntryItem[] }>('GET', `/entries?status=${status}&limit=100`)
            .then((r) => r.items)
            .catch(() => [] as EntryItem[]),
        ),
      );
      setEntries(
        [...scheduled!, ...published!].filter((e) => {
          const when = Date.parse(e.scheduledAt ?? e.publishedAt ?? '');
          return when >= Date.parse(from) && when < Date.parse(to);
        }),
      );
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [call, week]);

  useEffect(() => {
    void load();
  }, [load]);

  // While a slot is being written, look again every 20 seconds.
  const writing = state?.slots.some((s) => s.status === 'producing');
  useEffect(() => {
    if (!writing) return;
    const timer = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(timer);
  }, [writing, load]);

  return (
    <div className="pl">
      <style>{CSS}</style>
      <header>
        <h1>{t('Editorial calendar')}</h1>
        <p className="pl-muted">
          {t(
            'What comes out on your site and when. Slots come from your rules: you write them by hand, or a service such as Tell me more writes them shortly before their time.',
          )}
        </p>
      </header>
      {state && !state.supported && (
        <Alert>
          {t(
            'This version of Cleitext cannot write or publish from the calendar: update Cleitext to 0.98 or later.',
          )}
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}
      <div role="tablist" className="pl-tabs">
        {(['calendar', 'rules'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="pl-tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {id === 'calendar' ? t('Calendar') : t('Rules')}
          </button>
        ))}
      </div>
      {!state ? (
        <p className="pl-muted">{t('Loading…')}</p>
      ) : tab === 'calendar' ? (
        <Week
          state={state}
          entries={entries}
          monday={monday}
          language={language}
          call={call}
          onWeek={setWeek}
          reload={load}
          onError={setError}
        />
      ) : (
        <Rules state={state} call={call} reload={load} onError={setError} />
      )}
    </div>
  );
}

// ---- Calendar ---------------------------------------------------------------------------

function Week({
  state,
  entries,
  monday,
  language,
  call,
  onWeek,
  reload,
  onError,
}: {
  state: State;
  entries: EntryItem[];
  monday: string;
  language: string;
  call: Api;
  onWeek: (monday: string | null) => void;
  reload: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useT();
  const zone = state.timeZone;
  const today = zonedDay(new Date(), zone);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const rules = new Map(state.rules.map((r) => [r.id, r]));
  const producers = new Map(state.producers.map((p) => [p.id, p.label]));
  const inSlots = new Set(state.slots.map((s) => s.entryId).filter(Boolean));
  const time = (iso: string) =>
    new Intl.DateTimeFormat(language, {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  const dayTitle = (day: string) =>
    new Intl.DateTimeFormat(language, {
      timeZone: 'UTC',
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${day}T12:00:00Z`));

  return (
    <div className="pl" style={{ gap: '.75rem' }}>
      <div className="pl-row pl-between">
        <div className="pl-row">
          <Button variant="secondary" onClick={() => onWeek(addDays(monday, -7))}>
            ← {t('Previous week')}
          </Button>
          <Button variant="secondary" onClick={() => onWeek(null)}>
            {t('This week')}
          </Button>
          <Button variant="secondary" onClick={() => onWeek(addDays(monday, 7))}>
            {t('Next week')} →
          </Button>
        </div>
        <span className="pl-muted pl-small">
          {t('Times in the site’s time zone ({zone}).', { zone })}
        </span>
      </div>
      <div className="pl-week">
        {days.map((day) => {
          const daySlots = state.slots.filter((s) => zonedDay(new Date(s.at), zone) === day);
          const dayEntries = entries.filter(
            (e) =>
              !inSlots.has(e.id) &&
              zonedDay(new Date(e.scheduledAt ?? e.publishedAt ?? 0), zone) === day,
          );
          return (
            <section key={day} className={`pl-day${day === today ? ' is-today' : ''}`}>
              <h3>{dayTitle(day)}</h3>
              {daySlots.length === 0 && dayEntries.length === 0 && (
                <span className="pl-muted pl-small">{t('Nothing this day.')}</span>
              )}
              {daySlots.map((slot) => (
                <SlotItem
                  key={slot.id}
                  slot={slot}
                  rule={rules.get(slot.ruleId)}
                  producerLabel={(id) => producers.get(id) ?? id}
                  time={time(slot.at)}
                  zone={zone}
                  call={call}
                  reload={reload}
                  onError={onError}
                />
              ))}
              {dayEntries.map((entry) => (
                <div key={entry.id} className="pl-item is-entry">
                  <span className="pl-muted">
                    {time(entry.scheduledAt ?? entry.publishedAt!)} ·{' '}
                    {entry.status === 'scheduled' ? t('Scheduled entry') : t('Published entry')}
                  </span>
                  <a href={`/cl-admin/entries/${entry.id}`}>{entry.title || '—'}</a>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function SlotItem({
  slot,
  rule,
  producerLabel,
  time,
  zone,
  call,
  reload,
  onError,
}: {
  slot: Slot;
  rule: Rule | undefined;
  producerLabel: (id: string) => string;
  time: string;
  zone: string;
  call: Api;
  reload: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useT();
  const [moving, setMoving] = useState(false);
  const local = useMemo(() => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(slot.at));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  }, [slot.at, zone]);
  const [value, setValue] = useState(local);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      onError(errorMessage(e));
    }
  };
  const open = ['planned'].includes(slot.status);
  const retry = rule?.producer && ['planned', 'failed', 'empty', 'missed'].includes(slot.status);
  const off = ['skipped', 'missed', 'empty'].includes(slot.status);

  return (
    <div
      className={`pl-item${off ? ' is-off' : ''}${slot.status === 'failed' ? ' is-failed' : ''}`}
    >
      <span>
        <strong>{time}</strong> · {rule?.name ?? '—'}{' '}
        <span className="pl-badge">{t(slot.status)}</span>
      </span>
      <span className="pl-muted">
        {rule?.producer ? producerLabel(rule.producer) : t('By hand')}
      </span>
      {slot.entry && <a href={`/cl-admin/entries/${slot.entry.id}`}>{slot.entry.title || '—'}</a>}
      {slot.error && <span className="pl-warn">{slot.error}</span>}
      {moving ? (
        <span className="pl-row">
          <input
            className="pl-input"
            type="datetime-local"
            aria-label={t('New time')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button
            type="button"
            className="pl-link"
            onClick={() =>
              act(async () => {
                const [day, hm] = value.split('T') as [string, string];
                await call('PATCH', `/slots/${slot.id}`, {
                  at: zonedInstant(day, hm, zone).toISOString(),
                });
                setMoving(false);
              })
            }
          >
            {t('Save')}
          </button>
          <button type="button" className="pl-link" onClick={() => setMoving(false)}>
            {t('Cancel')}
          </button>
        </span>
      ) : (
        <span className="pl-row">
          {open && (
            <button type="button" className="pl-link" onClick={() => setMoving(true)}>
              {t('Move')}
            </button>
          )}
          {open && (
            <button
              type="button"
              className="pl-link"
              onClick={() => act(() => call('PATCH', `/slots/${slot.id}`, { status: 'skipped' }))}
            >
              {t('Remove')}
            </button>
          )}
          {['skipped', 'failed', 'empty', 'missed'].includes(slot.status) && (
            <button
              type="button"
              className="pl-link"
              onClick={() => act(() => call('PATCH', `/slots/${slot.id}`, { status: 'planned' }))}
            >
              {t('Put back')}
            </button>
          )}
          {retry && (
            <button
              type="button"
              className="pl-link"
              onClick={() => act(() => call('POST', `/slots/${slot.id}/produce`, {}))}
            >
              {t('Write it now')}
            </button>
          )}
        </span>
      )}
    </div>
  );
}

// ---- Rules ------------------------------------------------------------------------------

const cadenceLabel = (
  cadence: Cadence,
  t: (text: string, v?: Record<string, string | number>) => string,
) =>
  cadence === 'twice-daily'
    ? t('Twice a day')
    : cadence === 'daily'
      ? t('Once a day')
      : cadence === '7'
        ? t('Every week')
        : t('Every {n} days', { n: cadence });

function Rules({
  state,
  call,
  reload,
  onError,
}: {
  state: State;
  call: Api;
  reload: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const producers = new Map(state.producers.map((p) => [p.id, p.label]));

  if (editing) {
    return (
      <RuleForm
        state={state}
        rule={editing === 'new' ? null : editing}
        call={call}
        onDone={async () => {
          setEditing(null);
          await reload();
        }}
        onError={onError}
      />
    );
  }
  return (
    <div className="pl" style={{ gap: '.75rem' }}>
      <div>
        <Button onClick={() => setEditing('new')}>{t('New rule')}</Button>
      </div>
      {state.rules.length === 0 && (
        <p className="pl-muted">{t('No rules yet: add one to fill the calendar.')}</p>
      )}
      {state.rules.map((rule) => (
        <section key={rule.id} className="pl-card">
          <div className="pl-row pl-between">
            <h2>{rule.name}</h2>
            <div className="pl-row">
              <Button variant="secondary" onClick={() => setEditing(rule)}>
                {t('Edit')}
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (
                    !window.confirm(
                      t('Delete the rule «{name}»? Its slots go; entries already written stay.', {
                        name: rule.name,
                      }),
                    )
                  )
                    return;
                  try {
                    await call('DELETE', `/rules/${rule.id}`);
                    await reload();
                  } catch (e) {
                    onError(errorMessage(e));
                  }
                }}
              >
                {t('Delete')}
              </Button>
            </div>
          </div>
          <span className="pl-muted">
            {cadenceLabel(rule.cadence, t)} · {rule.times.join(', ')} ·{' '}
            {rule.producer ? (producers.get(rule.producer) ?? rule.producer) : t('By hand')} ·{' '}
            {!rule.enabled
              ? t('paused')
              : rule.autoPublish
                ? t('automatic publishing')
                : t('drafts to check')}
          </span>
        </section>
      ))}
    </div>
  );
}

function RuleForm({
  state,
  rule,
  call,
  onDone,
  onError,
}: {
  state: State;
  rule: Rule | null;
  call: Api;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t, language } = useT();
  const today = zonedDay(new Date(), state.timeZone);
  const [form, setForm] = useState({
    name: rule?.name ?? '',
    cadence: rule?.cadence ?? ('daily' as Cadence),
    times: rule?.times ?? ['09:00'],
    startsOn: rule?.startsOn ?? today,
    producer: rule?.producer ?? state.producers[0]?.id ?? '',
    contentType: rule?.contentType ?? 'article',
    locale: rule?.locale ?? '',
    autoPublish: rule?.autoPublish ?? false,
    withTranslations: rule?.withTranslations ?? false,
    enabled: rule?.enabled ?? true,
  });
  const [types, setTypes] = useState<{ slug: string; name: Record<string, string> }[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void coreApi<{ slug: string; name: Record<string, string> }[]>('GET', '/content-types')
      .then(setTypes)
      .catch(() => setTypes([]));
  }, []);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const twice = form.cadence === 'twice-daily';
  const times = twice
    ? [form.times[0] ?? '09:00', form.times[1] ?? '18:00']
    : [form.times[0] ?? '09:00'];
  const languageName = (code: string) => {
    try {
      return new Intl.DisplayNames([language], { type: 'language' }).of(code) ?? code;
    } catch {
      return code;
    }
  };

  return (
    <section className="pl-card">
      <h2>{rule ? t('Edit rule') : t('New rule')}</h2>
      <div className="pl-grid">
        <label className="pl-field">
          <span>{t('Name')}</span>
          <input
            className="pl-input"
            value={form.name}
            maxLength={120}
            placeholder={t('Editorial calendar')}
            onChange={(e) => set('name', e.target.value)}
          />
        </label>
        <label className="pl-field">
          <span>{t('How often')}</span>
          <select
            className="pl-input"
            value={form.cadence}
            onChange={(e) => set('cadence', e.target.value as Cadence)}
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {cadenceLabel(c, t)}
              </option>
            ))}
          </select>
        </label>
        {times.map((value, i) => (
          <label key={i} className="pl-field">
            <span>{t('At')}</span>
            <input
              className="pl-input"
              type="time"
              value={value}
              onChange={(e) => {
                const next = [...times];
                next[i] = e.target.value;
                set('times', next);
              }}
            />
          </label>
        ))}
        {!['daily', 'twice-daily'].includes(form.cadence) && (
          <label className="pl-field">
            <span>{t('From')}</span>
            <input
              className="pl-input"
              type="date"
              value={form.startsOn}
              onChange={(e) => set('startsOn', e.target.value)}
            />
          </label>
        )}
        <label className="pl-field">
          <span>{t('Who writes')}</span>
          <select
            className="pl-input"
            value={form.producer}
            onChange={(e) => set('producer', e.target.value)}
          >
            {state.producers.map((p) => (
              <option key={p.id} value={p.id} title={p.description}>
                {p.label}
              </option>
            ))}
            <option value="">{t('You, by hand (a reminder in the calendar)')}</option>
          </select>
        </label>
        <label className="pl-field">
          <span>{t('Content type')}</span>
          <select
            className="pl-input"
            value={form.contentType}
            onChange={(e) => set('contentType', e.target.value)}
          >
            {(types.length ? types : [{ slug: 'article', name: { en: 'Article' } }]).map((type) => (
              <option key={type.slug} value={type.slug}>
                {type.name[language] ?? type.name.en ?? type.slug}
              </option>
            ))}
          </select>
        </label>
        {state.locales.length > 1 && (
          <label className="pl-field">
            <span>{t('Language')}</span>
            <select
              className="pl-input"
              value={form.locale}
              onChange={(e) => set('locale', e.target.value)}
            >
              <option value="">{t('The site’s')}</option>
              {state.locales.map((code) => (
                <option key={code} value={code}>
                  {languageName(code)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {form.producer && (
        <label className="pl-check">
          <input
            type="checkbox"
            checked={form.autoPublish}
            onChange={(e) => set('autoPublish', e.target.checked)}
          />
          <span>
            {t('Publish automatically at the planned time')}
            <br />
            <span className="pl-muted pl-small">
              {t(
                'Off: each entry stays a draft for you to check and publish. On: it comes out by itself, as you, without anyone reading it first.',
              )}
            </span>
          </span>
        </label>
      )}
      {form.producer && form.autoPublish && state.locales.length > 1 && (
        <label className="pl-check">
          <input
            type="checkbox"
            checked={form.withTranslations}
            onChange={(e) => set('withTranslations', e.target.checked)}
          />
          <span>
            {t('Publish its translations at the same time')}
            <br />
            <span className="pl-muted pl-small">
              {t('The translations already made (Multilingual) come out with the original.')}
            </span>
          </span>
        </label>
      )}
      <label className="pl-check">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => set('enabled', e.target.checked)}
        />
        <span>{t('Active')}</span>
      </label>
      <p className="pl-muted pl-small">
        {t('Entries are written and published as you (the last person who saved the rule).')}
      </p>
      <div className="pl-row">
        <Button
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              const payload = { ...form, times, name: form.name.trim() || t('Editorial calendar') };
              if (rule) await call('PUT', `/rules/${rule.id}`, payload);
              else await call('POST', '/rules', payload);
              await onDone();
            } catch (e) {
              onError(errorMessage(e));
            } finally {
              setSaving(false);
            }
          }}
        >
          {t('Save')}
        </Button>
        <Button variant="secondary" onClick={() => void onDone()}>
          {t('Cancel')}
        </Button>
      </div>
    </section>
  );
}

const ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18M8 14h3M8 17h6"/></svg>';

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Editorial calendar', it: 'Calendario editoriale' },
      parent: '/posts',
      capability: 'manage_palinsest',
      component: PalinsestPage,
      icon: ICON,
    },
  ],
});
