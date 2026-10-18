/**
 * lottie-web (MIT, Bodymovin), SVG renderer only, served with the plugin so that
 * visitors do not call a third-party CDN. lottie.js loads it on pages with an
 * animation, when one comes near the screen.
 */
import lottie from 'lottie-web/build/player/lottie_svg';

(window as unknown as { lottie: typeof lottie }).lottie = lottie;

export {};
