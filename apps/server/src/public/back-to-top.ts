/**
 * "Back to top" arrow of the public pages (Settings → General, off by
 * default). It appears after scrolling down and scrolls back up smoothly,
 * at once for visitors who prefer reduced motion. Without scripts it stays
 * hidden; `#top` still leads to the top of the page. The colour and the
 * corner (right or left) can be chosen.
 */

const LABELS: Record<string, string> = {
  en: 'Back to top',
  it: 'Torna su',
  es: 'Volver arriba',
  fr: 'Retour en haut',
  de: 'Nach oben',
  pt: 'Voltar ao topo',
};

const STYLE = `.cx-to-top{position:fixed;right:20px;bottom:20px;z-index:8999;display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:rgba(17,24,39,.78);color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.2);opacity:0;visibility:hidden;transform:translateY(12px);pointer-events:none;transition:opacity .25s,transform .25s,visibility .25s,background .2s}
.cx-to-top[hidden]{display:none}
.cx-to-top.is-visible{opacity:1;visibility:visible;transform:none;pointer-events:auto}
.cx-to-top:hover{background:rgba(17,24,39,.92)}
.cx-to-top:focus-visible{outline:3px solid #60a5fa;outline-offset:3px}
.cx-to-top svg{width:22px;height:22px}
.cx-to-top.is-left{right:auto;left:20px}
.cx-to-top.is-custom{background:var(--cx-to-top-bg);color:var(--cx-to-top-fg)}
.cx-to-top.is-custom:hover{background:var(--cx-to-top-bg);filter:brightness(.88)}
body:has(.joinchat--right.joinchat--show) .cx-to-top:not(.is-left),body:has(.joinchat--left.joinchat--show) .cx-to-top.is-left{bottom:96px}
@media (prefers-reduced-motion:reduce){.cx-to-top{transition:none}}
@media print{.cx-to-top{display:none}}`;

const SCRIPT = `(function(){var b=document.querySelector('.cx-to-top');if(!b)return;b.hidden=false;var t=0;function u(){t=0;b.classList.toggle('is-visible',window.scrollY>window.innerHeight*0.6)}addEventListener('scroll',function(){if(!t)t=requestAnimationFrame(u)},{passive:true});u();b.addEventListener('click',function(e){e.preventDefault();var r=matchMedia('(prefers-reduced-motion: reduce)').matches;window.scrollTo({top:0,behavior:r?'auto':'smooth'});var f=document.getElementById('content')||document.querySelector('main');if(f){if(!f.hasAttribute('tabindex'))f.setAttribute('tabindex','-1');f.focus({preventScroll:true})}})})();`;

export function backToTopLabel(locale: string): string {
  return LABELS[locale.slice(0, 2).toLowerCase()] ?? LABELS.en!;
}

export interface BackToTopOptions {
  /** `#rrggbb`; the default dark grey when null. */
  color?: string | null;
  position?: 'right' | 'left';
}

/** Dark or white arrow, whichever reads better on the background. */
export function arrowColor(background: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(background.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  // Contrast with white vs. with #111827 (luminance ≈ 0.0103).
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.0603 ? '#fff' : '#111827';
}

/** The arrow, its style and its script, before `</body>`. */
export function withBackToTop(
  html: string,
  locale: string,
  options: BackToTopOptions = {},
): string {
  const label = backToTopLabel(locale);
  const color = options.color && /^#[0-9a-f]{6}$/i.test(options.color) ? options.color : null;
  const classes = ['cx-to-top'];
  if (options.position === 'left') classes.push('is-left');
  if (color) classes.push('is-custom');
  const style = color ? ` style="--cx-to-top-bg:${color};--cx-to-top-fg:${arrowColor(color)}"` : '';
  const arrow =
    `<style>${STYLE}</style>` +
    `<a class="${classes.join(' ')}" href="#top" aria-label="${label}" title="${label}"${style} hidden>` +
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    `</a><script>${SCRIPT}</script>`;
  const at = html.lastIndexOf('</body>');
  return at === -1 ? html + arrow : html.slice(0, at) + arrow + html.slice(at);
}
