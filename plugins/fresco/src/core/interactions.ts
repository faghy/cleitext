/**
 * Interactions of atomic elements, as in Elementor 4: a short list of
 * animations, each started by a trigger (the page loading, or the element
 * scrolling into view) with an effect (fade, slide, scale) that brings the
 * element in or takes it out, with its duration, delay and easing. Kept in
 * `_interactions`; the page gets them in `data-fr-ia` and frontend.js plays
 * them with the Web Animations API.
 */

export type InteractionTrigger = 'load' | 'scrollIn';
export type InteractionEffect = 'fade' | 'slide' | 'scale';
export type InteractionType = 'in' | 'out';
export type InteractionDirection = '' | 'left' | 'right' | 'top' | 'bottom';
export type InteractionEasing = 'easeIn' | 'easeOut' | 'easeInOut' | 'linear';

export interface Interaction {
  id: string;
  trigger: InteractionTrigger;
  effect: InteractionEffect;
  type: InteractionType;
  direction: InteractionDirection;
  /** Milliseconds. */
  duration: number;
  /** Milliseconds. */
  delay: number;
  easing: InteractionEasing;
}

export const TRIGGERS: InteractionTrigger[] = ['load', 'scrollIn'];
export const EFFECTS: InteractionEffect[] = ['fade', 'slide', 'scale'];
export const DIRECTIONS: InteractionDirection[] = ['', 'left', 'right', 'top', 'bottom'];
export const EASINGS: InteractionEasing[] = ['easeIn', 'easeOut', 'easeInOut', 'linear'];

/** Elementor's defaults: 600 ms, no delay, ease-in, slides of 100px, scales from 0. */
export const DEFAULT_DURATION = 600;
export const SLIDE_DISTANCE = 100;
export const SCALE_START = 0;

const MAX = 10;

export function newInteraction(id: string): Interaction {
  return {
    id,
    trigger: 'scrollIn',
    effect: 'fade',
    type: 'in',
    direction: '',
    duration: DEFAULT_DURATION,
    delay: 0,
    easing: 'easeIn',
  };
}

const pick = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  list.includes(value as T) ? (value as T) : fallback;

const ms = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(10000, Math.round(n))) : fallback;
};

/** Keeps only well-formed interactions (from a document or the importer). */
export function normalizeInteractions(value: unknown): Interaction[] {
  if (!Array.isArray(value)) return [];
  const out: Interaction[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const v = raw as Record<string, unknown>;
    const effect = pick(EFFECTS, v.effect, 'fade');
    out.push({
      id: typeof v.id === 'string' && /^[\w-]{1,40}$/.test(v.id) ? v.id : `i${out.length + 1}`,
      trigger: pick(TRIGGERS, v.trigger, 'load'),
      effect,
      type: pick(['in', 'out'] as const, v.type, 'in'),
      direction: pick(DIRECTIONS, v.direction, effect === 'slide' ? 'bottom' : ''),
      duration: ms(v.duration, DEFAULT_DURATION),
      delay: ms(v.delay, 0),
      easing: pick(EASINGS, v.easing, 'easeIn'),
    });
    if (out.length >= MAX) break;
  }
  return out;
}

/** The CSS timing function of an easing. */
export function easingCss(easing: InteractionEasing): string {
  return easing === 'easeOut'
    ? 'ease-out'
    : easing === 'easeInOut'
      ? 'ease-in-out'
      : easing === 'linear'
        ? 'linear'
        : 'ease-in';
}

/**
 * The two keyframes of an interaction (hidden → shown for "in", the reverse
 * for "out"), with the individual `translate` and `scale` properties so the
 * element's own transform is kept.
 */
export function interactionKeyframes(item: Interaction): [Keyframe, Keyframe] {
  const hidden: Keyframe = {};
  const shown: Keyframe = {};
  if (item.effect === 'fade') {
    hidden.opacity = 0;
    shown.opacity = 1;
  }
  if (item.effect === 'scale') {
    hidden.scale = String(SCALE_START);
    shown.scale = '1';
  }
  if (item.direction) {
    const d = SLIDE_DISTANCE;
    const x = item.direction === 'left' ? -d : item.direction === 'right' ? d : 0;
    const y = item.direction === 'top' ? -d : item.direction === 'bottom' ? d : 0;
    hidden.translate = `${x}px ${y}px`;
    shown.translate = '0px 0px';
  }
  return item.type === 'in' ? [hidden, shown] : [shown, hidden];
}

/** The `data-fr-ia` attribute of an element: its interactions, compact. */
export function interactionsAttribute(value: unknown): string | null {
  const list = normalizeInteractions(value);
  if (list.length === 0) return null;
  return JSON.stringify(
    list.map((i) => [i.trigger, i.effect, i.type, i.direction, i.duration, i.delay, i.easing]),
  );
}

/** Whether an element waits hidden for one of its interactions to bring it in. */
export function waitsHidden(value: unknown): boolean {
  return normalizeInteractions(value).some((i) => i.type === 'in');
}

/** Reads `data-fr-ia` back (frontend.js). */
export function parseInteractionsAttribute(text: string | null): Interaction[] {
  if (!text) return [];
  try {
    const rows = JSON.parse(text) as unknown[];
    if (!Array.isArray(rows)) return [];
    return normalizeInteractions(
      rows.map((row, i) => {
        const [trigger, effect, type, direction, duration, delay, easing] = Array.isArray(row)
          ? row
          : [];
        return { id: `i${i}`, trigger, effect, type, direction, duration, delay, easing };
      }),
    );
  } catch {
    return [];
  }
}

/**
 * Plays the interactions of an element: on load at once, on scroll the first
 * time it comes into view. With reduced motion the element just shows.
 */
export function playInteractions(element: HTMLElement, list: Interaction[]): void {
  const win = element.ownerDocument.defaultView ?? window;
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const reveal = () => element.removeAttribute('data-fr-ia-wait');
  if (reduced || typeof element.animate !== 'function') {
    reveal();
    return;
  }
  for (const item of list) {
    const frames = interactionKeyframes(item);
    const play = () => {
      element.animate(frames, {
        duration: item.duration,
        delay: item.delay,
        easing: easingCss(item.easing),
        fill: item.type === 'in' ? 'backwards' : 'forwards',
      });
      reveal();
    };
    if (item.trigger === 'scrollIn' && 'IntersectionObserver' in win) {
      // Until it comes into view an "in" element waits hidden (`data-fr-ia-wait`, fresco.css).
      const observer = new win.IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        play();
      });
      observer.observe(element);
    } else play();
  }
}
