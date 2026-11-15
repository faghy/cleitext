/**
 * Flip box (Fresco 2.12): a front (background, icon, title, text) that turns
 * to a back (title, text, a button with its link) on hover, and on focus or a
 * tap, so keyboards and touch screens get it too. The effect is a 3D flip in
 * one of four directions, or a fade.
 */
import { advancedControls, ElementRoot, UNITS } from '../core/common.js';
import { content, groups, HEADING_TAGS, style, TEXT_ALIGN, textStyle } from '../core/controls.js';
import { Icon } from '../core/icons.js';
import { linkProps } from '../core/links.js';
import { mediaIds } from '../core/media.js';
import type { Control, ElementDefinition, Settings } from '../core/model.js';
import { plainText } from '../core/sanitize.js';

const EFFECTS = ['flip', 'fade'] as const;
const DIRECTIONS = ['left', 'right', 'up', 'down'] as const;

/** Look of one face: background, alignment, padding, title and text. */
function faceStyle(face: 'front' | 'back', section: string): Control[] {
  const at = `{{el}} .fr-flip__${face}`;
  return [
    groups.background(`${face}_bg`, 'Background', section, at),
    style.color(`${face}_overlay`, 'Overlay color', section, {
      selectors: { [`${at}::before`]: 'background-color: {{value}}' },
    }),
    style.choose(`${face}_align`, 'Alignment', section, {
      responsive: true,
      options: TEXT_ALIGN,
      selectors: { [at]: 'text-align: {{value}}' },
    }),
    style.choose(`${face}_vertical`, 'Vertical position', section, {
      options: [
        { value: 'flex-start', label: 'Top' },
        { value: 'center', label: 'Middle' },
        { value: 'flex-end', label: 'Bottom' },
      ],
      selectors: { [at]: 'justify-content: {{value}}' },
    }),
    {
      name: `${face}_padding`,
      type: 'box',
      label: 'Padding',
      tab: 'style',
      section,
      responsive: true,
      units: UNITS.box,
      selectors: { [at]: 'padding: {{top}} {{right}} {{bottom}} {{left}}' },
    },
    ...textStyle(`${face}_title_`, 'Title', `${at} .fr-flip__title`),
    ...textStyle(`${face}_text_`, 'Text', `${at} .fr-flip__text`),
  ];
}

const controls: Control[] = [
  // ---- Content: front
  content.icon('front_icon', 'Icon', 'Front side', { default: { set: 'solid', name: 'star' } }),
  content.text('front_title', 'Title', 'Front side', { default: 'This is the heading' }),
  content.textarea('front_text', 'Text', 'Front side', {
    default: 'Tell visitors what this is about, in a sentence or two.',
  }),
  // ---- Content: back
  content.text('back_title', 'Title', 'Back side', { default: 'This is the heading' }),
  content.textarea('back_text', 'Text', 'Back side', {
    default: 'Tell visitors what this is about, in a sentence or two.',
  }),
  content.text('button_text', 'Button text', 'Back side', { default: 'Click here' }),
  content.url('link', 'Link', 'Back side'),
  // ---- Content: settings
  content.slider('height', 'Height', 'Settings', {
    responsive: true,
    default: { size: 280, unit: 'px' },
    units: UNITS.height,
    max: 1000,
    selectors: { '{{el}} .fr-flip': 'height: {{value}}' },
  }),
  content.slider('radius', 'Border radius', 'Settings', {
    units: ['px', '%'],
    max: 100,
    selectors: { '{{el}} .fr-flip': '--fr-flip-radius: {{value}}' },
  }),
  content.select('effect', 'Effect', 'Settings', {
    default: 'flip',
    options: [
      { value: 'flip', label: 'Flip' },
      { value: 'fade', label: 'Fade' },
    ],
    noCss: true,
  }),
  content.select('direction', 'Direction', 'Settings', {
    default: 'left',
    options: [
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
      { value: 'up', label: 'Up' },
      { value: 'down', label: 'Down' },
    ],
    condition: { effect: 'flip' },
    noCss: true,
  }),
  content.slider('duration', 'Duration (s)', 'Settings', {
    units: ['s'],
    max: 3,
    step: 0.1,
    selectors: { '{{el}} .fr-flip': '--fr-flip-duration: {{value}}' },
  }),
  content.select('title_tag', 'Title HTML tag', 'Settings', {
    default: 'h3',
    options: HEADING_TAGS,
    noCss: true,
  }),
  // ---- Style
  ...faceStyle('front', 'Front side'),
  style.color('icon_color', 'Icon color', 'Front side', {
    selectors: { '{{el}} .fr-flip__icon': 'color: {{value}}; fill: {{value}}' },
  }),
  style.slider('icon_size', 'Icon size', 'Front side', {
    responsive: true,
    units: ['px', 'em'],
    max: 200,
    selectors: { '{{el}} .fr-flip__icon': 'font-size: {{value}}' },
  }),
  ...faceStyle('back', 'Back side'),
  style.color('button_color', 'Text color', 'Button', {
    hover: true,
    selectors: { '{{el}} .fr-flip__button': 'color: {{value}}' },
  }),
  style.color('button_bg', 'Background color', 'Button', {
    hover: true,
    selectors: { '{{el}} .fr-flip__button': 'background-color: {{value}}' },
  }),
  groups.typography('button_typography', 'Typography', 'Button', '{{el}} .fr-flip__button'),
  groups.border('button_border', 'Border', 'Button', '{{el}} .fr-flip__button'),
  {
    name: 'button_padding',
    type: 'box',
    label: 'Padding',
    tab: 'style',
    section: 'Button',
    responsive: true,
    units: UNITS.box,
    selectors: { '{{el}} .fr-flip__button': 'padding: {{top}} {{right}} {{bottom}} {{left}}' },
  },
  ...advancedControls(),
];

const TITLE_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'p'] as const;

function titleTag(settings: Settings): (typeof TITLE_TAGS)[number] {
  return TITLE_TAGS.includes(settings.title_tag as never)
    ? (settings.title_tag as (typeof TITLE_TAGS)[number])
    : 'h3';
}

export const flipBox: ElementDefinition = {
  type: 'fresco/flip-box',
  title: 'Flip box',
  icon: 'M4 5h9v14H4z M16 7l4 2v10l-4 2 M13 12h3',
  category: 'general',
  keywords: ['flip', 'card', 'hover', 'reveal', 'turn'],
  controls,
  media: (settings) => mediaIds(settings.front_bg_image, settings.back_bg_image),
  render({ node, settings, context }) {
    const effect = EFFECTS.includes(settings.effect as never) ? String(settings.effect) : 'flip';
    const direction = DIRECTIONS.includes(settings.direction as never)
      ? String(settings.direction)
      : 'left';
    const Title = titleTag(settings);
    const link = linkProps(settings.link);
    const editing = context.editing;
    const frontTitle = plainText(settings.front_title);
    const frontText = plainText(settings.front_text);
    const backTitle = plainText(settings.back_title);
    const backText = plainText(settings.back_text);
    const buttonText = plainText(settings.button_text);
    const button = buttonText ? (
      link ? (
        <a className="fr-flip__button" {...link}>
          {buttonText}
        </a>
      ) : (
        <span className="fr-flip__button">{buttonText}</span>
      )
    ) : null;
    return (
      <ElementRoot
        node={node}
        settings={settings}
        name="fr-flip-box"
        editing={editing}
        extra={editing ? undefined : { 'data-fr-handler': 'flip-box' }}
      >
        {/* Focusable (keyboard, tap): focus turns it as hover does. */}
        <div
          className={`fr-flip fr-flip--${effect}${effect === 'flip' ? ` fr-flip--${direction}` : ''}`}
          tabIndex={0}
          role="group"
          aria-label={frontTitle || backTitle || undefined}
        >
          <div className="fr-flip__inner">
            <div className="fr-flip__face fr-flip__front">
              <div className="fr-flip__content">
                {settings.front_icon ? (
                  <span className="fr-flip__icon">
                    <Icon value={settings.front_icon} />
                  </span>
                ) : null}
                {frontTitle && <Title className="fr-flip__title">{frontTitle}</Title>}
                {frontText && <p className="fr-flip__text">{frontText}</p>}
              </div>
            </div>
            <div className="fr-flip__face fr-flip__back">
              <div className="fr-flip__content">
                {backTitle && <Title className="fr-flip__title">{backTitle}</Title>}
                {backText && <p className="fr-flip__text">{backText}</p>}
                {button}
              </div>
            </div>
          </div>
        </div>
      </ElementRoot>
    );
  },
};
