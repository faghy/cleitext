/**
 * Fresco's own menu in the admin, as other page builders have: an overview
 * (new page, the pages made with Fresco, the way to the site settings), the
 * saved templates, the site settings, tools and the system info for support.
 */
import {
  adminUrl,
  api as coreApi,
  errorMessage,
  useT,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useEffect, useRef, useState } from 'react';
import { AdminDialogs, askText, confirmAction, notify } from './admin-dialogs.js';
import {
  download,
  importNotes,
  importTemplateFile,
  renameTemplate,
  searchTemplates,
  templateFile,
  toTemplate,
  type PatternView,
  type Template,
} from './editor/library.js';
import { TemplatePreview } from './editor/template-preview.js';
import { SAFE_MODE_HASH } from './editor/availability.js';
import { normalizeKit, type Kit } from './core/kit.js';
import {
  systemReport,
  systemSections,
  type CoreStatus,
  type PluginRow,
  type SystemData,
  type ThemeRow,
} from './system-report.js';
import type { FrescoSystemInfo, ReplaceResult } from './tools.js';
import './editor/i18n.js';
import './admin-i18n.js';
import './advanced-i18n.js';

interface FrescoPage {
  id: string;
  title: string;
  type: string;
  status: string;
  url: string;
}

/** The admin's address of an entry's editor (with a panel to open, if any). */
const editorUrl = (id: string, panel?: string) =>
  `${window.location.pathname.split('/ext/')[0]}/entries/${id}${panel ? `#fresco-${panel}` : ''}`;

const PAGE_CSS = `
.frx{max-width:1000px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937}
.frx h1{display:flex;align-items:center;gap:12px;margin:0 0 6px;font-size:26px}
.frx h1 span{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:6px;background:#c2410c;color:#fff;font-size:18px;font-weight:800}
.frx p.lead{margin:0 0 22px;color:#6b7280}
.frx .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:28px}
.frx .card{padding:18px 20px;border:1px solid #e5e7eb;border-radius:8px;background:#fff}
.frx .card h2{margin:0 0 6px;font-size:16px}
.frx .card p{margin:0 0 14px;color:#6b7280;font-size:13px}
.frx .btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#1f2937;font:inherit;font-size:13px;text-decoration:none;cursor:pointer}
.frx .btn:hover{border-color:#c2410c;color:#c2410c}
.frx .btn--primary{background:#c2410c;border-color:#c2410c;color:#fff}
.frx .btn--primary:hover{color:#fff;filter:brightness(1.07)}
.frx table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
.frx th,.frx td{padding:10px 14px;text-align:left;border-bottom:1px solid #f1f5f9;font-size:13px}
.frx th{background:#f8fafc;color:#6b7280;font-weight:600}
.frx td a{color:#c2410c;text-decoration:none;font-weight:600}
.frx .muted{color:#6b7280}
.frx select{padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font:inherit;background:#fff;max-width:340px}
.frx input.search{min-width:240px;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font:inherit}
.frx .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}
.frx .error{color:#b91c1c}
.frx .ok{color:#047857}
.frx .card label{display:block;margin:0 0 10px;font-size:13px;font-weight:600}
.frx .card input[type=url]{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font:inherit;font-weight:400}
.frx .card ul{margin:0 0 12px;padding-left:18px;font-size:13px}
.frx dl{display:grid;grid-template-columns:minmax(160px,max-content) 1fr;gap:6px 18px;margin:0;font-size:13px}
.frx dt{color:#6b7280}
.frx dd{margin:0;word-break:break-word}
.frx .stack{display:grid;gap:16px;margin-bottom:20px}
`;

function Styles() {
  return <style>{PAGE_CSS}</style>;
}

export function FrescoHome({ user }: AdminPageProps) {
  const { t } = useT();
  const [pages, setPages] = useState<FrescoPage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void coreApi<FrescoPage[]>('GET', '/ext/fresco/pages')
      .then(setPages)
      .catch((e: unknown) => setError(String(e instanceof Error ? e.message : e)));
  }, []);
  const create = async (type: 'page' | 'article') => {
    setBusy(true);
    try {
      const entry = await coreApi<{ id: string }>('POST', '/entries', {
        type,
        title: type === 'page' ? t('New page') : t('New post'),
        document: { schema: 1, blocks: [], editor: { id: 'fresco' } },
      });
      window.location.assign(editorUrl(entry.id));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  };
  const first = pages?.[0];
  const canKit = user.capabilities.includes('manage_fresco');
  return (
    <div className="frx">
      <Styles />
      <h1>
        <span>F</span>Fresco
      </h1>
      <p className="lead">
        {t('Build pages visually: drag containers and elements, style them for every device.')}
      </p>
      {error && <p className="error">{error}</p>}
      <div className="cards">
        <div className="card">
          <h2>{t('Start a new page')}</h2>
          <p>{t('An empty page that opens straight in Fresco.')}</p>
          <div className="row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void create('page')}
            >
              {t('New page with Fresco')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void create('article')}
            >
              {t('New post')}
            </button>
          </div>
        </div>
        {canKit && (
          <div className="card">
            <h2>{t('Site settings')}</h2>
            <p>
              {t(
                'Global colors and fonts, theme style, layout and breakpoints of every Fresco page.',
              )}
            </p>
            {first ? (
              <a className="btn" href={editorUrl(first.id, 'site')}>
                {t('Open the site settings')}
              </a>
            ) : (
              <p className="muted">
                {t('Create a page with Fresco first: they open in its editor.')}
              </p>
            )}
          </div>
        )}
        <div className="card">
          <h2>{t('Templates')}</h2>
          <p>{t('Pages and sections saved to use again, also on other sites.')}</p>
          <a className="btn" href={`${window.location.pathname.replace(/\/$/, '')}/templates`}>
            {t('Manage the templates')}
          </a>
        </div>
      </div>
      <h2>{t('Pages made with Fresco')}</h2>
      {!pages && !error && <p className="muted">{t('Loading…')}</p>}
      {pages && pages.length === 0 && <p className="muted">{t('No page made with Fresco yet.')}</p>}
      {pages && pages.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>{t('Title')}</th>
              <th>{t('Type')}</th>
              <th>{t('Status')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id}>
                <td>
                  <a href={editorUrl(page.id)}>{page.title || t('(no title)')}</a>
                </td>
                <td className="muted">{page.type === 'page' ? t('Page') : t('Post')}</td>
                <td className="muted">{t(page.status)}</td>
                <td>
                  <a className="muted" href={page.url} target="_blank" rel="noreferrer">
                    {t('View')}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function TemplatesPage(_props: AdminPageProps) {
  const { t, language } = useT();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<Template | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const load = () =>
    void coreApi<PatternView[]>('GET', '/patterns')
      .then((list) => setTemplates(list.map(toTemplate).filter((x): x is Template => x !== null)))
      .catch((e: unknown) => setError(String(e instanceof Error ? e.message : e)));
  useEffect(load, []);
  const fail = (e: unknown) => setError(errorMessage(e));
  const open = (template: Template) => {
    setPreview(template);
    if (!kit)
      void coreApi<unknown>('GET', '/ext/fresco/kit')
        .then((value) => setKit(normalizeKit(value)))
        .catch(() => setKit(normalizeKit(null)));
  };
  const shown = searchTemplates(templates ?? [], search);
  return (
    <div className="frx">
      <Styles />
      <AdminDialogs />
      <h1>{t('Templates')}</h1>
      <p className="lead">
        {t(
          'Pages and sections saved from Fresco. Insert them from the folder button of the editor, or export them to another site.',
        )}
      </p>
      <div className="row">
        <input
          type="search"
          className="search"
          placeholder={t('Search templates…')}
          aria-label={t('Search templates')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="btn">
          {t('Import')}
          <input
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setError(null);
              try {
                const imported = await importTemplateFile(file);
                notify(t('“{name}” imported.', { name: imported.file.title }), 'success');
                for (const note of importNotes(imported)) notify(note, 'info');
                load();
              } catch (err) {
                fail(err);
              }
            }}
          />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      {!templates && !error && <p className="muted">{t('Loading…')}</p>}
      {templates && templates.length === 0 && (
        <p className="muted">
          {t(
            'No templates yet: in the editor, right-click an element and choose “Save as template”.',
          )}
        </p>
      )}
      {templates && templates.length > 0 && shown.length === 0 && (
        <p className="muted">{t('No templates found.')}</p>
      )}
      {shown.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>{t('Name')}</th>
              <th>{t('Type')}</th>
              <th>{t('Updated')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((template) => (
              <tr key={template.id}>
                <td>
                  <strong>{template.title}</strong>
                </td>
                <td className="muted">{template.kind === 'page' ? t('Page') : t('Section')}</td>
                <td className="muted">
                  {new Date(template.updatedAt).toLocaleDateString(language, {
                    dateStyle: 'medium',
                  })}
                </td>
                <td>
                  <div className="row" style={{ margin: 0 }}>
                    <button type="button" className="btn" onClick={() => open(template)}>
                      {t('Preview')}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        void askText({
                          title: t('Rename the template'),
                          label: t('Name'),
                          value: template.title,
                        }).then((title) => {
                          const name = title?.trim();
                          if (!name || name === template.title) return;
                          void renameTemplate(template.id, name).then(load, fail);
                        })
                      }
                    >
                      {t('Rename')}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => download(templateFile(template))}
                    >
                      {t('Export')}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        void confirmAction({
                          title: t('Delete the template “{name}”?', { name: template.title }),
                          action: t('Delete'),
                          danger: true,
                        }).then((ok) => {
                          if (!ok) return;
                          void coreApi('DELETE', `/patterns/${template.id}`).then(load, fail);
                        })
                      }
                    >
                      {t('Delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {preview && kit && (
        <TemplatePreview
          title={preview.title}
          blocks={preview.blocks}
          kit={kit}
          locale={language}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

/**
 * Safe mode, for troubleshooting: opens a page in the editor with other
 * plugins' blocks and the theme's and other plugins' styles off.
 */
function SafeModeCard() {
  const { t } = useT();
  const [pages, setPages] = useState<FrescoPage[] | null>(null);
  const [chosen, setChosen] = useState('');
  useEffect(() => {
    void coreApi<FrescoPage[]>('GET', '/ext/fresco/pages')
      .then((list) => {
        setPages(list);
        setChosen((id) => id || list[0]?.id || '');
      })
      .catch(() => setPages([]));
  }, []);
  return (
    <div className="card">
      <h2>{t('Safe mode')}</h2>
      <p>
        {t(
          'If the editor does not load or a page looks wrong only in the editor, open it in Safe mode: other plugins’ blocks and the styles of the theme and of other plugins are off. If the problem is gone, one of them causes it.',
        )}
      </p>
      {pages && pages.length === 0 ? (
        <p className="muted">{t('No pages made with Fresco yet.')}</p>
      ) : (
        <div className="row">
          <select
            aria-label={t('Page')}
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            disabled={!pages}
          >
            {(pages ?? []).map((page) => (
              <option key={page.id} value={page.id}>
                {page.title || t('(no title)')}
              </option>
            ))}
          </select>
          <a
            className="btn"
            href={chosen ? `${editorUrl(chosen)}${SAFE_MODE_HASH}` : undefined}
            aria-disabled={!chosen}
          >
            {t('Open in Safe mode')}
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * "Site settings" of Fresco's menu: the editor opens on its Site settings
 * panel, over the most recent page made with Fresco. A site without one
 * gets a draft page for it (reused the next times).
 */
export function SiteSettingsPage(_props: AdminPageProps) {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const open = async () => {
      const pages = await coreApi<FrescoPage[]>('GET', '/ext/fresco/pages');
      let id = pages[0]?.id;
      if (!id) {
        const entry = await coreApi<{ id: string }>('POST', '/entries', {
          type: 'page',
          title: t('Fresco site settings'),
          document: { schema: 1, blocks: [], editor: { id: 'fresco' } },
        });
        id = entry.id;
      }
      window.location.replace(editorUrl(id, 'site'));
    };
    open().catch((e: unknown) => setError(errorMessage(e)));
  }, []);
  return (
    <div className="frx">
      <Styles />
      <h1>{t('Site settings')}</h1>
      {error ? (
        <p className="error">{error}</p>
      ) : (
        <p className="muted">{t('Opening the site settings in Fresco…')}</p>
      )}
    </div>
  );
}

// ---- What support asks about: versions and the system ----------------------------------

/** Fresco's own info and what the core shows this user (each part when allowed). */
function useSystem(): { data: SystemData | null; error: string | null } {
  const [data, setData] = useState<SystemData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const optional = <T,>(path: string) => coreApi<T>('GET', path).catch(() => null);
    void Promise.all([
      coreApi<FrescoSystemInfo>('GET', '/ext/fresco/system'),
      optional<CoreStatus>('/system/status'),
      optional<PluginRow[]>('/plugins'),
      optional<ThemeRow[]>('/themes'),
    ])
      .then(([fresco, core, plugins, themes]) => setData({ fresco, core, plugins, themes }))
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);
  return { data, error };
}

function SystemSections({ data }: { data: SystemData }) {
  const { t } = useT();
  return (
    <div className="stack">
      {systemSections(data, t).map((section) => (
        <div className="card" key={section.title}>
          <h2>{section.title}</h2>
          <dl>
            {section.rows.map(([label, value]) => (
              <div key={label} style={{ display: 'contents' }}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

export function SystemInfoPage(_props: AdminPageProps) {
  const { t } = useT();
  const { data, error } = useSystem();
  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(systemReport(systemSections(data, t)));
      notify(t('Copied: paste it in your support request.'), 'success');
    } catch {
      notify(t('The browser did not allow copying.'), 'error');
    }
  };
  return (
    <div className="frx">
      <Styles />
      <AdminDialogs />
      <h1>{t('System info')}</h1>
      <p className="lead">
        {t('What support asks about: versions of Cleitext, Fresco and the server.')}
      </p>
      <div className="row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!data}
          onClick={() => void copy()}
        >
          {t('Copy the system info')}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">{t('Loading…')}</p>}
      {data && <SystemSections data={data} />}
    </div>
  );
}

// ---- Tools ---------------------------------------------------------------------------

/** The header and footer an import gave Fresco (without Fresco Pro): listed, and removed. */
function ImportedLocationsCard() {
  const { t } = useT();
  const [locations, setLocations] = useState<{ kind: string; title: string }[]>([]);
  const load = () =>
    coreApi<{ locations: { kind: string; title: string }[] }>('GET', '/ext/fresco/tools/locations')
      .then((result) => setLocations(result.locations))
      .catch(() => setLocations([]));
  useEffect(() => {
    void load();
  }, []);
  if (locations.length === 0) return null;
  const remove = async (kind: string, title: string) => {
    const ok = await confirmAction({
      title: t('Remove "{title}"?', { title }),
      text: t('The theme shows its own header or footer again.'),
      action: t('Remove'),
      danger: true,
    });
    if (!ok) return;
    await coreApi('DELETE', `/ext/fresco/tools/locations?kind=${encodeURIComponent(kind)}`);
    await load();
  };
  return (
    <div className="card">
      <h2>{t('Imported header and footer')}</h2>
      <p>
        {t(
          'The header and footer of the imported site, shown by Fresco in the theme’s place. With Fresco Pro, import again to have them as theme templates you can edit.',
        )}
      </p>
      <ul>
        {locations.map((location) => (
          <li key={location.kind}>
            {location.title}{' '}
            <button
              type="button"
              className="btn"
              onClick={() => void remove(location.kind, location.title)}
            >
              {t('Remove')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ToolsPage(_props: AdminPageProps) {
  const { t } = useT();
  const { data } = useSystem();
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [counted, setCounted] = useState<(ReplaceResult & { from: string; to: string }) | null>(
    null,
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const regenerate = () =>
    run(async () => {
      await coreApi('POST', '/ext/fresco/tools/regenerate-css');
      setMessage({ ok: true, text: t('The CSS of the Fresco pages is generated again.') });
    });

  const count = () =>
    run(async () => {
      const result = await coreApi<ReplaceResult>('POST', '/ext/fresco/tools/replace-url', {
        from,
        to,
        dryRun: true,
      });
      setCounted({ ...result, from, to });
    });

  const replace = () =>
    run(async () => {
      if (!counted) return;
      const ok = await confirmAction({
        title: t('Replace the address?'),
        text: t(
          '{count} occurrences in {documents} documents change. Each page keeps its earlier revisions.',
          { count: counted.replaced, documents: counted.entries.length },
        ),
        action: t('Replace'),
        danger: true,
      });
      if (!ok) return;
      const result = await coreApi<ReplaceResult>('POST', '/ext/fresco/tools/replace-url', {
        from: counted.from,
        to: counted.to,
        dryRun: false,
      });
      setCounted(null);
      setMessage({
        ok: true,
        text: t('{count} occurrences replaced in {documents} documents.', {
          count: result.replaced,
          documents: result.entries.length,
        }),
      });
    });

  const fresh = counted && counted.from === from && counted.to === to;
  const pro = data?.plugins?.find((p) => p.slug === 'fresco-pro');
  return (
    <div className="frx">
      <Styles />
      <AdminDialogs />
      <h1>{t('Tools')}</h1>
      {message && <p className={message.ok ? 'ok' : 'error'}>{message.text}</p>}
      <div className="stack">
        <div className="card">
          <h2>{t('Regenerate CSS')}</h2>
          <p>
            {t(
              'Pages made with Fresco keep their styles ready to be fast. If a page looks wrong after an update or a change of the site settings, generate them again.',
            )}
          </p>
          <button type="button" className="btn" disabled={busy} onClick={() => void regenerate()}>
            {t('Regenerate CSS')}
          </button>
        </div>

        <div className="card">
          <h2>{t('Replace URL')}</h2>
          <p>
            {t(
              'After moving the site to a new address or to HTTPS: replace the old address in every page and template made with Fresco. Count first, then replace.',
            )}
          </p>
          <label>
            {t('Old address')}
            <input
              type="url"
              placeholder="http://old-site.com"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            {t('New address')}
            <input
              type="url"
              placeholder="https://new-site.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          {fresh && (
            <>
              <p>
                {counted.replaced === 0
                  ? t('The old address is in no Fresco document.')
                  : t('Found {count} times in {documents} documents:', {
                      count: counted.replaced,
                      documents: counted.entries.length,
                    })}
              </p>
              {counted.entries.length > 0 && (
                <ul>
                  {counted.entries.slice(0, 20).map((entry) => (
                    <li key={entry.id}>
                      {entry.title || t('(no title)')} ({entry.count})
                    </li>
                  ))}
                  {counted.entries.length > 20 && (
                    <li>{t('and {count} more', { count: counted.entries.length - 20 })}</li>
                  )}
                </ul>
              )}
            </>
          )}
          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={busy || !from.trim() || !to.trim()}
              onClick={() => void count()}
            >
              {t('Count')}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !fresh || counted.replaced === 0}
              onClick={() => void replace()}
            >
              {t('Replace URL')}
            </button>
          </div>
        </div>

        <ImportedLocationsCard />

        <SafeModeCard />

        <div className="card">
          <h2>{t('Versions')}</h2>
          <dl>
            <dt>Cleitext</dt>
            <dd>{data?.core?.version ?? '—'}</dd>
            <dt>{t('Plugin API')}</dt>
            <dd>{data?.fresco?.pluginApi ?? '—'}</dd>
            <dt>Fresco</dt>
            <dd>{data?.fresco?.fresco.version ?? '—'}</dd>
            <dt>Fresco Pro</dt>
            <dd>{pro ? pro.version : '—'}</dd>
          </dl>
          <div className="row" style={{ marginTop: 14, marginBottom: 0 }}>
            <a className="btn" href={adminUrl('/updates')}>
              {t('Check for updates')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
