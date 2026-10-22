/**
 * Fresco → Element manager, as in Elementor: every element the editor
 * offers, with how much the site uses it (counted when asked), and the
 * switch that takes it out of the editor's panel. Pages keep showing the
 * elements switched off, and they can still be edited there.
 */
import { api as coreApi, errorMessage, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { useEffect, useMemo, useState } from 'react';
import { AdminDialogs, notify } from './admin-dialogs.js';
import { listElements } from './core/registry.js';
import type { ElementUsage } from './element-manager.js';
import { normalizeElementManager, offered } from './editor/availability.js';
import { Svg } from './editor/controls.js';
import { elementSource, loadPluginBlocks, pluginName } from './editor/plugin-blocks.js';
import './editor/i18n.js';
import './admin-i18n.js';
import './advanced-i18n.js';

const CSS = `
.frx-em{max-width:1100px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937}
.frx-em h1{margin:0 0 6px;font-size:26px}
.frx-em .lead{margin:0 0 18px;color:#6b7280}
.frx-em .bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}
.frx-em input[type=search],.frx-em select{padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font:inherit;background:#fff}
.frx-em input[type=search]{min-width:240px}
.frx-em .btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#1f2937;font:inherit;font-size:13px;cursor:pointer}
.frx-em .btn:hover{border-color:#c2410c;color:#c2410c}
.frx-em .btn--primary{background:#c2410c;border-color:#c2410c;color:#fff}
.frx-em .btn--primary:hover{color:#fff;filter:brightness(1.07)}
.frx-em .btn:disabled{opacity:.5;cursor:default}
.frx-em table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
.frx-em th,.frx-em td{padding:9px 14px;text-align:left;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:middle}
.frx-em th{background:#f8fafc;color:#6b7280;font-weight:600}
.frx-em td.name{display:flex;align-items:center;gap:10px;font-weight:600}
.frx-em td.name svg{flex:0 0 auto;color:#6b7280}
.frx-em .muted{color:#6b7280}
.frx-em .off td.name{color:#9ca3af}
.frx-em .error{color:#b91c1c}
.frx-em label.switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer}
`;

type Show = 'all' | 'active' | 'inactive' | 'unused';

export function ElementManagerPage(_props: AdminPageProps) {
  const { t, language } = useT();
  const [disabled, setDisabled] = useState<string[] | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [usage, setUsage] = useState<ElementUsage | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [show, setShow] = useState<Show>('all');
  // Bumped when the other plugins' blocks are known (they are elements of the panel too).
  const [blocksLoaded, setBlocksLoaded] = useState(0);

  useEffect(() => {
    void coreApi<unknown>('GET', '/ext/fresco/element-manager')
      .then((value) => {
        const list = normalizeElementManager(value).disabled;
        setDisabled(list);
        setSaved(list);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
    void loadPluginBlocks(language)
      .then(() => setBlocksLoaded((n) => n + 1))
      .catch(() => {});
  }, [language]);

  const elements = useMemo(
    () =>
      listElements()
        .filter((e) => offered(e, { disabled: [], safeMode: false }))
        .sort(
          (a, b) =>
            elementSource(a.type).localeCompare(elementSource(b.type)) ||
            t(a.title).localeCompare(t(b.title), language),
        ),
    // `blocksLoaded`: the list grows with the other plugins' blocks.
    [blocksLoaded, language, t],
  );

  const scan = () => {
    setScanning(true);
    setError(null);
    coreApi<ElementUsage>('GET', '/ext/fresco/element-usage')
      .then(setUsage)
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setScanning(false));
  };

  // A plugin block's elements are `fresco/block` nodes holding the block: counted by the block's type.
  const usageOf = (type: string) => {
    const block = /^fresco\/block:(.+)$/.exec(type)?.[1];
    return usage?.types[block ?? type];
  };
  const isOn = (type: string) => !(disabled ?? []).includes(type);
  const toggle = (type: string, on: boolean) =>
    setDisabled((list) =>
      on ? (list ?? []).filter((x) => x !== type) : [...new Set([...(list ?? []), type])],
    );
  const dirty = JSON.stringify([...(disabled ?? [])].sort()) !== JSON.stringify([...saved].sort());
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const value = normalizeElementManager(
        await coreApi<unknown>('PUT', '/ext/fresco/element-manager', { disabled }),
      );
      setDisabled(value.disabled);
      setSaved(value.disabled);
      notify(t('The Element manager was saved.'), 'success');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const q = search.trim().toLowerCase();
  const shown = elements.filter((e) => {
    if (q && !t(e.title).toLowerCase().includes(q) && !e.title.toLowerCase().includes(q))
      return false;
    if (show === 'active') return isOn(e.type);
    if (show === 'inactive') return !isOn(e.type);
    if (show === 'unused') return usage !== null && !usageOf(e.type);
    return true;
  });
  const unused = usage
    ? elements.filter((e) => e.type !== 'fresco/container' && !usageOf(e.type) && isOn(e.type))
    : [];

  return (
    <div className="frx-em">
      <style>{CSS}</style>
      <AdminDialogs />
      <h1>{t('Element manager')}</h1>
      <p className="lead">
        {t(
          'The elements the editor offers. Switch off those your site does not need: they leave the editor’s panel, and the pages that have them keep showing them.',
        )}
      </p>
      <div className="bar">
        <input
          type="search"
          placeholder={t('Search elements…')}
          aria-label={t('Search elements')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label={t('Show')}
          value={show}
          onChange={(e) => setShow(e.target.value as Show)}
        >
          <option value="all">{t('All elements')}</option>
          <option value="active">{t('Active')}</option>
          <option value="inactive">{t('Switched off')}</option>
          <option value="unused" disabled={!usage}>
            {t('Not used')}
          </option>
        </select>
        <button type="button" className="btn" disabled={scanning} onClick={scan}>
          {scanning ? t('Counting…') : usage ? t('Count again') : t('Count the usage')}
        </button>
        {unused.length > 0 && (
          <button
            type="button"
            className="btn"
            onClick={() =>
              setDisabled((list) => [...new Set([...(list ?? []), ...unused.map((e) => e.type)])])
            }
          >
            {t('Switch off the {count} not used', { count: String(unused.length) })}
          </button>
        )}
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || !dirty || disabled === null}
          onClick={() => void save()}
        >
          {t('Save changes')}
        </button>
      </div>
      {usage && (
        <p className="muted">
          {t('Counted in {count} Fresco documents (pages, posts and templates).', {
            count: String(usage.documents),
          })}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {disabled === null && !error ? (
        <p className="muted">{t('Loading…')}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('Element')}</th>
              <th>{t('Plugin')}</th>
              <th>{t('Usage')}</th>
              <th>{t('Status')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((element) => {
              const on = isOn(element.type);
              const used = usageOf(element.type);
              const locked = element.type === 'fresco/container';
              return (
                <tr key={element.type} className={on ? '' : 'off'} data-type={element.type}>
                  <td className="name">
                    <Svg path={element.icon} size={20} />
                    {t(element.title)}
                  </td>
                  <td className="muted">
                    {pluginName(elementSource(element.type))}
                    {element.atomic ? ` · ${t('atomic')}` : ''}
                  </td>
                  <td className="muted">
                    {!usage
                      ? '—'
                      : used
                        ? t('{count} in {documents} documents', {
                            count: String(used.elements),
                            documents: String(used.documents),
                          })
                        : t('Not used')}
                  </td>
                  <td>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={locked}
                        aria-label={t('{element} in the editor', { element: t(element.title) })}
                        onChange={(e) => toggle(element.type, e.target.checked)}
                      />
                      {on ? t('Active') : t('Switched off')}
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
