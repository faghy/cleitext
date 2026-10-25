import { CodeEditor, DeviceContext, FieldsForm, ZonesBuilder } from '@cleitext/admin-sdk';
import {
  additionalCssProblem,
  fieldDefaults,
  fieldVisible,
  labelText,
  type AdditionalCssView,
  type FieldDefinition,
  type ThemeView,
  type ZonesField,
  type ZonesValue,
} from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { useT } from '../components/ui';

interface ActiveTheme {
  theme?: ThemeView;
  values: Record<string, unknown>;
}

type Section = ThemeView['settingsSections'][number];

const ACTIVE_KEY = ['themes', 'active'];
const CSS_KEY = ['themes', 'additional-css'];
/** Fields without a section, when the theme has sections. */
const OTHER = '__other';
/** Additional CSS (core 0.79): a section of every theme's Customize. */
const CSS_SECTION = '__additional_css';

interface CssValues {
  site: string;
  theme: string;
}

/** Widths of the preview per device (as the classic customizer draws them). */
const DEVICES = { desktop: 0, tablet: 720, mobile: 320 } as const;
type PreviewDevice = keyof typeof DEVICES;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Appearance → Customize, full screen like a classic site customizer: a
 * 300-pixel panel on the left (sections opened one inside the other, with
 * General/Design tabs, Publish on top and the devices at the bottom) and
 * the live preview on the right, with the header or footer builder below
 * it while one of their sections is open.
 */
export function ThemeOptions({ onClose }: { onClose?: () => void }) {
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
  // Additional CSS: the site's, kept apart from the theme's settings.
  const cssQuery = useQuery({
    queryKey: CSS_KEY,
    queryFn: () => api<AdditionalCssView>('GET', '/themes/additional-css'),
  });
  const [css, setCss] = useState<CssValues | null>(null);
  const savedCss = useRef<CssValues>({ site: '', theme: '' });
  useEffect(() => {
    if (cssQuery.data && css === null) {
      const loaded = { site: cssQuery.data.site, theme: cssQuery.data.theme };
      setCss(loaded);
      savedCss.current = loaded;
    }
  }, [cssQuery.data, css]);
  const cssProblem = css
    ? (additionalCssProblem(css.site) ?? additionalCssProblem(css.theme))
    : null;

  const sections = useMemo<Section[]>(() => {
    const declared = theme?.settingsSections ?? [];
    const known = new Set(declared.map((s) => s.id));
    const rest = fields.some((f) => !f.section || !known.has(f.section));
    return [
      // A section with fields, or one grouping sections that have some (a panel).
      ...declared.filter(function used(s): boolean {
        return (
          fields.some((f) => f.section === s.id) ||
          declared.some((child) => child.parent === s.id && used(child))
        );
      }),
      ...((rest || declared.length === 0) && fields.length > 0
        ? [{ id: OTHER, label: declared.length ? t('Other') : t('Settings') }]
        : []),
      { id: CSS_SECTION, label: t('Additional CSS') },
    ];
  }, [theme, fields, t]);
  const sectionOf = (field: FieldDefinition) =>
    field.section && sections.some((s) => s.id === field.section) ? field.section : OTHER;
  const top = sections.filter((s) => !s.parent);
  // A theme with one section opens on it (Additional CSS is linked below its fields).
  const themeTop = top.filter((s) => s.id !== CSS_SECTION);
  const home = themeTop.length === 1 ? themeTop[0]!.id : top.length === 1 ? top[0]!.id : null;
  const [current, setCurrent] = useState<string | null>(null);
  const section = current ?? home;
  const info = sections.find((s) => s.id === section);
  const parentOf = (id: string | null | undefined) =>
    id ? sections.find((s) => s.id === id)?.parent : undefined;
  const childrenOf = (id: string) => sections.filter((s) => s.parent === id);
  const [tab, setTab] = useState<string | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const query = (search ?? '').trim().toLowerCase();
  const open = (id: string | null) => {
    setCurrent(id);
    setSearch(null);
    setTab(null);
  };

  // Builders (header, footer): under the preview while their section, or
  // the section of one of their rows or elements, is open.
  const builder = fields.find(
    (f): f is ZonesField =>
      f.type === 'zones' &&
      !query &&
      [section, parentOf(section)].some(
        (id) =>
          id != null &&
          (f.section === id ||
            f.items.some((i) => i.section === id) ||
            f.rows.some((r) => r.section === id)),
      ),
  );
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [controls, setControls] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(true);

  const settingsDirty =
    values !== null && fields.some((f) => !same(values[f.name], saved.current[f.name]));
  const cssDirty = css !== null && !same(css, savedCss.current);
  const dirty = settingsDirty || cssDirty;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The preview follows the options, a moment after the last change.
  const [frameUrl, setFrameUrl] = useState('');
  const [path, setPath] = useState('/');
  const frame = useRef<HTMLIFrameElement>(null);
  // The preview's pencils open a section; its links change the page shown.
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: string; section?: unknown; path?: unknown };
      if (data?.type === 'cleitext:customize' && typeof data.section === 'string') {
        if (sections.some((s) => s.id === data.section)) open(data.section);
      } else if (data?.type === 'cleitext:navigate' && typeof data.path === 'string') {
        setPath(data.path);
      }
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [sections]);
  useEffect(() => {
    if (!values) return;
    const timer = setTimeout(() => {
      // Kept at an address of its own, so that the theme's scripts run in it.
      void api<{ url: string }>('POST', '/themes/active/preview', {
        path,
        values,
        frame: true,
        // The CSS being written, while it can be printed.
        ...(css && !cssProblem ? { additionalCss: css } : {}),
      })
        .then((page) => setFrameUrl(page.url))
        .catch(() => setFrameUrl(''));
    }, 400);
    return () => clearTimeout(timer);
  }, [values, path, css, cssProblem]);

  const save = useMutation({
    mutationFn: async () => {
      if (cssProblem) throw new Error(cssProblem);
      const result = settingsDirty
        ? await api<Record<string, unknown>>('PUT', '/themes/active/settings', {
            values: values ?? {},
          })
        : (values ?? {});
      const cssResult =
        cssDirty && css ? await api<AdditionalCssView>('PUT', '/themes/additional-css', css) : null;
      return { result, cssResult };
    },
    onSuccess: ({ result, cssResult }) => {
      saved.current = result;
      setValues(result);
      queryClient.setQueryData<ActiveTheme>(ACTIVE_KEY, (data) =>
        data ? { ...data, values: result } : data,
      );
      if (cssResult) {
        const next = { site: cssResult.site, theme: cssResult.theme };
        savedCss.current = next;
        setCss(next);
        queryClient.setQueryData(CSS_KEY, cssResult);
      }
    },
  });

  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
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
    const text = await file.text();
    let data: { theme?: string; values?: unknown } | string;
    try {
      data = JSON.parse(text) as { theme?: string; values?: unknown };
    } catch {
      // Not JSON (e.g. another system's serialized export): the theme may read the text.
      data = text;
    }
    // Not a Cleitext export: the theme may know the format (settings of another system).
    if (
      typeof data === 'string' ||
      !data.values ||
      typeof data.values !== 'object' ||
      !data.theme
    ) {
      try {
        const result = await api<{ values: Record<string, unknown>; skipped: number }>(
          'POST',
          '/themes/active/import',
          { data },
        );
        setValues((v) => ({ ...(v ?? {}), ...result.values }));
        setNotice(
          t('{count} settings imported: check them, then publish.', {
            count: Object.keys(result.values).length,
          }),
        );
      } catch (error) {
        setNotice(errorMessage(error));
      }
      return;
    }
    try {
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
    if (section === CSS_SECTION) {
      setCss({ site: '', theme: '' });
      return;
    }
    if (!values || !section) return;
    const names = new Set(fields.filter((f) => sectionOf(f) === section).map((f) => f.name));
    setValues(Object.fromEntries(Object.entries(values).filter(([k]) => !names.has(k))));
  };
  const presets = theme?.presets ?? [];

  const close = () => {
    if (dirty && !window.confirm(t('The changes you made will be lost if you leave this page.')))
      return;
    onClose?.();
  };

  const shell = (body: ReactNode) => (
    <div className="fixed inset-0 z-50 flex bg-white text-slate-800">{body}</div>
  );
  if (active.error)
    return shell(<p className="m-6 text-sm text-red-700">{errorMessage(active.error)}</p>);
  if (!theme || values === null || css === null)
    return shell(
      <p className="m-6 text-sm text-slate-600">
        {cssQuery.error ? errorMessage(cssQuery.error) : t('Loading…')}
      </p>,
    );

  // Sections with tabs (General, Design): the fields of the open one; untabbed ones in the first.
  const tabs = !query && info?.tabs ? info.tabs : [];
  const openTab = tabs.find((x) => x.id === tab)?.id ?? tabs[0]?.id;
  const inSection = (
    query
      ? fields.filter((f) =>
          `${labelText(f.label, locale)} ${labelText(f.help, locale)} ${labelText(f.group, locale)}`
            .toLowerCase()
            .includes(query),
        )
      : section
        ? fields.filter((f) => sectionOf(f) === section)
        : []
  ).filter((f) => f.type !== 'zones' && !f.hidden);
  const shown = tabs.length
    ? inSection.filter((f) => (f.tab ?? tabs[0]!.id) === openTab)
    : inSection;
  const visibleCount = shown.filter((f) => fieldVisible(f, values, defaults)).length;
  const firstTab = !tabs.length || openTab === tabs[0]!.id;

  // A builder's own section lists, in its first tab, the elements in use and its other sections.
  const own = builder && section === builder.section;
  const usedItems = own
    ? builder.items.filter((item) => {
        const layout = (values[builder.name] ?? defaults[builder.name] ?? {}) as ZonesValue;
        // The elements of the device shown, as the builder below.
        const rowsOfDevice = layout[device === 'desktop' ? 'desktop' : 'mobile'];
        return [rowsOfDevice].some((rows) =>
          Object.values(rows ?? {}).some((zones) =>
            Object.values(zones).some((list) => list.includes(item.name)),
          ),
        );
      })
    : [];
  const builderSections = new Set(
    builder ? [...builder.items.map((i) => i.section), ...builder.rows.map((r) => r.section)] : [],
  );
  const otherChildren =
    own && section ? childrenOf(section).filter((s) => !builderSections.has(s.id)) : [];
  const childList = section && !own && visibleCount === 0 ? childrenOf(section) : [];

  const parentId = parentOf(section);
  const crumbs = [parentId && sections.find((s) => s.id === parentId)].filter(Boolean) as Section[];

  return (
    <DeviceContext.Provider value={{ device, setDevice: (d) => setDevice(d as PreviewDevice) }}>
      {shell(
        <>
          {controls && (
            <aside
              aria-label={t('Customize')}
              className="flex w-[300px] shrink-0 flex-col border-r border-slate-300 bg-[#f0f0f1]"
            >
              {/* Top bar: close, more actions, publish. */}
              <div className="flex h-[45px] shrink-0 items-stretch border-b border-slate-300 bg-[#f0f0f1]">
                <button
                  type="button"
                  aria-label={t('Close customizer')}
                  title={t('Close customizer')}
                  onClick={close}
                  className="w-[45px] border-r border-slate-300 text-xl text-slate-700 hover:bg-white"
                >
                  ×
                </button>
                <div className="relative">
                  <button
                    type="button"
                    aria-label={t('More actions')}
                    aria-expanded={menu}
                    onClick={() => setMenu((m) => !m)}
                    className="h-full w-[45px] border-r border-slate-300 text-slate-700 hover:bg-white"
                  >
                    ⋯
                  </button>
                  {menu && (
                    <div
                      role="menu"
                      className="absolute left-0 top-full z-20 mt-1 w-56 rounded border border-slate-200 bg-white py-1 text-sm shadow-lg"
                      onMouseLeave={() => setMenu(false)}
                    >
                      <MenuItem
                        onClick={() => {
                          setSearch('');
                          setMenu(false);
                        }}
                      >
                        {t('Search options')}
                      </MenuItem>
                      {presets.length > 0 && (
                        <div className="border-y border-slate-100 py-1">
                          <p className="px-3 py-1 text-xs uppercase tracking-wide text-slate-500">
                            {t('Ready-made styles')}
                          </p>
                          {presets.map((p) => (
                            <MenuItem
                              key={p.id}
                              onClick={() => {
                                setValues((v) => ({ ...(v ?? {}), ...p.values }));
                                setNotice(t('Style applied: check it, then publish.'));
                                setMenu(false);
                              }}
                            >
                              {labelText(p.label, locale)}
                            </MenuItem>
                          ))}
                        </div>
                      )}
                      <MenuItem
                        onClick={() => {
                          exportValues();
                          setMenu(false);
                        }}
                      >
                        {t('Export')}
                      </MenuItem>
                      <MenuItem
                        onClick={() => {
                          fileRef.current?.click();
                          setMenu(false);
                        }}
                      >
                        {t('Import')}
                      </MenuItem>
                      {section && (
                        <MenuItem
                          onClick={() => {
                            resetSection();
                            setMenu(false);
                          }}
                        >
                          {t('Reset this section')}
                        </MenuItem>
                      )}
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json,.dat,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importValues(file);
                    e.target.value = '';
                  }}
                />
                <div className="ml-auto flex items-center pr-2">
                  <button
                    type="button"
                    onClick={() => save.mutate()}
                    disabled={save.isPending || !dirty}
                    className={`rounded px-3 py-1.5 text-sm ${
                      dirty
                        ? 'bg-[#2271b1] text-white hover:bg-[#135e96]'
                        : 'cursor-default bg-slate-200 text-slate-500'
                    }`}
                  >
                    {save.isPending ? t('Publishing…') : dirty ? t('Publish') : t('Published')}
                  </button>
                </div>
              </div>

              {/* Notices. */}
              {(notice || save.error || (save.isSuccess && !dirty)) && (
                <div
                  role="status"
                  className={`flex items-start gap-2 border-b px-4 py-2 text-sm ${
                    save.error
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  }`}
                >
                  <span className="flex-1">
                    {save.error ? errorMessage(save.error) : (notice ?? t('Published.'))}
                  </span>
                  <button
                    type="button"
                    aria-label={t('Close')}
                    onClick={() => {
                      setNotice(null);
                      save.reset();
                    }}
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Where we are. */}
              <div className="flex shrink-0 border-b border-slate-300 bg-white">
                {(section || search !== null) && section !== home ? (
                  <button
                    type="button"
                    aria-label={t('Back')}
                    onClick={() => (search !== null ? setSearch(null) : open(parentId ?? null))}
                    className="w-[48px] shrink-0 border-r border-slate-200 text-xl text-slate-600 hover:border-l-4 hover:border-l-[#2271b1] hover:text-[#2271b1]"
                  >
                    ‹
                  </button>
                ) : null}
                <div className="min-w-0 px-3 py-2.5">
                  <p className="truncate text-xs text-slate-500">
                    {search !== null
                      ? t('Search options')
                      : section
                        ? [t('Customizing'), ...crumbs.map((c) => labelText(c.label, locale))].join(
                            ' ▸ ',
                          )
                        : t('You are customizing')}
                  </p>
                  <h2 className="truncate text-xl font-light text-slate-700">
                    {search !== null
                      ? t('Results')
                      : section
                        ? labelText(info?.label, locale)
                        : (me.site?.name ?? theme.name)}
                  </h2>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-white">
                {search !== null && (
                  <div className="border-b border-slate-200 p-3">
                    <input
                      type="search"
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t('Search options')}
                      aria-label={t('Search options')}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                )}

                {/* The list of sections. */}
                {search === null && !section && (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 text-sm">
                      <span>
                        <span className="block text-xs text-slate-500">{t('Active theme')}</span>
                        <span className="font-semibold">{theme.name}</span>
                      </span>
                    </div>
                    <SectionList items={top} locale={locale} onOpen={open} />
                  </>
                )}

                {search === null && section && tabs.length > 1 && (
                  <div role="tablist" className="flex bg-[#f0f0f1] px-2.5 pt-2.5">
                    {tabs.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={item.id === openTab}
                        onClick={() => setTab(item.id)}
                        className={`flex-1 py-3.5 text-xs uppercase tracking-[0.15em] ${
                          item.id === openTab
                            ? 'bg-white text-slate-700'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        {labelText(item.label, locale)}
                      </button>
                    ))}
                  </div>
                )}

                {(search !== null || section) && (
                  <div className="py-2">
                    {info?.description && !query && firstTab && (
                      <p className="px-6 pb-2 pt-2 text-sm text-slate-600">
                        {labelText(info.description, locale)}
                      </p>
                    )}
                    {section === CSS_SECTION && !query && (
                      <AdditionalCssPanel
                        css={css}
                        onChange={setCss}
                        problem={cssProblem}
                        themeName={theme.name}
                        max={cssQuery.data?.max ?? 100_000}
                        locale={locale}
                      />
                    )}
                    {visibleCount > 0 && (
                      <FieldsForm
                        fields={shown}
                        values={values}
                        defaults={defaults}
                        onChange={setValues}
                        locale={locale}
                        appearance="customizer"
                      />
                    )}
                    {own && firstTab && (
                      <>
                        {usedItems.length > 0 && (
                          <BoxedLinks
                            items={usedItems
                              .filter((i) => i.section)
                              .map((i) => ({ id: i.section!, label: i.label }))}
                            locale={locale}
                            onOpen={open}
                          />
                        )}
                        {otherChildren.length > 0 && (
                          <BoxedLinks
                            heading={t('More')}
                            items={otherChildren}
                            locale={locale}
                            onOpen={open}
                          />
                        )}
                      </>
                    )}
                    {childList.length > 0 && (
                      <SectionList items={childList} locale={locale} onOpen={open} />
                    )}
                    {search === null && section === home && home !== CSS_SECTION && (
                      <SectionList
                        items={sections.filter((s) => s.id === CSS_SECTION)}
                        locale={locale}
                        onOpen={open}
                      />
                    )}
                    {visibleCount === 0 &&
                      !own &&
                      childList.length === 0 &&
                      section !== CSS_SECTION && (
                        <p className="px-6 py-3 text-sm text-slate-600">
                          {query
                            ? t('No option matches.')
                            : t('No option to show here with the current choices.')}
                        </p>
                      )}
                  </div>
                )}
              </div>

              {/* Bottom: hide the panel, devices. */}
              <div className="flex h-[45px] shrink-0 items-stretch border-t border-slate-300 bg-[#f0f0f1] text-xs">
                <button
                  type="button"
                  onClick={() => setControls(false)}
                  className="flex items-center gap-2 px-3 text-slate-600 hover:text-[#2271b1]"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-600 text-white"
                  >
                    ‹
                  </span>
                  {t('Hide controls')}
                </button>
                <DeviceButtons device={device} setDevice={setDevice} />
              </div>
            </aside>
          )}
          {!controls && (
            <button
              type="button"
              onClick={() => setControls(true)}
              aria-label={t('Show controls')}
              className="absolute bottom-2 left-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-white shadow"
            >
              ›
            </button>
          )}

          {/* The preview, and the builder below it. */}
          <main className="flex min-w-0 flex-1 flex-col">
            <div
              className={`relative min-h-0 flex-1 overflow-auto ${
                device === 'desktop' ? 'bg-white' : 'bg-[#1d2327]'
              }`}
            >
              <iframe
                ref={frame}
                title={t('Site preview')}
                // Scripts run (sticky header, sliders) in an origin of their own: no access to the admin.
                sandbox="allow-scripts"
                src={frameUrl || 'about:blank'}
                className={`block bg-white ${device === 'desktop' ? 'h-full w-full' : 'mx-auto mt-10 h-[calc(100%-5rem)] shadow-2xl'}`}
                style={device === 'desktop' ? undefined : { width: DEVICES[device] }}
              />
            </div>
            {builder && (
              <section
                aria-label={labelText(builder.label, locale)}
                className="shrink-0 border-t border-slate-300 bg-[#eeeeee]"
              >
                {builderOpen && (
                  <div className="max-h-[45vh] overflow-y-auto px-[30px] py-6">
                    <ZonesBuilder
                      field={builder}
                      value={(values[builder.name] ?? defaults[builder.name] ?? {}) as ZonesValue}
                      values={{ ...defaults, ...values }}
                      onChange={(next) =>
                        setValues((v) => ({ ...(v ?? {}), [builder.name]: next }))
                      }
                      locale={locale}
                      device={device === 'desktop' ? 'desktop' : 'mobile'}
                      onOpen={open}
                      active={section ?? undefined}
                    />
                  </div>
                )}
                <div className="flex h-[45px] items-stretch justify-end border-t border-slate-300 bg-white text-sm">
                  {builder.section && (
                    <button
                      type="button"
                      aria-label={t('Settings of {row}', { row: labelText(builder.label, locale) })}
                      title={t('Settings of {row}', { row: labelText(builder.label, locale) })}
                      onClick={() => open(builder.section!)}
                      className="w-[45px] border-l border-slate-200 text-slate-600 hover:text-[#2271b1]"
                    >
                      ⚙
                    </button>
                  )}
                  <button
                    type="button"
                    aria-expanded={builderOpen}
                    onClick={() => setBuilderOpen((o) => !o)}
                    className="flex items-center gap-2 border-l border-slate-200 px-5 font-semibold text-slate-700 hover:text-[#2271b1]"
                  >
                    <span aria-hidden="true">{builderOpen ? '⌄' : '⌃'}</span>
                    {builderOpen ? t('Hide builder') : t('Show builder')}
                  </button>
                </div>
              </section>
            )}
          </main>
        </>,
      )}
    </DeviceContext.Provider>
  );
}

/**
 * Additional CSS (core 0.79), as WordPress's: kept by the site, not by the
 * theme, so updates and theme switches never lose it. Printed after the
 * theme's CSS (and a child theme's); the preview shows it while typing.
 */
function AdditionalCssPanel({
  css,
  onChange,
  problem,
  themeName,
  max,
  locale,
}: {
  css: CssValues;
  onChange: (css: CssValues) => void;
  problem: string | null;
  themeName: string;
  max: number;
  locale: string;
}) {
  const { t } = useT();
  const parts = [
    {
      name: 'site' as const,
      label: t('CSS for every theme'),
      help: t(
        'Added to every page after the theme’s CSS. It stays when the theme is updated or changed.',
      ),
    },
    {
      name: 'theme' as const,
      label: t('CSS for {theme} only', { theme: themeName }),
      help: t('Printed after the CSS above, only while this theme is active.'),
    },
  ];
  return (
    <div data-testid="additional-css">
      {parts.map((part) => (
        <div key={part.name} className="px-6 py-3">
          <p
            id={`additional-css-${part.name}-label`}
            className="text-[13px] font-semibold text-slate-800"
          >
            {part.label}
          </p>
          <p id={`additional-css-${part.name}-help`} className="mt-1 text-xs text-slate-600">
            {part.help}
          </p>
          {/* Highlighted, with completions; loaded only when this section opens (core 0.80). */}
          <CodeEditor
            className="mt-2"
            language="css"
            id={`additional-css-${part.name}`}
            label={part.label}
            describedBy={`additional-css-${part.name}-help`}
            invalid={additionalCssProblem(css[part.name]) !== null}
            value={css[part.name]}
            rows={8}
            onChange={(next) => onChange({ ...css, [part.name]: next })}
          />
        </div>
      ))}
      <p className="px-6 pb-2 text-xs text-slate-500">
        {t('{count} of {max} characters', {
          count: Math.max(css.site.length, css.theme.length).toLocaleString(locale),
          max: max.toLocaleString(locale),
        })}
      </p>
      {problem && (
        <p role="alert" className="mx-6 mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {t(problem)}
        </p>
      )}
    </div>
  );
}

function MenuItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-100"
    >
      {children}
    </button>
  );
}

/** Sections as the customizer lists them: full-width rows with a chevron. */
function SectionList({
  items,
  locale,
  onOpen,
}: {
  items: Section[];
  locale: string;
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="border-t border-slate-200">
      {items.map((s) => (
        <li key={s.id} className="border-b border-slate-200">
          <button
            type="button"
            onClick={() => onOpen(s.id)}
            className="flex w-full items-center justify-between px-6 py-3 text-left text-[13px] font-semibold text-slate-800 hover:bg-[#f6f7f7] hover:text-[#2271b1]"
          >
            {labelText(s.label, locale)}
            <span aria-hidden="true" className="text-lg leading-none text-slate-500">
              ›
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Links to elements' settings as bordered boxes (the builder's Elements tab). */
function BoxedLinks({
  heading,
  items,
  locale,
  onOpen,
}: {
  heading?: string;
  items: { id: string; label: Section['label'] }[];
  locale: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="border-b border-slate-200 px-6 py-3">
      {heading && <h3 className="mb-3 text-[13px] font-semibold text-slate-800">{heading}</h3>}
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpen(item.id)}
              className="flex w-full items-center justify-between rounded border border-slate-300 bg-white px-3.5 py-2.5 text-left text-[13px] font-semibold text-slate-800 hover:border-[#2271b1] hover:text-[#2271b1]"
            >
              {labelText(item.label, locale)}
              <span aria-hidden="true" className="text-lg leading-none text-slate-500">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DEVICE_ICONS: Record<PreviewDevice, ReactNode> = {
  desktop: (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="2" y="3" width="16" height="11" rx="1" />
      <path d="M7 17h6M10 14v3" />
    </svg>
  ),
  tablet: (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="4" y="2" width="12" height="16" rx="1.5" />
      <path d="M9 15h2" />
    </svg>
  ),
  mobile: (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="6" y="2" width="8" height="16" rx="1.5" />
      <path d="M9.5 15h1" />
    </svg>
  ),
};

function DeviceButtons({
  device,
  setDevice,
}: {
  device: PreviewDevice;
  setDevice: (d: PreviewDevice) => void;
}) {
  const { t } = useT();
  const names: Record<PreviewDevice, string> = {
    desktop: t('Desktop'),
    tablet: t('Tablet'),
    mobile: t('Mobile'),
  };
  return (
    <div role="group" aria-label={t('Device')} className="ml-auto flex">
      {(Object.keys(names) as PreviewDevice[]).map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={d === device}
          onClick={() => setDevice(d)}
          className={`flex w-[48px] flex-col items-center justify-center gap-0.5 border-b-[3px] text-[10px] ${
            d === device
              ? 'border-slate-800 text-slate-900'
              : 'border-transparent text-slate-600 hover:text-[#2271b1]'
          }`}
        >
          {DEVICE_ICONS[d]}
          {names[d]}
        </button>
      ))}
    </div>
  );
}
