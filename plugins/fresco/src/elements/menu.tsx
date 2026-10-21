/** Nav menu: one of the site's menus (by theme location), with dropdowns and a mobile toggle. */
import { advancedControls, ElementRoot, UNITS } from '../core/common.js';
import { ALIGN, content, groups, style } from '../core/controls.js';
import { Icon } from '../core/icons.js';
import { uiText } from '../core/ui-text.js';
import { MAX_WIDTH_DEVICES } from '../core/model.js';
import type { ElementDefinition, MenuItem } from '../core/model.js';

function Items({ items, level, arrow }: { items: MenuItem[]; level: number; arrow: unknown }) {
  return (
    <ul className={level === 0 ? 'fr-menu__list' : 'fr-menu__sub'}>
      {items.map((item) => {
        // `current` is also set on the items above the current page: those
        // are its ancestors, not the current item (Elementor, WordPress).
        const ancestor = item.current && item.children.some((child) => child.current);
        const current = item.current && !ancestor;
        return (
          <li
            key={item.id}
            className={`fr-menu__item${current ? ' is-current' : ''}${ancestor ? ' is-current-ancestor' : ''}${item.children.length ? ' has-children' : ''}`}
          >
            <a
              className="fr-menu__link"
              href={/^(https?:\/\/|\/|#|mailto:|tel:)/.test(item.url) ? item.url : '#'}
              {...(item.target ? { target: '_blank', rel: 'noopener' } : {})}
              {...(current ? { 'aria-current': 'page' as const } : {})}
            >
              {item.label}
              {arrow && item.children.length > 0 ? (
                <span className="fr-menu__arrow" aria-hidden="true">
                  <Icon value={arrow} />
                </span>
              ) : null}
            </a>
            {item.children.length > 0 && (
              <>
                <button
                  type="button"
                  className="fr-menu__expand"
                  aria-expanded="false"
                  aria-label={`Open ${item.label}`}
                  data-fr-expand=""
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
                <Items items={item.children} level={level + 1} arrow={arrow} />
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const POINTERS = ['underline', 'overline', 'double', 'framed', 'background'];

export const navMenu: ElementDefinition = {
  type: 'fresco/nav-menu',
  title: 'Nav menu',
  icon: 'M4 6h16 M4 12h16 M4 18h16',
  category: 'site',
  keywords: ['menu', 'navigation', 'nav', 'header'],
  handler: 'menu',
  controls: [
    content.text('location', 'Menu location', 'Menu', {
      default: 'primary',
      help: 'The theme location the menu is assigned to in Appearance → Menus, e.g. primary or footer.',
    }),
    content.choose('layout', 'Layout', 'Menu', {
      default: 'horizontal',
      options: [
        { value: 'horizontal', label: 'Horizontal', icon: 'M4 12h4 M10 12h4 M16 12h4' },
        { value: 'vertical', label: 'Vertical', icon: 'M12 5v4 M12 10v4 M12 15v4' },
      ],
      noCss: true,
    }),
    content.choose('align', 'Alignment', 'Menu', {
      responsive: true,
      options: [
        ...ALIGN.map((o) => ({
          ...o,
          value: o.value === 'left' ? 'flex-start' : o.value === 'right' ? 'flex-end' : 'center',
        })),
        { value: 'space-between', label: 'Justify', icon: 'M4 6h16 M4 12h16 M4 18h16' },
      ],
      selectors: { '{{el}} .fr-menu__list': 'justify-content: {{value}}' },
    }),
    // Every breakpoint of the site (the editor lists only those in use).
    content.select('toggle', 'Mobile toggle up to', 'Menu', {
      default: 'mobile',
      options: [
        { value: 'mobile', label: 'Mobile' },
        { value: 'mobile_extra', label: 'Mobile extra' },
        { value: 'tablet', label: 'Tablet' },
        { value: 'tablet_extra', label: 'Tablet extra' },
        { value: 'laptop', label: 'Laptop' },
        { value: 'none', label: 'Never' },
      ],
      noCss: true,
    }),
    groups.typography('typography', 'Typography', 'Links', '{{el}} .fr-menu__link'),
    style.color('link_color', 'Color', 'Links', {
      hover: true,
      selectors: { '{{el}} .fr-menu__list > li > .fr-menu__link': 'color: {{value}}' },
    }),
    style.color('current_color', 'Current page color', 'Links', {
      selectors: { '{{el}} .fr-menu__list > .is-current > .fr-menu__link': 'color: {{value}}' },
    }),
    style.slider('spacing', 'Space between', 'Links', {
      responsive: true,
      units: ['px'],
      max: 80,
      selectors: { '{{el}} .fr-menu__list': 'gap: {{value}}' },
    }),
    content.icon('indicator', 'Submenu indicator', 'Menu', {
      help: 'Shown in the link of items with a submenu. Empty: a small arrow beside the link.',
    }),
    style.select('pointer', 'Pointer', 'Links', {
      default: '',
      noCss: true,
      options: [
        { value: '', label: 'None' },
        { value: 'underline', label: 'Underline' },
        { value: 'overline', label: 'Overline' },
        { value: 'double', label: 'Double line' },
        { value: 'framed', label: 'Framed' },
        { value: 'background', label: 'Background' },
      ],
    }),
    style.color('pointer_color', 'Pointer color', 'Links', {
      selectors: { '{{el}}': '--fr-menu-pointer: {{value}}' },
    }),
    style.slider('pointer_width', 'Pointer width', 'Links', {
      units: ['px'],
      max: 20,
      selectors: { '{{el}}': '--fr-menu-pointer-width: {{value}}' },
    }),
    style.box('link_padding', 'Padding', 'Links', {
      responsive: true,
      units: UNITS.box,
      selectors: { '{{el}} .fr-menu__link': 'padding: {{top}} {{right}} {{bottom}} {{left}}' },
    }),
    style.color('sub_bg', 'Background', 'Dropdown', {
      selectors: { '{{el}} .fr-menu__sub': 'background-color: {{value}}' },
    }),
    style.color('sub_color', 'Link color', 'Dropdown', {
      hover: true,
      selectors: { '{{el}} .fr-menu__sub .fr-menu__link': 'color: {{value}}' },
    }),
    groups.shadow('sub_shadow', 'Shadow', 'Dropdown', '{{el}} .fr-menu__sub'),
    style.color('toggle_color', 'Toggle color', 'Mobile', {
      selectors: { '{{el}} .fr-menu__toggle': 'color: {{value}}' },
    }),
    style.color('toggle_bg', 'Toggle background', 'Mobile', {
      selectors: { '{{el}} .fr-menu__toggle': 'background-color: {{value}}' },
    }),
    style.slider('toggle_size', 'Toggle size', 'Mobile', {
      units: ['px'],
      max: 60,
      selectors: { '{{el}} .fr-menu__toggle svg': 'width: {{value}}; height: {{value}}' },
    }),
    style.slider('toggle_padding', 'Toggle padding', 'Mobile', {
      units: ['px', 'em'],
      max: 40,
      selectors: { '{{el}} .fr-menu__toggle': 'padding: {{value}}' },
    }),
    style.slider('toggle_radius', 'Toggle corners', 'Mobile', {
      units: ['px', '%'],
      max: 50,
      selectors: { '{{el}} .fr-menu__toggle': 'border-radius: {{value}}' },
    }),
    content.choose('toggle_align', 'Toggle position', 'Mobile', {
      options: ALIGN.filter((o) => o.value !== 'justify'),
      noCss: true,
    }),
    style.color('mobile_bg', 'Menu background', 'Mobile', {
      selectors: { '{{el}}.is-collapsible .fr-menu__panel': 'background-color: {{value}}' },
    }),
    ...advancedControls(),
  ],
  render({ node, settings, context }) {
    const location = typeof settings.location === 'string' ? settings.location : 'primary';
    const items = context.menus?.[location] ?? [];
    const vertical = settings.layout === 'vertical';
    const indicator = settings.indicator as { name?: string } | undefined;
    const arrow = indicator?.name ? indicator : null;
    const toggle = [...MAX_WIDTH_DEVICES, 'none'].includes(settings.toggle as string)
      ? String(settings.toggle)
      : 'mobile';
    if (items.length === 0) {
      return (
        <ElementRoot node={node} settings={settings} name="fr-menu" editing={context.editing}>
          {context.editing ? (
            <p className="fr-menu__empty">
              No menu in the location “{location}”: assign one in Appearance → Menus.
            </p>
          ) : null}
        </ElementRoot>
      );
    }
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name={[
          'fr-menu',
          `fr-menu--${vertical ? 'vertical' : 'horizontal'}`,
          `fr-menu--toggle-${toggle}`,
          arrow ? 'fr-menu--arrows' : '',
          ['center', 'right'].includes(settings.toggle_align as string)
            ? `fr-menu--toggle-at-${settings.toggle_align}`
            : '',
          POINTERS.includes(settings.pointer as string)
            ? `fr-menu--pointer-${settings.pointer}`
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        editing={context.editing}
        tag="nav"
        extra={{ 'data-fr-handler': 'menu', 'aria-label': location }}
      >
        {toggle !== 'none' && (
          <button
            type="button"
            className="fr-menu__toggle"
            aria-expanded="false"
            aria-label={uiText(context.locale, 'Menu')}
            data-fr-toggle=""
          >
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path
                d="M4 7h16 M4 12h16 M4 17h16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        <div className="fr-menu__panel">
          <Items items={items} level={0} arrow={arrow} />
        </div>
      </ElementRoot>
    );
  },
};
