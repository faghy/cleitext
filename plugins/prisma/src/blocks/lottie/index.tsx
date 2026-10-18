import type { Device, Sheet } from '@cleitext/design';
import { mediaUrl } from '../../lib/background';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px } from '../../lib/emit';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';

const DEFAULTS: Attrs = {
  lottieSource: 'library',
  jsonLottie: { url: '' },
  lottieURl: '',
  align: 'center',
  loop: true,
  speed: 1,
  reverse: false,
  playOn: 'none',
  playOnHover: false,
  width: '',
  widthTablet: '',
  widthMob: '',
  height: '',
  heightTablet: '',
  heightMob: '',
  backgroundColor: '',
  backgroundHColor: '',
};

const SUFFIX: Record<Device, string> = { desktop: '', tablet: 'Tablet', mobile: 'Mob' };

function css(a: Attrs, B: string, sheet: Sheet): void {
  const R = `${B}.pr-lottie`;
  for (const device of DEVICES) {
    const s = SUFFIX[device];
    emit(sheet, device, R, {
      width: px(a[`width${s}`]),
      height: px(a[`height${s}`]),
      ...(device === 'desktop'
        ? { overflow: 'hidden', outline: 'none', 'background-color': a.backgroundColor }
        : {}),
    });
  }
  emit(sheet, 'desktop', `${R}:hover`, { background: a.backgroundHColor });
}

/** The animation's JSON file: its address (also set by the media library), else the library file's. */
export const lottieUrl = (a: Attrs): string => mediaUrl(a.lottieURl) || mediaUrl(a.jsonLottie);

const PLAY_ON = new Set(['none', 'hover', 'click', 'scroll']);

/** What the site's script needs (`data-pr-lottie`). */
export function lottieConfig(a: Attrs) {
  const speed = numeric(a.speed);
  return {
    src: lottieUrl(a),
    loop: a.loop !== false,
    speed: speed !== null && speed > 0 ? speed : 1,
    // Backwards only when looping, as the pages it replaces.
    reverse: Boolean(a.reverse) && a.loop !== false,
    playOn: PLAY_ON.has(String(a.playOn)) ? String(a.playOn) : 'none',
  };
}

function View({ attrs: a, id, root, editing }: ViewProps) {
  const align = ['left', 'center', 'right'].includes(String(a.align)) ? String(a.align) : 'center';
  const config = lottieConfig(a);
  const className = [
    'wp-block-prisma-lottie',
    'pr-lottie',
    blockClass(id),
    `pr-lottie--${align}`,
  ].join(' ');
  if (editing)
    // The editor shows where the animation goes; it plays on the site.
    return root(
      'div',
      { className },
      <div className="pr-lottie__placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-2 14.5v-9l7 4.5-7 4.5Z" />
        </svg>
        <span>{config.src ? config.src.split('/').pop() : 'Choose a Lottie animation (JSON)'}</span>
      </div>,
    );
  if (!config.src) return root('div', { className }, null);
  return root(
    'div',
    { className },
    <div className="pr-lottie__player" data-pr-lottie={JSON.stringify(config)} />,
  );
}

export const lottie: PrismaBlock = {
  name: 'lottie',
  title: 'Lottie Animation',
  description:
    'A Lottie animation from a JSON file: looped, faster or backwards, playing on hover, click or when in view.',
  keywords: ['lottie', 'animation', 'json', 'motion'],
  defaults: DEFAULTS,
  css,
  View,
  script: { file: 'lottie.js', marker: 'data-pr-lottie' },
  media: (a) => {
    const id = (a.jsonLottie as { id?: unknown } | null)?.id;
    return typeof id === 'string' ? [id] : [];
  },
  spectra: {
    'uagb/lottie': (a, src) => [src.block('lottie', a)],
  },
};
