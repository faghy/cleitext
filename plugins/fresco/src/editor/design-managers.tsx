/**
 * Site settings → Variables manager and Class manager (Elementor 4's editor
 * tools). Variables: named colors, fonts and sizes (`var(--fr-v-<id>)`),
 * renamed freely (elements refer to the id), deleted softly (elements keep
 * their look, the variable can be restored), imported from the global colors
 * and fonts. Classes: listed by priority (the top one wins), dragged to
 * reorder, renamed, duplicated and deleted, with how many elements use them.
 */
import { api as coreApi, t as tr, useT } from '@cleitext/admin-sdk';
import { useEffect, useState } from 'react';
import type { Variable } from '../core/atomic.js';
import {
  classesByPriority,
  duplicateClass,
  freeId,
  moveClass,
  variablesFromKit,
  type DesignUsage,
} from '../core/design-system.js';
import type { Kit } from '../core/kit.js';
import { DragHandle, useDragReorder } from './controls.js';
import { confirmAction, notify } from './dialogs.js';

type SetKit = (patch: Partial<Kit>) => void;

/** How much the classes and variables are used (counted by the server when asked). */
function useUsage(): DesignUsage | null {
  const [usage, setUsage] = useState<DesignUsage | null>(null);
  useEffect(() => {
    let live = true;
    coreApi<DesignUsage>('GET', '/ext/fresco/design-usage')
      .then((value) => live && setUsage(value))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return usage;
}

const TYPE_NAMES: Record<Variable['type'], string> = {
  color: 'Color',
  font: 'Font',
  size: 'Size',
};

export function VariablesManager({
  kit,
  set,
  readOnly,
}: {
  kit: Kit;
  set: SetKit;
  readOnly: boolean;
}) {
  const { t } = useT();
  const usage = useUsage();
  const [search, setSearch] = useState('');
  const uses = (id: string) => usage?.variables[id]?.uses ?? 0;
  const update = (id: string, patch: Partial<Variable>) =>
    set({ variables: kit.variables.map((v) => (v.id === id ? { ...v, ...patch } : v)) });
  const q = search.trim().toLowerCase();
  const live = kit.variables.filter((v) => !v.deleted && (!q || v.label.toLowerCase().includes(q)));
  const deleted = kit.variables.filter((v) => v.deleted);
  const fromKit = variablesFromKit(kit);
  return (
    <div className="fre-varmanager">
      <p className="fre-help">
        {t(
          'Named colors, fonts and sizes for the Style tab of atomic elements. Change one and every element using it changes.',
        )}
      </p>
      {kit.variables.length > 6 && (
        <input
          className="fre-input"
          placeholder={t('Search variables…')}
          aria-label={t('Search variables')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className="fre-dstable" role="table" aria-label={t('Variables')}>
        {live.map((variable) => (
          <div key={variable.id} className="fre-kitrow fre-dsrow" role="row">
            <span className={`fre-dstype fre-dstype--${variable.type}`} role="cell">
              {variable.type === 'color' ? (
                <span className="fre-swatch" style={{ background: variable.value }} />
              ) : (
                t(TYPE_NAMES[variable.type])
              )}
            </span>
            <input
              className="fre-input"
              value={variable.label}
              disabled={readOnly}
              aria-label={t('Name')}
              onChange={(e) => update(variable.id, { label: e.target.value })}
            />
            {variable.type === 'color' && (
              <input
                type="color"
                disabled={readOnly}
                value={/^#[0-9a-f]{6}$/i.test(variable.value) ? variable.value : '#000000'}
                aria-label={t('Color')}
                onChange={(e) => update(variable.id, { value: e.target.value })}
              />
            )}
            <input
              className="fre-input fre-mono"
              value={variable.value}
              disabled={readOnly}
              aria-label={t('Value')}
              onChange={(e) => update(variable.id, { value: e.target.value })}
            />
            <span className="fre-dsusage" title={t('Uses')}>
              {usage ? uses(variable.id) : '…'}
            </span>
            <button
              type="button"
              className="fre-iconbtn"
              disabled={readOnly}
              aria-label={t('Delete {name}', { name: variable.label })}
              onClick={() =>
                void confirmAction({
                  title: tr('Delete the variable “{name}”?', { name: variable.label }),
                  text:
                    uses(variable.id) > 0
                      ? tr(
                          'It is used {count} times: those elements keep its value, and you can restore it.',
                          { count: uses(variable.id) },
                        )
                      : tr('No element uses it. You can restore it later.'),
                  action: tr('Delete'),
                  danger: true,
                }).then((ok) => ok && update(variable.id, { deleted: true }))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {!readOnly && (
        <div className="fre-library__save">
          {(
            [
              ['color', '#c2410c', 'Color'],
              ['font', 'Inter', 'Font'],
              ['size', '24px', 'Size'],
            ] as const
          ).map(([type, value, label]) => (
            <button
              key={type}
              type="button"
              className="fre-button"
              onClick={() => {
                const name = tr(`New ${label.toLowerCase()}`);
                const id = freeId(
                  `${type}-${name}`,
                  kit.variables.map((v) => v.id),
                  type,
                );
                set({ variables: [...kit.variables, { id, label: name, type, value }] });
              }}
            >
              + {t(label)}
            </button>
          ))}
          <button
            type="button"
            className="fre-button"
            disabled={fromKit.length === 0}
            title={t('One variable for each global color and font not imported yet.')}
            onClick={() => {
              set({ variables: [...kit.variables, ...fromKit] });
              notify(tr('{count} variables imported.', { count: fromKit.length }), 'success');
            }}
          >
            {t('Import global colors and fonts')}
          </button>
        </div>
      )}
      {deleted.length > 0 && (
        <>
          <h4 className="fre-subheading">{t('Deleted variables')}</h4>
          {deleted.map((variable) => (
            <div key={variable.id} className="fre-kitrow fre-dsrow is-deleted">
              <span className="fre-dsname">{variable.label}</span>
              <code className="fre-mono">{variable.value}</code>
              <button
                type="button"
                className="fre-button"
                disabled={readOnly}
                onClick={() => update(variable.id, { deleted: undefined })}
              >
                {t('Restore')}
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function ClassManager({ kit, set, readOnly }: { kit: Kit; set: SetKit; readOnly: boolean }) {
  const { t } = useT();
  const usage = useUsage();
  const [search, setSearch] = useState('');
  const list = classesByPriority(kit.classes);
  const order = useDragReorder((from, to) =>
    set({ classes: moveClass(kit.classes, from, to > from ? to - 1 : to) }),
  );
  const q = search.trim().toLowerCase();
  const count = (id: string) => usage?.classes[id]?.elements ?? 0;
  return (
    <div className="fre-classmanager">
      <p className="fre-help">
        {t(
          'Global classes of atomic elements. Higher in the list means higher priority: its values win over those of the classes below.',
        )}
      </p>
      {list.length === 0 && (
        <p className="fre-empty-note">
          {t('No classes yet: add one in the Style tab of an atomic element.')}
        </p>
      )}
      {list.length > 6 && (
        <input
          className="fre-input"
          placeholder={t('Search classes…')}
          aria-label={t('Search classes')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className={`fre-dstable${order.dragging ? ' is-sorting' : ''}`} ref={order.listRef}>
        {list.map((c, index) => (
          <div
            key={c.id}
            data-reorder=""
            hidden={Boolean(q) && !c.label.toLowerCase().includes(q)}
            className={`fre-kitrow fre-dsrow${order.classOf(index, list.length)}`}
          >
            {!readOnly && !q && (
              <DragHandle
                label={tr('Drag to change the priority (or use the arrow keys)')}
                onPointerDown={(e) => order.start(e, index)}
                onKeyDown={(e) => order.keyDown(e, index, list.length)}
              />
            )}
            <input
              className="fre-input"
              value={c.label}
              disabled={readOnly}
              aria-label={t('Class name')}
              onChange={(e) =>
                set({
                  classes: kit.classes.map((x) =>
                    x.id === c.id ? { ...x, label: e.target.value } : x,
                  ),
                })
              }
            />
            <code className="fre-mono">.fr-g-{c.id}</code>
            <span className="fre-dsusage" title={t('Elements')}>
              {usage ? count(c.id) : '…'}
            </span>
            <button
              type="button"
              className="fre-iconbtn"
              disabled={readOnly}
              title={t('Duplicate')}
              aria-label={t('Duplicate the class {name}', { name: c.label })}
              onClick={() =>
                set({
                  classes: duplicateClass(kit.classes, c.id, tr('{name} copy', { name: c.label })),
                })
              }
            >
              ⧉
            </button>
            <button
              type="button"
              className="fre-iconbtn"
              disabled={readOnly}
              aria-label={t('Delete the class {name}', { name: c.label })}
              onClick={() =>
                void confirmAction({
                  title: tr('Delete the class “{name}”?', { name: c.label }),
                  text:
                    count(c.id) > 0
                      ? tr('{count} elements use it: they keep the name but lose its style.', {
                          count: count(c.id),
                        })
                      : tr('No element uses it.'),
                  action: tr('Delete'),
                  danger: true,
                }).then((ok) => {
                  if (ok) set({ classes: kit.classes.filter((x) => x.id !== c.id) });
                })
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
