/**
 * The editor's own top bar (plugin API 1.27, `chrome: 'none'`): the Fresco
 * menu and tools on the left, the page and the device in the middle, the
 * structure, preview and publish on the right.
 */
import { useT, type EditorHost } from '@cleitext/admin-sdk';
import { useEffect, useRef, useState } from 'react';
import { activeDevices } from '../core/model.js';
import { DEVICE_ICONS, DEVICE_NAMES, Svg } from './controls.js';
import { useStore, type PanelView, type Store } from './store.js';
import { SiteNav } from './site-nav.js';
import { enterSafeMode, leaveSafeMode } from './availability.js';
import { confirmAction } from './dialogs.js';

export const ICONS = {
  logo: 'M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z M9 8h6 M9 12h4 M9 8v8',
  add: 'M12 5v14 M5 12h14',
  page: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  templates: 'M4 5h6v14H4z M12 5h3v14h-3z M17 6l3 1-3 12-3-1z',
  history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v4h4 M12 7v5l3 2',
  structure: 'M12 3l9 4.5-9 4.5-9-4.5z M3 12l9 4.5 9-4.5 M3 16.5L12 21l9-4.5',
  preview: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  caret: 'M6 9l6 6 6-6',
  site: 'M12 3a9 9 0 0 0 0 18c1.2 0 1.9-1 1.5-2-.5-1.3.4-2.3 1.7-2.3H17a4 4 0 0 0 4-4C21 7.3 17 3 12 3z M7 11.5h.01 M10.5 7.5h.01 M15 9h.01',
  exit: 'M15 18l-6-6 6-6',
  keyboard: 'M3 7h18v10H3z M7 11h.01 M11 11h.01 M15 11h.01 M8 14h8',
  safe: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3 M12 17h.01',
  entry: 'M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6',
  theme: 'M4 4h16v5H4z M4 11h7v9H4z M13 11h7v9h-7z',
  finder: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  prefs: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
} as const;

export interface TopBarProps {
  store: Store;
  host: EditorHost;
  /** The user may open the site settings and the theme builder. */
  canManageKit: boolean;
  /** Fresco Pro's theme builder, when it is there for this user. */
  themeBuilderUrl: string | null;
  openSettings: () => void;
  saveAsTemplate: () => void;
  /** Opens the Finder (Ctrl+E). */
  openFinder: () => void;
  /** The page's public address once it is published, for "View page". */
  viewUrl: string | null;
  /** Where "Exit" goes (User preferences). */
  exit: { url: string; label: string };
  /** Opens another admin address (another entry). */
  navigate: (to: string) => void;
  /** Saves and copies the page's preview link. */
  copyShare: () => Promise<void>;
}

export function TopBar({
  store,
  host,
  canManageKit,
  themeBuilderUrl,
  openSettings,
  saveAsTemplate,
  openFinder,
  viewUrl,
  exit,
  navigate,
  copyShare,
}: TopBarProps) {
  const { t } = useT();
  const view = useStore(store, (s) => s.view);
  const device = useStore(store, (s) => s.device);
  const breakpoints = useStore(store, (s) => s.kit.breakpoints);
  const navigator = useStore(store, (s) => s.navigator);
  const safeMode = useStore(store, (s) => s.safeMode);
  // Re-render on every change so undo/redo know whether they can act.
  useStore(store, (s) => s.blocks);
  useStore(store, (s) => s.page);
  const [menu, setMenu] = useState<'main' | 'publish' | null>(null);

  const tool = (target: PanelView, label: string, icon: string, active = view === target) => (
    <button
      type="button"
      className={`fre-bar__btn${active ? ' is-on' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={() => store.actions.setView(target)}
    >
      <Svg path={icon} size={18} />
    </button>
  );

  const primaryLabel = host.canPublish
    ? host.published
      ? t('Update')
      : t('Publish')
    : host.canSubmit
      ? t('Submit for review')
      : t('Save');
  const primary = () =>
    void (host.canPublish ? host.publish() : host.canSubmit ? host.submit() : host.save());
  // Nothing to update: as in the other builders, the main button rests.
  const idle = host.published && !host.dirty;

  return (
    <header className="fre-bar">
      <div className="fre-bar__side">
        <div className="fre-bar__menuwrap">
          <button
            type="button"
            className={`fre-bar__logo${menu === 'main' ? ' is-on' : ''}`}
            aria-label={t('Fresco menu')}
            aria-haspopup="menu"
            aria-expanded={menu === 'main'}
            onClick={() => setMenu(menu === 'main' ? null : 'main')}
          >
            <Svg path={ICONS.logo} size={20} />
            <Svg path={ICONS.caret} size={12} />
          </button>
          {menu === 'main' && (
            <Dropdown onClose={() => setMenu(null)} align="left">
              {canManageKit && (
                <MenuItem
                  icon={ICONS.site}
                  label={t('Site settings')}
                  onClick={() => store.actions.setView('site')}
                />
              )}
              {themeBuilderUrl && (
                <MenuItem icon={ICONS.theme} label={t('Theme builder')} href={themeBuilderUrl} />
              )}
              <MenuItem icon={ICONS.entry} label={t('Entry settings')} onClick={openSettings} />
              <MenuItem
                icon={ICONS.prefs}
                label={t('User preferences')}
                onClick={() => store.actions.setView('preferences')}
              />
              <MenuItem
                icon={ICONS.keyboard}
                label={t('Keyboard shortcuts')}
                onClick={() => window.dispatchEvent(new Event('fresco:shortcuts'))}
              />
              <MenuItem
                icon={ICONS.safe}
                label={safeMode ? t('Leave Safe mode') : t('Safe mode')}
                onClick={() =>
                  void (async () => {
                    if (
                      host.dirty &&
                      !(await confirmAction({
                        title: safeMode ? t('Leave Safe mode') : t('Safe mode'),
                        text: t('The editor opens again: the changes not saved are lost.'),
                        action: t('Continue'),
                      }))
                    )
                      return;
                    if (safeMode) leaveSafeMode();
                    else enterSafeMode();
                    window.location.reload();
                  })()
                }
              />
              <MenuItem
                icon={ICONS.help}
                label={t('Help')}
                href="https://github.com/faghy/cleitext/blob/main/docs/FRESCO.md"
                external
              />
              <hr />
              <MenuItem icon={ICONS.exit} label={exit.label} href={exit.url} />
            </Dropdown>
          )}
        </div>
        <span className="fre-bar__sep" />
        {tool('elements', t('Add element'), ICONS.add, view === 'elements' || view === 'element')}
        {tool('library', t('Templates'), ICONS.templates)}
        {tool('history', t('History (Ctrl+Shift+H)'), ICONS.history)}
        {tool('page', t('Page settings'), ICONS.page)}
      </div>

      <div className="fre-bar__center">
        <input
          className="fre-bar__title"
          value={host.title}
          aria-label={t('Title')}
          placeholder={t('Add title')}
          onChange={(e) => host.setTitle(e.target.value)}
        />
        <SiteNav
          store={store}
          host={host}
          navigate={navigate}
          viewUrl={viewUrl}
          copyShare={copyShare}
        />
        <span className="fre-bar__sep" />
        <div className="fre-bar__devices" role="group" aria-label={t('Preview device')}>
          {activeDevices(breakpoints).map((d) => (
            <button
              key={d}
              type="button"
              className={`fre-bar__btn${device === d ? ' is-on' : ''}`}
              title={t(DEVICE_NAMES[d])}
              aria-label={t(DEVICE_NAMES[d])}
              aria-pressed={device === d}
              onClick={() => store.actions.setDevice(d)}
            >
              <Svg path={DEVICE_ICONS[d]} size={18} />
            </button>
          ))}
        </div>
      </div>

      <div className="fre-bar__side fre-bar__side--end">
        <button
          type="button"
          className="fre-bar__btn"
          title={t('Finder (Ctrl+E)')}
          aria-label={t('Finder')}
          onClick={openFinder}
        >
          <Svg path={ICONS.finder} size={18} />
        </button>
        <button
          type="button"
          className="fre-bar__btn"
          title={t('Undo (Ctrl+Z)')}
          aria-label={t('Undo')}
          disabled={!store.canUndo()}
          onClick={() => store.actions.undo()}
        >
          <Svg path={ICONS.undo} size={18} />
        </button>
        <button
          type="button"
          className="fre-bar__btn"
          title={t('Redo (Ctrl+Shift+Z)')}
          aria-label={t('Redo')}
          disabled={!store.canRedo()}
          onClick={() => store.actions.redo()}
        >
          <Svg path={ICONS.redo} size={18} />
        </button>
        <button
          type="button"
          className={`fre-bar__btn${navigator ? ' is-on' : ''}`}
          title={t('Structure (Ctrl+I)')}
          aria-label={t('Structure')}
          aria-pressed={navigator}
          onClick={() => store.actions.toggleNavigator()}
        >
          <Svg path={ICONS.structure} size={18} />
        </button>
        <button
          type="button"
          className="fre-bar__btn"
          title={t('Preview changes')}
          aria-label={t('Preview changes')}
          disabled={host.busy}
          onClick={() => void host.preview()}
        >
          <Svg path={ICONS.preview} size={18} />
        </button>
        <span className="fre-bar__state" role="status" aria-live="polite">
          {host.busy ? t('Saving…') : host.dirty ? t('Unsaved changes') : ''}
        </span>
        <div className="fre-bar__menuwrap fre-bar__publish">
          <button
            type="button"
            className="fre-bar__primary"
            disabled={host.busy || idle}
            onClick={primary}
          >
            {host.busy && <span className="fre-spinner" aria-hidden="true" />}
            {primaryLabel}
          </button>
          <button
            type="button"
            className="fre-bar__primary fre-bar__more"
            aria-label={t('Save options')}
            aria-haspopup="menu"
            aria-expanded={menu === 'publish'}
            onClick={() => setMenu(menu === 'publish' ? null : 'publish')}
          >
            <Svg path={ICONS.caret} size={14} />
          </button>
          {menu === 'publish' && (
            <Dropdown onClose={() => setMenu(null)} align="right">
              {!host.published && (
                <MenuItem label={t('Save draft')} onClick={() => void host.save()} />
              )}
              <MenuItem label={t('Save as template')} onClick={saveAsTemplate} />
              <MenuItem label={t('Preview changes')} onClick={() => void host.preview()} />
              <MenuItem label={t('Copy and share')} onClick={() => void copyShare()} />
              {viewUrl && (
                <MenuItem icon={ICONS.external} label={t('View page')} href={viewUrl} external />
              )}
              <MenuItem label={t('Entry settings')} onClick={openSettings} />
            </Dropdown>
          )}
        </div>
      </div>
    </header>
  );
}

function Dropdown({
  children,
  onClose,
  align,
}: {
  children: React.ReactNode;
  onClose: () => void;
  align: 'left' | 'right';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className={`fre-dropdown fre-dropdown--${align}`}
      role="menu"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[role=menuitem]')) onClose();
      }}
    >
      {children}
    </div>
  );
}

function MenuItem({
  label,
  icon,
  onClick,
  href,
  external,
}: {
  label: string;
  icon?: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
}) {
  const inner = (
    <>
      {icon ? <Svg path={icon} size={16} /> : <span className="fre-dropdown__noicon" />}
      <span>{label}</span>
    </>
  );
  return href ? (
    <a
      role="menuitem"
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {inner}
    </a>
  ) : (
    <button type="button" role="menuitem" onClick={onClick}>
      {inner}
    </button>
  );
}
