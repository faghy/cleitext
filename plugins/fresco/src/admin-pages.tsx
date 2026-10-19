/**
 * Fresco's own menu in the admin, as other page builders have: an overview
 * (new page, the pages made with Fresco, the way to the site settings) and
 * the saved templates.
 */
import { api as coreApi, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { useEffect, useState } from 'react';
import { download, toTemplate, type PatternView, type Template } from './editor/library.js';
import './editor/i18n.js';

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
.frx .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}
.frx .error{color:#b91c1c}
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
  const load = () =>
    void coreApi<PatternView[]>('GET', '/patterns')
      .then((list) => setTemplates(list.map(toTemplate).filter((x): x is Template => x !== null)))
      .catch((e: unknown) => setError(String(e instanceof Error ? e.message : e)));
  useEffect(load, []);
  return (
    <div className="frx">
      <Styles />
      <h1>{t('Templates')}</h1>
      <p className="lead">
        {t(
          'Pages and sections saved from Fresco. Insert them from the folder button of the editor, or export them to another site.',
        )}
      </p>
      {error && <p className="error">{error}</p>}
      {!templates && !error && <p className="muted">{t('Loading…')}</p>}
      {templates && templates.length === 0 && (
        <p className="muted">
          {t(
            'No templates yet: in the editor, right-click an element and choose “Save as template”.',
          )}
        </p>
      )}
      {templates && templates.length > 0 && (
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
            {templates.map((template) => (
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
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        download({
                          format: 'fresco-template',
                          version: 1,
                          title: template.title,
                          kind: template.kind,
                          blocks: template.blocks,
                        })
                      }
                    >
                      {t('Export')}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        if (
                          !window.confirm(
                            t('Delete the template “{name}”?', { name: template.title }),
                          )
                        )
                          return;
                        void coreApi('DELETE', `/patterns/${template.id}`).then(
                          load,
                          (e: unknown) => setError(String(e instanceof Error ? e.message : e)),
                        );
                      }}
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
    </div>
  );
}
