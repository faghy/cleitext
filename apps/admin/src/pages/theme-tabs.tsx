import type { CxdDocument } from '@cleitext/blocks';
import type { EditorInstance } from '@cleitext/editor-core';
import { FieldsForm } from '@cleitext/admin-sdk';
import { labelText, type ThemeView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, useT } from '../components/ui';
import { mediaServices } from './entry-editor';

interface ActiveTheme {
  theme: ThemeView | undefined;
  values: Record<string, unknown>;
}

const ACTIVE_KEY = ['themes', 'active'];

/** Appearance → Themes (RF-THM-01): installed themes, one active per site. */
export function ThemesTab() {
  const { t } = useT();
  const queryClient = useQueryClient();
  const themes = useQuery({
    queryKey: ['themes'],
    queryFn: () => api<ThemeView[]>('GET', '/themes'),
  });
  const activate = useMutation({
    mutationFn: (slug: string) => api<void>('POST', `/themes/${slug}/activate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['themes'] }),
  });
  const [installBefore, installAfter] = t(
    'More themes are installed on the server with {command}.',
  ).split('{command}');

  return (
    <div className="space-y-4">
      {(themes.error ?? activate.error) && (
        <Alert>{errorMessage(themes.error ?? activate.error)}</Alert>
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
            {theme.error ? (
              <Alert>{t('This theme could not be loaded: {error}', { error: theme.error })}</Alert>
            ) : theme.active ? (
              <p className="text-sm font-medium text-sky-700">{t('Active')}</p>
            ) : (
              <Button
                variant="secondary"
                disabled={activate.isPending}
                onClick={() => activate.mutate(theme.slug)}
              >
                {t('Activate')}
                <span className="sr-only"> {theme.name}</span>
              </Button>
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

/** Appearance → Customize (RF-THM-03): the theme's settings with a live preview. */
export function CustomizeTab() {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const active = useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: () => api<ActiveTheme>('GET', '/themes/active'),
  });
  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const [html, setHtml] = useState('');
  const [path, setPath] = useState('/');
  useEffect(() => {
    if (active.data && values === null) setValues(active.data.values);
  }, [active.data, values]);

  // The preview follows the form, a moment after the last change.
  useEffect(() => {
    if (!values) return;
    const timer = setTimeout(() => {
      void api<string>('POST', '/themes/active/preview', { path, values }, { text: true })
        .then((page) => setHtml(page))
        .catch(() => setHtml(''));
    }, 400);
    return () => clearTimeout(timer);
  }, [values, path]);

  const save = useMutation({
    mutationFn: () =>
      api<Record<string, unknown>>('PUT', '/themes/active/settings', { values: values ?? {} }),
    onSuccess: (saved) => {
      setValues(saved);
      queryClient.setQueryData<ActiveTheme>(ACTIVE_KEY, (data) =>
        data ? { ...data, values: saved } : data,
      );
    },
  });
  const theme = active.data?.theme;
  const fields = theme?.settings ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <Card title={theme ? t('Customize {name}', { name: theme.name }) : t('Customize')}>
        {active.error && <Alert>{errorMessage(active.error)}</Alert>}
        {fields.length === 0 && theme && (
          <p className="text-sm text-slate-600">{t('This theme has no settings.')}</p>
        )}
        {values && fields.length > 0 && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <FieldsForm
              fields={fields}
              values={values}
              onChange={setValues}
              locale={me.user.locale}
            />
            {save.error && <Alert>{errorMessage(save.error)}</Alert>}
            {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
            <Button type="submit" disabled={save.isPending}>
              {t('Publish')}
            </Button>
          </form>
        )}
      </Card>
      <div className="space-y-2">
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
          className="h-[70vh] w-full rounded border border-slate-200 bg-white"
        />
      </div>
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
  const canvasRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const [ready, setReady] = useState(false);
  const url = `/themes/active/areas/${name}?locale=${encodeURIComponent(locale)}`;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      import('@cleitext/editor-gutenberg'),
      api<CxdDocument>('GET', url),
      api<{ css: string }>('GET', '/themes/active/editor-styles').catch(() => ({ css: '' })),
    ]).then(([{ gutenbergAdapter }, document, styles]) => {
      if (cancelled || !canvasRef.current) return;
      editorRef.current = gutenbergAdapter.mount({
        document,
        targets: { canvas: canvasRef.current },
        services: mediaServices(locale),
        locale,
        styles: styles.css,
        onChange: () => save.reset(),
      });
      setReady(true);
    });
    return () => {
      cancelled = true;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
    // Mounted once per area and language.
  }, [url]);

  const save = useMutation({
    mutationFn: () => api<CxdDocument>('PUT', url, { document: editorRef.current?.getDocument() }),
  });

  return (
    <div className="light-palette space-y-3">
      <div
        className="h-[50vh] overflow-hidden rounded border border-slate-200 bg-white"
        ref={canvasRef}
      />
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert kind="success">{t('Saved.')}</Alert>}
      <Button disabled={!ready || save.isPending} onClick={() => save.mutate()}>
        {t('Save area')}
      </Button>
    </div>
  );
}
