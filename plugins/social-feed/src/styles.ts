/**
 * The styles of the Social feed block. They set the layout only and take
 * fonts, colors and buttons from the theme (`wp-block-button__link`,
 * `currentColor`, `inherit`), so the feed looks like the rest of the site.
 * Breakpoints as the blocks' responsive settings: tablet up to 1024 px,
 * mobile up to 767 px.
 */
export const BASE_CSS = `.cx-sfeed{--cx-sfeed-cols:3;--cx-sfeed-gap:8px;margin:1.5rem 0}
.cx-sfeed__header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem 1.5rem;margin-bottom:1rem}
.cx-sfeed__profile{display:flex;align-items:center;gap:.75rem;min-width:0;color:inherit;text-decoration:none}
.cx-sfeed__avatar{width:56px;height:56px;border-radius:50%;overflow:hidden;flex:none;background:rgba(127,127,127,.15)}
.cx-sfeed__names{display:flex;flex-direction:column;min-width:0;line-height:1.3}
.cx-sfeed__names strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cx-sfeed__names span{font-size:.875em;opacity:.75}
.cx-sfeed__profiles{display:flex;flex-wrap:wrap;gap:.75rem 1.5rem}
.cx-sfeed__follows{display:flex;flex-wrap:wrap;gap:.5rem}
.cx-sfeed__button{cursor:pointer}
.cx-sfeed__items{display:grid;grid-template-columns:repeat(var(--cx-sfeed-cols),minmax(0,1fr));gap:var(--cx-sfeed-gap);margin:0;padding:0;list-style:none}
.cx-sfeed__item{margin:0;min-width:0;display:flex;flex-direction:column;gap:.4rem}
.cx-sfeed__item[hidden]{display:none}
.cx-sfeed__link{position:relative;display:block;color:inherit;text-decoration:none;border-radius:4px;overflow:hidden}
.cx-sfeed__link:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.cx-sfeed__media{position:relative;display:block;aspect-ratio:1/1;background:rgba(127,127,127,.12)}
.cx-sfeed--portrait .cx-sfeed__media{aspect-ratio:4/5}
.cx-sfeed--original .cx-sfeed__media{aspect-ratio:auto}
.cx-sfeed__media img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .3s ease,opacity .3s ease}
.cx-sfeed--original .cx-sfeed__media img{height:auto}
.cx-sfeed__link:hover img{transform:scale(1.03);opacity:.92}
.cx-sfeed__media img[data-cx-src]{visibility:hidden}
.cx-sfeed__badge{position:absolute;top:.5rem;right:.5rem;display:flex;width:1.75rem;height:1.75rem;align-items:center;justify-content:center;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:.8rem;line-height:1;pointer-events:none}
.cx-sfeed__badge svg{width:1rem;height:1rem;fill:currentColor}
.cx-sfeed__text{display:flex;align-items:center;justify-content:center;height:100%;padding:1rem;text-align:center;font-size:.9em;line-height:1.4;overflow:hidden}
.cx-sfeed__consent{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:.5rem;text-align:center;font-size:.8em;line-height:1.3}
.cx-sfeed__meta{display:flex;flex-direction:column;gap:.25rem;font-size:.9em;line-height:1.45}
.cx-sfeed__meta p{margin:0;overflow-wrap:anywhere}
.cx-sfeed__info{display:flex;flex-wrap:wrap;gap:.25rem .9rem;font-size:.85em;opacity:.75}
.cx-sfeed__more{display:flex;justify-content:center;margin-top:1.25rem}
.cx-sfeed--list .cx-sfeed__items{grid-template-columns:minmax(0,1fr);gap:calc(var(--cx-sfeed-gap) * 2)}
.cx-sfeed--list .cx-sfeed__item{display:grid;grid-template-columns:minmax(0,clamp(120px,35%,320px)) minmax(0,1fr);gap:1rem;align-items:start}
.cx-sfeed--carousel{position:relative}
.cx-sfeed--carousel .cx-sfeed__items{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none;overscroll-behavior-x:contain}
.cx-sfeed--carousel .cx-sfeed__items::-webkit-scrollbar{display:none}
.cx-sfeed--carousel .cx-sfeed__item{flex:0 0 calc((100% - (var(--cx-sfeed-cols) - 1) * var(--cx-sfeed-gap)) / var(--cx-sfeed-cols));scroll-snap-align:start}
.cx-sfeed__nav{display:flex;justify-content:center;gap:.5rem;margin-top:.75rem}
.cx-sfeed__nav button{display:flex;width:2.5rem;height:2.5rem;align-items:center;justify-content:center;padding:0;border:1px solid currentColor;border-radius:50%;background:transparent;color:inherit;font:inherit;font-size:1.25rem;line-height:1;cursor:pointer;opacity:.8}
.cx-sfeed__nav button:hover{opacity:1}
.cx-sfeed__nav button:disabled{opacity:.3;cursor:default}
.cx-sfeed__empty{padding:1.5rem;border:1px dashed currentColor;border-radius:6px;text-align:center;opacity:.7}
.cx-sfeed-lightbox{width:min(960px,calc(100vw - 2rem));max-height:calc(100vh - 2rem);padding:0;border:0;border-radius:8px;background:#fff;color:#1f2937;overflow:auto}
.cx-sfeed-lightbox::backdrop{background:rgba(0,0,0,.8)}
.cx-sfeed-lightbox__body{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr)}
.cx-sfeed-lightbox__media{display:flex;align-items:center;justify-content:center;background:#111;min-height:240px}
.cx-sfeed-lightbox__media img{display:block;max-width:100%;max-height:calc(100vh - 2rem);object-fit:contain}
.cx-sfeed-lightbox__side{display:flex;flex-direction:column;gap:.75rem;padding:1.25rem 1.25rem 1rem;font-size:.95rem;line-height:1.5}
.cx-sfeed-lightbox__caption{margin:0;white-space:pre-line;overflow-wrap:anywhere}
.cx-sfeed-lightbox__info{font-size:.85rem;opacity:.75}
.cx-sfeed-lightbox__close,.cx-sfeed-lightbox__nav{position:absolute;display:flex;width:2.5rem;height:2.5rem;align-items:center;justify-content:center;padding:0;border:0;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:1.5rem;line-height:1;cursor:pointer}
.cx-sfeed-lightbox__close{top:.5rem;right:.5rem}
.cx-sfeed-lightbox__nav{top:50%;transform:translateY(-50%)}
.cx-sfeed-lightbox__nav--prev{left:.5rem}
.cx-sfeed-lightbox__nav--next{right:.5rem}
.cx-sfeed-lightbox a{color:inherit;font-weight:600}
@media (max-width:767px){.cx-sfeed-lightbox__body{grid-template-columns:minmax(0,1fr)}.cx-sfeed--list .cx-sfeed__item{grid-template-columns:minmax(0,1fr)}}
@media (prefers-reduced-motion:reduce){.cx-sfeed__media img{transition:none}.cx-sfeed--carousel .cx-sfeed__items{scroll-behavior:auto}}`;

/** Columns and gap of one block. */
export function instanceCss(
  id: string,
  columns: { desktop: number; tablet: number; mobile: number },
  gap: number,
): string {
  const scope = `.cx-sfeed-${id.replace(/[^\w-]/g, '')}`;
  return `${scope}{--cx-sfeed-cols:${columns.desktop};--cx-sfeed-gap:${gap}px}
@media (max-width:1024px){${scope}{--cx-sfeed-cols:${columns.tablet}}}
@media (max-width:767px){${scope}{--cx-sfeed-cols:${columns.mobile}}}`;
}
