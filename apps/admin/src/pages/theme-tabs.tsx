import type { CxdDocument } from '@cleitext/blocks';
import type { EditorInstance } from '@cleitext/editor-core';
import { labelText, type PatternView, type ThemeView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api';
import { editorExtensions } from '../editor-plugins';
import { useMe } from '../auth';
import { Alert, Button, Card, useT } from '../components/ui';
import { mediaServices } from './entry-editor';
import { PackageUpload } from '../components/package-upload';
import { CatalogBrowser, CatalogUpdateButton } from '../components/catalog';
import { LicenseBox } from '../components/license';

interface ActiveTheme {
  theme: ThemeView | undefined;
  values: Record<string, unknown>;
}

const ACTIVE_KEY = ['themes', 'active'];

/**
 * Appearance → Themes (RF-THM-01): installed themes, one active per site. The active
 * theme links to its options when it has some.
 */
export function ThemesTab({ onCustomize }: { onCustomize?: (() => void) | undefined }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const themes = useQuery({
    queryKey: ['themes'],
    queryFn: () => api<ThemeView[]>('GET', '/themes'),
  });
  const activate = useMutation({
    mutationFn: (slug: string) =>
      api<{ warnings?: string[] } | undefined>('POST', `/themes/${slug}/activate`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['themes'] });
      // The plugins that come with the theme changed too (its menu entries, its editor).
      void queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
  const me = useMe();
  const canDelete = me.capabilities.includes('manage_plugins');
  const deleteTheme = useMutation({
    mutationFn: (slug: string) => api<void>('DELETE', `/themes/${slug}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['themes'] }),
  });
  const [installBefore, installAfter] = t(
    'More themes are installed on the server with {command}.',
  ).split('{command}');
  // Themes → Add New: the catalog and the upload, as in WordPress.
  const [adding, setAdding] = useState(false);
  const [previewing, setPreviewing] = useState<ThemeView | null>(null);
  if (previewing) {
    return (
      <LivePreview
        theme={previewing}
        onClose={() => setPreviewing(null)}
        onActivate={() =>
          activate.mutate(previewing.slug, { onSuccess: () => setPreviewing(null) })
        }
        activating={activate.isPending}
        error={activate.error}
      />
    );
  }
  if (adding) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">{t('Add Themes')}</h2>
          <Button variant="secondary" onClick={() => setAdding(false)}>
            {t('Installed themes')}
          </Button>
        </div>
        <CatalogBrowser type="theme" />
        <PackageUpload
          title={t('Upload Theme')}
          path="/themes/upload"
          onInstalled={() => void queryClient.invalidateQueries({ queryKey: ['themes'] })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canDelete && (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          {t('Add New Theme')}
        </Button>
      )}
      {(activate.data?.warnings ?? []).map((warning) => (
        <Alert key={warning}>{warning}</Alert>
      ))}
      {(themes.error ?? activate.error ?? deleteTheme.error) && (
        <Alert>{errorMessage(themes.error ?? activate.error ?? deleteTheme.error)}</Alert>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={t('Themes')}>
        {themes.data?.map((theme) => (
          <li
            key={theme.slug}
            aria-label={theme.name}
            className={`space-y-2 rounded border bg-white p-4 shadow-sm ${theme.active ? 'border-sky-500' : 'border-slate-200'}`}
          >
            <h2 className="font-semibold">
              {theme.name}{' '}
              <span className="text-sm font-normal text-slate-500">{theme.version}</span>
            </h2>
            {theme.description && <p className="text-sm text-slate-600">{theme.description}</p>}
            <CatalogUpdateButton type="theme" slug={theme.slug} />
            {theme.paid && !theme.error && (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
                  {theme.paid.license ? t('Paid theme') : t('Paid theme · demo')}
                </p>
                <LicenseBox
                  slug={theme.slug}
                  name={theme.name}
                  purchaseUrl={theme.paid.purchaseUrl}
                  license={theme.paid.license}
                />
              </>
            )}
            {theme.error ? (
              <Alert>{t('This theme could not be loaded: {error}', { error: theme.error })}</Alert>
            ) : theme.active ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium text-sky-700">{t('Active')}</p>
                {onCustomize && theme.settings.length > 0 && (
                  <Button variant="secondary" onClick={onCustomize}>
                    {t('Customize')}
                    <span className="sr-only"> {theme.name}</span>
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  disabled={activate.isPending || (theme.paid !== null && !theme.paid.license)}
                  onClick={() => activate.mutate(theme.slug)}
                >
                  {t('Activate')}
                  <span className="sr-only"> {theme.name}</span>
                </Button>
                <Button variant="secondary" onClick={() => setPreviewing(theme)}>
                  {t('Live Preview')}
                  <span className="sr-only"> {theme.name}</span>
                </Button>
                {/* Bundled themes stay; one used by another site is refused by the server. */}
                {canDelete && !theme.bundled && (
                  <Button
                    variant="danger"
                    disabled={deleteTheme.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          t('Delete the theme {name}? This cannot be undone.', {
                            name: theme.name,
                          }),
                        )
                      )
                        deleteTheme.mutate(theme.slug);
                    }}
                  >
                    {t('Delete')}
                    <span className="sr-only"> {theme.name}</span>
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-600">
        {installBefore}
        <code>cleitext theme:install &lt;folder&gt;</code>
        {installAfter}
      </p>
    </div>
  );
}

/**
 * Live Preview: the site's own pages with an installed theme that is not
 * active, before activating it. Paid themes are tried this way (their demo).
 */
function LivePreview({
  theme,
  onClose,
  onActivate,
  activating,
  error,
}: {
  theme: ThemeView;
  onClose: () => void;
  onActivate: () => void;
  activating: boolean;
  error: unknown;
}) {
  const { t } = useT();
  const [path, setPath] = useState('/');
  const [html, setHtml] = useState('');
  const [failure, setFailure] = useState<unknown>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      void api<string>('POST', `/themes/${theme.slug}/preview`, { path }, { text: true })
        .then((page) => {
          setHtml(page);
          setFailure(null);
        })
        .catch((e: unknown) => setFailure(e));
    }, 300);
    return () => clearTimeout(timer);
  }, [theme.slug, path]);
  const locked = theme.paid !== null && !theme.paid.license;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{t('Live Preview: {name}', { name: theme.name })}</h2>
        <Button disabled={activating || locked} onClick={onActivate}>
          {t('Activate')}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t('Installed themes')}
        </Button>
      </div>
      {locked && (
        <p className="text-sm text-slate-600">
          {t('This is the demo of a paid theme: enter a license key to activate it.')}
        </p>
      )}
      {Boolean(error ?? failure) && <Alert>{errorMessage(error ?? failure)}</Alert>}
      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium">{t('Preview of')}</span>
        <input
          className="flex-1 rounded border border-slate-300 px-2 py-1"
          value={path}
          onChange={(e) =>
            setPath(e.target.value.startsWith('/') ? e.target.value : `/${e.target.value}`)
          }
        />
      </label>
      <iframe
        title={t('Site preview')}
        // No scripts, no same-origin access: the page is only shown.
        sandbox=""
        srcDoc={html}
        className="h-[75vh] w-full rounded border border-slate-200 bg-white"
      />
    </div>
  );
}

/** Appearance → Areas (RF-THM-04): the theme's block areas, per language. */
export function AreasTab() {
  const { t } = useT();
  const me = useMe();
  const active = useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: () => api<ActiveTheme>('GET', '/themes/active'),
  });
  const areas = Object.entries(active.data?.theme?.areas ?? {});
  const [area, setArea] = useState<string | null>(null);
  const [locale, setLocale] = useState(me.site.defaultLocale);
  const current = area ?? areas[0]?.[0] ?? null;

  if (active.data && areas.length === 0) {
    return <p className="text-sm text-slate-600">{t('This theme has no block areas.')}</p>;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="font-medium">{t('Area')}</span>
          <select
            className="rounded border border-slate-300 bg-white px-2 py-1"
            value={current ?? ''}
            onChange={(e) => setArea(e.target.value)}
          >
            {areas.map(([name, label]) => (
              <option key={name} value={name}>
                {labelText(label, me.user.locale)}
              </option>
            ))}
          </select>
        </label>
        {me.site.locales.length > 1 && (
          <label className="flex items-center gap-2">
            <span className="font-medium">{t('Language')}</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
            >
              {me.site.locales.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {current && <AreaEditor key={`${current}:${locale}`} name={current} locale={locale} />}
    </div>
  );
}

function AreaEditor({ name, locale }: { name: string; locale: string }) {
  const { t } = useT();
  const url = `/themes/active/areas/${name}?locale=${encodeURIComponent(locale)}`;
  return (
    <DocumentEditor
      key={url}
      locale={locale}
      load={() => api<CxdDocument>('GET', url)}
      save={(document) => api<CxdDocument>('PUT', url, { document })}
      saveLabel={t('Save area')}
    />
  );
}

/** The block editor on a document that is not an entry (areas, patterns). */
function DocumentEditor({
  locale,
  load,
  save: store,
  saveLabel,
}: {
  locale: string;
  load: () => Promise<CxdDocument>;
  save: (document: CxdDocument | undefined) => Promise<unknown>;
  saveLabel: string;
}) {
  const { t } = useT();
  const canvasRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      import('@cleitext/editor-gutenberg'),
      load(),
      api<{ css: string }>('GET', '/themes/active/editor-styles').catch(() => ({ css: '' })),
      // Plugins' blocks in theme areas too (sidebars, footers).
      editorExtensions(locale),
    ]).then(([{ gutenbergAdapter }, document, styles, extensions]) => {
      if (cancelled || !canvasRef.current) return;
      editorRef.current = gutenbergAdapter.mount({
        document,
        targets: { canvas: canvasRef.current },
        services: mediaServices(locale),
        locale,
        styles: styles.css,
        fieldBlocks: extensions.fieldBlocks,
        styleUrls: extensions.styleUrls,
        onChange: () => save.reset(),
      });
      setReady(true);
    });
    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
    // Mounted once per document (the parent sets a key).
  }, []);

  const save = useMutation({ mutationFn: () => store(editorRef.current?.getDocument()) });

  return (
    <div className="light-palette space-y-3">
      <div
        className="h-[50vh] overflow-hidden rounded border border-slate-200 bg-white"
        ref={canvasRef}
      />
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
      <Button disabled={!ready || save.isPending} onClick={() => save.mutate()}>
        {saveLabel}
      </Button>
    </div>
  );
}

/** Appearance → Patterns (RF-EDT-07): saved patterns, editable and removable. */
export function PatternsTab() {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const patterns = useQuery({
    queryKey: ['patterns'],
    queryFn: () => api<PatternView[]>('GET', '/patterns'),
  });
  const [editing, setEditing] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['patterns'] });
  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api<PatternView>('PATCH', `/patterns/${id}`, { title }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/patterns/${id}`),
    onSuccess: refresh,
  });
  const current = patterns.data?.find((p) => p.id === editing);
  const error = rename.error ?? remove.error ?? patterns.error;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {t(
          'Patterns are saved from the editor (Save as pattern). Synced patterns are the same everywhere: change them here.',
        )}
      </p>
      {error && <Alert>{errorMessage(error)}</Alert>}
      {patterns.data?.length === 0 && <p className="text-sm">{t('No patterns yet.')}</p>}
      <ul
        className="divide-y divide-slate-100 rounded border border-slate-200 bg-white"
        aria-label={t('Patterns')}
      >
        {patterns.data?.map((pattern) => (
          <li
            key={pattern.id}
            className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
          >
            <span>
              <span className="font-medium">{pattern.title}</span>{' '}
              <span className="text-xs text-slate-500">
                {pattern.synced ? t('synced') : t('copied when inserted')}
              </span>
            </span>
            <span className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditing(pattern.id)}>
                {t('Edit')}
                <span className="sr-only"> {pattern.title}</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const title = window.prompt(t('New name'), pattern.title);
                  if (title?.trim()) rename.mutate({ id: pattern.id, title: title.trim() });
                }}
              >
                {t('Rename')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (window.confirm(t('Delete the pattern "{name}"?', { name: pattern.title })))
                    remove.mutate(pattern.id);
                }}
              >
                {t('Delete')}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {current && (
        <Card title={t('Edit {name}', { name: current.title })}>
          <DocumentEditor
            key={current.id}
            locale={me.site.defaultLocale}
            load={async () => current.document as CxdDocument}
            save={async (document) => {
              await api<PatternView>('PATCH', `/patterns/${current.id}`, { document });
              await refresh();
            }}
            saveLabel={t('Save pattern')}
          />
        </Card>
      )}
    </div>
  );
}
