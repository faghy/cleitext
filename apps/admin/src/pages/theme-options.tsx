import { DeviceContext, FieldsForm, ZonesBuilder } from '@cleitext/admin-sdk';
import {
  fieldDefaults,
  fieldVisible,
  labelText,
  type FieldDefinition,
  type ThemeView,
  type ZoneDevice,
  type ZonesField,
  type ZonesValue,
} from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, useT } from '../components/ui';

interface ActiveTheme {
  theme?: ThemeView;
  values: Record<string, unknown>;
}

const ACTIVE_KEY = ['themes', 'active'];
/** Fields without a section, when the theme has sections. */
const OTHER = '__other';

/** Widths of the preview per device, as in the themes' breakpoints. */
const DEVICES = { desktop: '100%', tablet: '768px', mobile: '390px' } as const;
type PreviewDevice = keyof typeof DEVICES;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Appearance → Customize: the theme's options, one tab per section (left),
 * with search, ready-made styles, import/export and reset, and a live
 * preview of the site beside them.
 */
export function ThemeOptions() {
  const { t } = useT();
  const me = useMe();
  const locale = me.user.locale;
  const queryClient = useQueryClient();
  const active = useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: () => api<ActiveTheme>('GET', '/themes/active'),
  });
  const theme = active.data?.theme;
  const fields = useMemo(() => theme?.settings ?? [], [theme]);
  const defaults = useMemo(() => fieldDefaults(fields), [fields]);
  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const saved = useRef<Record<string, unknown>>({});
  useEffect(() => {
    if (active.data && values === null) {
      setValues(active.data.values);
      saved.current = active.data.values;
    }
  }, [active.data, values]);

  const sections = useMemo(() => {
    const declared = theme?.settingsSections ?? [];
    const known = new Set(declared.map((s) => s.id));
    const rest = fields.some((f) => !f.section || !known.has(f.section));
    return [
      ...declared.filter((s) => fields.some((f) => f.section === s.id)),
      ...(rest || declared.length === 0
        ? [{ id: OTHER, label: declared.length ? t('Other') : t('Settings') }]
        : []),
    ];
  }, [theme, fields, t]);
  const sectionOf = (field: FieldDefinition) =>
    field.section && sections.some((s) => s.id === field.section) ? field.section : OTHER;
  const [current, setCurrent] = useState<string | null>(null);
  const section = current ?? sections[0]?.id ?? OTHER;
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const shown = (
    query
      ? fields.filter((f) =>
          `${labelText(f.label, locale)} ${labelText(f.help, locale)} ${labelText(f.group, locale)}`
            .toLowerCase()
            .includes(query),
        )
      : fields.filter((f) => sectionOf(f) === section)
  ).filter((f) => f.type !== 'zones');
  const open = (id: string) => {
    setCurrent(id);
    setSearch('');
  };

  // Builders (header, footer): shown under the preview while their section,
  // or the section of one of their rows or elements, is open.
  const parentOf = (id: string) => theme?.settingsSections.find((s) => s.id === id)?.parent;
  const builder = fields.find(
    (f): f is ZonesField =>
      f.type === 'zones' &&
      !query &&
      [section, parentOf(section)].some(
        (id) =>
          id !== undefined &&
          (f.section === id ||
            f.items.some((i) => i.section === id) ||
            f.rows.some((r) => r.section === id)),
      ),
  );
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  const changedIn = (id: string) =>
    values !== null &&
    fields.some((f) => sectionOf(f) === id && !same(values[f.name], saved.current[f.name]));
  const dirty = values !== null && fields.some((f) => !same(values[f.name], saved.current[f.name]));
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The preview follows the options, a moment after the last change.
  const [preview, setPreview] = useState(true);
  const [html, setHtml] = useState('');
  const [path, setPath] = useState('/');
  const frame = useRef<HTMLIFrameElement>(null);
  // The preview's pencils open a section; its links change the page shown.
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: string; section?: unknown; path?: unknown };
      if (data?.type === 'cleitext:customize' && typeof data.section === 'string') {
        setCurrent(data.section);
        setSearch('');
      } else if (data?.type === 'cleitext:navigate' && typeof data.path === 'string') {
        setPath(data.path);
      }
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);
  useEffect(() => {
    if (!values || !preview) return;
    const timer = setTimeout(() => {
      void api<string>('POST', '/themes/active/preview', { path, values }, { text: true })
        .then((page) => setHtml(page))
        .catch(() => setHtml(''));
    }, 400);
    return () => clearTimeout(timer);
  }, [values, path, preview]);

  const save = useMutation({
    mutationFn: () =>
      api<Record<string, unknown>>('PUT', '/themes/active/settings', { values: values ?? {} }),
    onSuccess: (result) => {
      saved.current = result;
      setValues(result);
      queryClient.setQueryData<ActiveTheme>(ACTIVE_KEY, (data) =>
        data ? { ...data, values: result } : data,
      );
    },
  });

  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const exportValues = () => {
    if (!theme || !values) return;
    const blob = new Blob(
      [JSON.stringify({ theme: theme.slug, version: theme.version, values }, null, 2)],
      { type: 'application/json' },
    );
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${theme.slug}-options.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const importValues = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as { theme?: string; values?: unknown };
      if (!data.values || typeof data.values !== 'object') throw new Error('no values');
      const known = new Set(fields.map((f) => f.name));
      const picked = Object.fromEntries(
        Object.entries(data.values as Record<string, unknown>).filter(([k]) => known.has(k)),
      );
      setValues((v) => ({ ...(v ?? {}), ...picked }));
      setNotice(
        data.theme && data.theme !== theme?.slug
          ? t('Options of another theme ({theme}): only those with the same name were taken.', {
              theme: data.theme,
            })
          : t('Options imported: check them, then publish.'),
      );
    } catch {
      setNotice(t('This file does not hold theme options.'));
    }
  };
  const resetSection = () => {
    if (!values) return;
    const names = new Set(fields.filter((f) => sectionOf(f) === section).map((f) => f.name));
    setValues(Object.fromEntries(Object.entries(values).filter(([k]) => !names.has(k))));
  };
  const presets = theme?.presets ?? [];

  if (active.error) return <Alert>{errorMessage(active.error)}</Alert>;
  if (!theme || values === null) return <p className="text-sm text-slate-600">{t('Loading…')}</p>;
  if (fields.length === 0) {
    return <p className="text-sm text-slate-600">{t('This theme has no settings.')}</p>;
  }
  const sectionInfo = sections.find((s) => s.id === section);
  const visibleCount = shown.filter((f) => fieldVisible(f, values, defaults)).length;

  return (
    <DeviceContext.Provider value={{ device, setDevice }}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-semibold text-slate-900">
            {t('{name} options', { name: theme.name })}
          </h2>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search options')}
            aria-label={t('Search options')}
            className="w-52 rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          {presets.length > 0 && (
            <select
              aria-label={t('Ready-made styles')}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value=""
              onChange={(e) => {
                const preset = presets.find((p) => p.id === e.target.value);
                if (preset) {
                  setValues((v) => ({ ...(v ?? {}), ...preset.values }));
                  setNotice(t('Style applied: check it, then publish.'));
                }
              }}
            >
              <option value="">{t('Ready-made styles…')}</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {labelText(p.label, locale)}
                </option>
              ))}
            </select>
          )}
          <Button variant="secondary" onClick={exportValues}>
            {t('Export')}
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            {t('Import')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importValues(file);
              e.target.value = '';
            }}
          />
          <Button variant="secondary" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? t('Hide preview') : t('Show preview')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty}>
            {save.isPending ? t('Publishing…') : t('Publish')}
          </Button>
        </div>
        {notice && (
          <Alert kind="success">
            <span className="flex items-start justify-between gap-3">
              {notice}
              <button
                type="button"
                aria-label={t('Close')}
                className="shrink-0"
                onClick={() => setNotice(null)}
              >
                ×
              </button>
            </span>
          </Alert>
        )}
        {save.error && <Alert>{errorMessage(save.error)}</Alert>}
        {save.isSuccess && !dirty && <Alert kind="success">{t('Published.')}</Alert>}

        <div
          className={`grid gap-4 ${preview ? 'xl:grid-cols-[13rem_minmax(0,30rem)_minmax(0,1fr)]' : 'md:grid-cols-[13rem_minmax(0,46rem)]'}`}
        >
          <nav aria-label={t('Sections')} className="space-y-0.5">
            {sections
              .filter((s) => {
                const parent = 'parent' in s ? s.parent : undefined;
                return !parent || parent === section || parent === parentOf(section);
              })
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-current={!query && s.id === section ? 'page' : undefined}
                  onClick={() => open(s.id)}
                  className={`flex w-full items-center justify-between rounded py-2 pr-3 text-left text-sm ${
                    'parent' in s && s.parent ? 'pl-6' : 'pl-3'
                  } ${
                    !query && s.id === section
                      ? 'bg-slate-900 font-medium text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{labelText(s.label, locale)}</span>
                  {changedIn(s.id) && (
                    <>
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full bg-amber-500"
                        title={t('Not published yet')}
                      />
                      <span className="sr-only">{t('(changed)')}</span>
                    </>
                  )}
                </button>
              ))}
          </nav>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {query
                    ? t('Results for "{query}"', { query: search.trim() })
                    : labelText(sectionInfo?.label, locale)}
                </h3>
                {!query &&
                  sectionInfo &&
                  'description' in sectionInfo &&
                  sectionInfo.description && (
                    <p className="mt-1 text-sm text-slate-600">
                      {labelText(sectionInfo.description, locale)}
                    </p>
                  )}
              </div>
              {!query && (
                <button
                  type="button"
                  className="shrink-0 text-xs text-slate-600 hover:underline"
                  onClick={resetSection}
                >
                  {t('Reset this section')}
                </button>
              )}
            </div>
            {visibleCount === 0 ? (
              <p className="text-sm text-slate-600">
                {query
                  ? t('No option matches.')
                  : t('No option to show here with the current choices.')}
              </p>
            ) : (
              <FieldsForm
                fields={shown}
                values={values}
                defaults={defaults}
                onChange={setValues}
                locale={locale}
              />
            )}
          </section>

          {preview && (
            <div className="space-y-2 xl:sticky xl:top-4 xl:self-start">
              <div className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <span className="font-medium">{t('Preview of')}</span>
                  <input
                    className="flex-1 rounded border border-slate-300 px-2 py-1"
                    value={path}
                    onChange={(e) =>
                      setPath(
                        e.target.value.startsWith('/') ? e.target.value : `/${e.target.value}`,
                      )
                    }
                  />
                </label>
                <div role="group" aria-label={t('Device')} className="flex rounded border">
                  {(Object.keys(DEVICES) as PreviewDevice[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={d === device}
                      className={`px-2 py-1 text-xs ${d === device ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                      onClick={() => setDevice(d)}
                    >
                      {d === 'desktop' ? t('Desktop') : d === 'tablet' ? t('Tablet') : t('Mobile')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-center rounded border border-slate-200 bg-slate-100">
                <iframe
                  ref={frame}
                  title={t('Site preview')}
                  // Scripts run (sticky header, sliders) in an origin of their own: no access to the admin.
                  sandbox="allow-scripts"
                  srcDoc={html}
                  style={{ width: DEVICES[device] }}
                  className={`bg-white ${builder ? 'h-[55vh]' : 'h-[75vh]'}`}
                />
              </div>
            </div>
          )}
        </div>

        {builder && (
          <section
            aria-label={labelText(builder.label, locale)}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              <button
                type="button"
                className="hover:underline"
                onClick={() => builder.section && open(builder.section)}
              >
                {labelText(builder.label, locale)}
              </button>
            </h3>
            <ZonesBuilder
              field={builder}
              value={(values[builder.name] ?? defaults[builder.name] ?? {}) as ZonesValue}
              values={{ ...defaults, ...values }}
              onChange={(next) => setValues((v) => ({ ...(v ?? {}), [builder.name]: next }))}
              locale={locale}
              device={device === 'desktop' ? 'desktop' : 'mobile'}
              onDevice={(d: ZoneDevice) =>
                setDevice((now) =>
                  d === 'desktop' ? 'desktop' : now === 'desktop' ? 'mobile' : now,
                )
              }
              onOpen={open}
              active={section}
            />
          </section>
        )}
      </div>
    </DeviceContext.Provider>
  );
}
