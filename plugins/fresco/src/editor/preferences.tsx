/**
 * User preferences (Ctrl+Shift+U), as in other builders: the editor's
 * colors, where "Exit" goes and the panel's width. They are the user's own,
 * on every page and in every browser.
 */
import { useT } from '@cleitext/admin-sdk';
import { PANEL_WIDTH } from './prefs-model.js';
import { useStore, type Store } from './store.js';

export function PreferencesView({ store }: { store: Store }) {
  const { t } = useT();
  const prefs = useStore(store, (s) => s.prefs);
  const set = store.actions.setPrefs;
  const width = prefs.panelWidth ?? PANEL_WIDTH.initial;
  return (
    <div className="fre-prefs">
      <p className="fre-help">{t('Your own settings of the editor, on every page.')}</p>
      <h4 className="fre-subheading">{t('Appearance')}</h4>
      <div className="fre-control fre-control--inline">
        <div className="fre-control__head">
          <span className="fre-control__label">{t('Editor theme')}</span>
        </div>
        <div className="fre-control__body">
          <span className="fre-choose" role="group" aria-label={t('Editor theme')}>
            {(
              [
                ['auto', 'Auto'],
                ['light', 'Light'],
                ['dark', 'Dark'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={prefs.theme === value}
                className={prefs.theme === value ? 'is-on' : ''}
                onClick={() => set({ theme: value })}
              >
                {t(label)}
              </button>
            ))}
          </span>
        </div>
      </div>
      <p className="fre-help">{t('Auto follows the colors of your system.')}</p>
      <div className="fre-control">
        <div className="fre-control__head">
          <span className="fre-control__label">{t('Panel width')}</span>
          <span className="fre-mono">{width}px</span>
        </div>
        <span className="fre-slider">
          <input
            type="range"
            aria-label={t('Panel width')}
            min={PANEL_WIDTH.min}
            max={PANEL_WIDTH.max}
            step={10}
            value={width}
            onChange={(e) => set({ panelWidth: Number(e.target.value) })}
          />
          <button
            type="button"
            className="fre-reset"
            title={t('Reset')}
            aria-label={t('Reset {control}', { control: t('Panel width') })}
            onClick={() => set({ panelWidth: undefined })}
          >
            ↺
          </button>
        </span>
      </div>
      <h4 className="fre-subheading">{t('Navigation')}</h4>
      <div className="fre-control fre-control--inline">
        <div className="fre-control__head">
          <span className="fre-control__label">{t('Exit to')}</span>
        </div>
        <div className="fre-control__body">
          <select
            className="fre-input"
            aria-label={t('Exit to')}
            value={prefs.exitTo}
            onChange={(e) => set({ exitTo: e.target.value as typeof prefs.exitTo })}
          >
            <option value="list">{t('The list of entries')}</option>
            <option value="page">{t('The page on the site')}</option>
            <option value="dashboard">{t('The dashboard')}</option>
          </select>
        </div>
      </div>
      <p className="fre-help">
        {t('Where the menu’s Exit takes you. The page on the site once it is published.')}
      </p>
    </div>
  );
}
