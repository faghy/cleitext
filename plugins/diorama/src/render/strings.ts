/** What visitors hear and read around a slider, in the page's language. */
export interface Strings {
  carousel: string;
  slide: string;
  slideOf: (n: number, total: number) => string;
  goTo: (n: number) => string;
  previous: string;
  next: string;
  pause: string;
  play: string;
  slides: string;
  video: string;
  open: string;
}

const EN: Strings = {
  carousel: 'carousel',
  slide: 'slide',
  slideOf: (n, total) => `${n} of ${total}`,
  goTo: (n) => `Slide ${n}`,
  previous: 'Previous slide',
  next: 'Next slide',
  pause: 'Pause the slideshow',
  play: 'Play the slideshow',
  slides: 'Slides',
  video: 'Background video',
  open: 'Open',
};

const IT: Strings = {
  carousel: 'carosello',
  slide: 'slide',
  slideOf: (n, total) => `${n} di ${total}`,
  goTo: (n) => `Slide ${n}`,
  previous: 'Slide precedente',
  next: 'Slide successiva',
  pause: 'Metti in pausa le slide',
  play: 'Fai scorrere le slide',
  slides: 'Slide',
  video: 'Video di sfondo',
  open: 'Apri',
};

export function stringsFor(locale: string): Strings {
  return locale.toLowerCase().startsWith('it') ? IT : EN;
}
