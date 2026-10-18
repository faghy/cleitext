import { BaseControl, Button, Dropdown, SearchControl } from '@wordpress/components';
import { useState } from 'react';
import { Icon, iconNames } from '../../lib/icons';
import { value, type Bind } from './bind';

/** An icon of Font Awesome Free, chosen from a searchable grid. */
export function IconPicker({
  bind,
  name,
  label = 'Icon',
}: {
  bind: Bind;
  name: string;
  label?: string;
}) {
  const current = String(value(bind, name) ?? '');
  const [search, setSearch] = useState('');
  const names = iconNames();
  const found = names
    .filter((n) => !search || n.includes(search.toLowerCase().trim()))
    .slice(0, 240);
  return (
    <BaseControl __nextHasNoMarginBottom className="pr-icon-picker">
      <div className="pr-color__row">
        <span className="pr-label">{label}</span>
        <Dropdown
          popoverProps={{ placement: 'left-start', offset: 36 }}
          renderToggle={({ isOpen, onToggle }) => (
            <Button
              className="pr-icon-picker__toggle"
              onClick={onToggle}
              aria-expanded={isOpen}
              label={`${label}: ${current || 'none'}`}
            >
              {current ? <Icon name={current} /> : 'Choose'}
            </Button>
          )}
          renderContent={({ onClose }) => (
            <div className="pr-icon-picker__popover">
              <SearchControl
                __nextHasNoMarginBottom
                value={search}
                onChange={setSearch}
                placeholder="Search icons"
              />
              <div className="pr-icon-picker__grid" role="listbox" aria-label="Icons">
                {found.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="option"
                    aria-selected={n === current}
                    title={n}
                    className={n === current ? 'is-selected' : ''}
                    onClick={() => {
                      bind.setAttributes({ [name]: n });
                      onClose();
                    }}
                  >
                    <Icon name={n} />
                  </button>
                ))}
              </div>
              {current && (
                <Button
                  variant="link"
                  isDestructive
                  onClick={() => bind.setAttributes({ [name]: '' })}
                >
                  Remove icon
                </Button>
              )}
            </div>
          )}
        />
      </div>
    </BaseControl>
  );
}
