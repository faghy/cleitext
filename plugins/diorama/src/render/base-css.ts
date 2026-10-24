/**
 * The CSS every slider shares: the box, slides, layers, navigation styles,
 * hover effects, entrance and exit keyframes, Ken Burns, and what changes
 * with reduced motion. Each slider adds its own (sizes, layers) with
 * `sliderCss`.
 */
import { BREAKPOINT, MOTION_FROM } from '../model/presets';

const keyframes = Object.entries(MOTION_FROM)
  .map(([id, from]) => {
    const state = `opacity:0;transform:${from.transform}${from.filter ? `;filter:${from.filter}` : ''}`;
    return `@keyframes dio-in-${id}{from{${state}}}@keyframes dio-out-${id}{to{${state}}}`;
  })
  .join('');

export const BASE_CSS = `.dio{position:relative;box-sizing:border-box;margin-top:0;margin-bottom:0;container-type:inline-size;isolation:isolate;color:#fff;--dio-nav:#fff;--dio-nav-size:44px;--dio-h:600px;--dio-off:0px;line-height:1.5}
.dio *,.dio *::before,.dio *::after{box-sizing:border-box}
.dio--auto{margin-inline:auto}
.dio--fullwidth,.dio--fullscreen{width:calc(100vw - var(--dio-sbw,0px));max-width:none;margin-left:calc(50% - (100vw - var(--dio-sbw,0px)) / 2)}
.dio__stage{position:relative;height:var(--dio-h);overflow:hidden;touch-action:pan-y;outline:0}
.dio--fullscreen .dio__stage{height:calc(100vh - var(--dio-off));height:calc(100svh - var(--dio-off));min-height:320px}
.dio--canvas.dio--fullscreen .dio__stage{height:var(--dio-h)}
.dio--canvas{width:100%!important;max-width:none!important;margin:0!important}
.dio__slide{position:absolute;inset:0;overflow:hidden;visibility:hidden;container-type:size;z-index:0}
.dio__slide.is-active{visibility:visible;z-index:1}
.dio__slide.is-in,.dio__slide.is-out{visibility:visible}
.dio__slide.is-in{z-index:2}
.dio__media{position:absolute;inset:0;overflow:hidden}
.dio__media picture{display:contents}
.dio__bg{position:absolute;inset:0;display:block;width:100%;height:100%;max-width:none;margin:0;object-fit:cover}
.dio__video{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:cover;pointer-events:none}
.dio__video--embed{inset:auto;top:50%;left:50%;width:max(100%,177.78cqh);height:max(100%,56.25cqw);translate:-50% -50%}
.dio__overlay{position:absolute;inset:0;pointer-events:none}
.dio__link{position:absolute;inset:0;z-index:1}
.dio__layers{position:absolute;inset:0;z-index:2;pointer-events:none}
.dio__layers>.dio-l{position:absolute}
.dio-l{margin:0;padding:0;pointer-events:auto;overflow-wrap:break-word;color:inherit;font:inherit;text-wrap:balance}
.dio-l.dio-text{text-wrap:pretty}
.dio-box{display:flex;flex-direction:column;align-items:flex-start;pointer-events:none}
.dio-box>*{pointer-events:auto;max-width:100%}
.dio-box>.dio-l{position:static}
.dio-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;text-decoration:none;cursor:pointer;transition:transform .25s ease,box-shadow .25s ease,filter .25s ease}
a.dio-btn:hover,a.dio-btn:focus{text-decoration:none}
.dio a:focus-visible,.dio button:focus-visible{outline:3px solid var(--dio-nav);outline-offset:3px;box-shadow:0 0 0 6px rgba(0,0,0,.55)}
.dio-btn__arrow{width:1em;height:1em;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .25s ease}
.dio-h-lift:hover{transform:translateY(-3px);box-shadow:0 12px 28px rgba(0,0,0,.28)}
.dio-h-grow:hover{transform:scale(1.06)}
.dio-h-glow:hover{box-shadow:0 0 0 4px rgba(255,255,255,.28),0 0 28px rgba(255,255,255,.35)}
.dio-h-darken:hover{filter:brightness(.86)}
.dio-h-shift:hover .dio-btn__arrow{transform:translateX(5px)}
.dio-icon{display:inline-flex;line-height:1}
.dio-icon svg{display:block;width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dio-image{overflow:hidden}
.dio-image img,.dio-image picture{display:block;width:100%;height:100%;max-width:none;margin:0;object-fit:cover}
.dio-image--empty{display:flex;align-items:center;justify-content:center;aspect-ratio:4/3;background:repeating-linear-gradient(45deg,rgba(255,255,255,.18) 0 12px,rgba(255,255,255,.08) 12px 24px);border:2px dashed rgba(255,255,255,.6);font-size:14px;color:#fff}
.dio-shape--circle{border-radius:50%!important}
.dio-shape--blob{border-radius:42% 58% 70% 30%/45% 45% 55% 55%!important}
.dio__slide.is-active .dio-l[data-in]{animation:var(--dio-in) var(--dio-in-dur,700ms) var(--dio-in-ease,ease) var(--dio-in-delay,0ms) backwards}
.dio__slide.is-out .dio-l[data-out]{animation:var(--dio-out) var(--dio-out-dur,400ms) var(--dio-out-ease,ease) var(--dio-out-delay,0ms) forwards}
.dio__slide.is-active .dio-kb--zoom-in{animation:dio-kb-in var(--dio-kb,9s) linear forwards}
.dio__slide.is-active .dio-kb--zoom-out{animation:dio-kb-out var(--dio-kb,9s) linear forwards}
.dio__slide.is-active .dio-kb--pan{animation:dio-kb-pan var(--dio-kb,9s) linear forwards}
@keyframes dio-kb-in{from{transform:scale(1)}to{transform:scale(1.16)}}
@keyframes dio-kb-out{from{transform:scale(1.16)}to{transform:scale(1)}}
@keyframes dio-kb-pan{from{transform:scale(1.14) translateX(-3.5%)}to{transform:scale(1.14) translateX(3.5%)}}
${keyframes}
.dio__arrow,.dio__bullet,.dio__pause{font:inherit;color:var(--dio-nav);-webkit-tap-highlight-color:transparent}
.dio__arrow{position:absolute;top:50%;z-index:5;display:flex;align-items:center;justify-content:center;width:var(--dio-nav-size);height:var(--dio-nav-size);margin:0;padding:0;border:0;background:transparent;cursor:pointer;translate:0 -50%;transition:background-color .2s,opacity .2s}
.dio__arrow--prev{left:clamp(8px,2cqw,24px)}
.dio__arrow--next{right:clamp(8px,2cqw,24px)}
.dio__arrow svg,.dio__pause svg{pointer-events:none;width:50%;height:50%;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.dio__arrow[disabled]{opacity:.35;cursor:default}
.dio__bullets{position:absolute;bottom:clamp(8px,2.2cqw,22px);left:50%;z-index:5;display:flex;gap:2px;margin:0;padding:0;list-style:none;translate:-50% 0}
.dio__bullet{display:grid;place-items:center;min-width:24px;height:24px;margin:0;padding:0;border:0;background:transparent;cursor:pointer}
.dio__bullet::before{content:"";display:block;width:calc(var(--dio-nav-size)*.24);height:calc(var(--dio-nav-size)*.24);border-radius:50%;background:var(--dio-nav);opacity:.45;transition:opacity .2s,width .25s}
.dio__bullet[aria-current="true"]::before{opacity:1}
.dio__pause{position:absolute;top:12px;right:12px;z-index:6;display:flex;align-items:center;justify-content:center;width:36px;height:36px;margin:0;padding:0;border:0;border-radius:50%;background:rgba(0,0,0,.42);cursor:pointer}
.dio__pause svg{width:46%;height:46%}
.dio__pause svg.dio-play{fill:currentColor}
.dio__progress{position:absolute;left:0;right:0;bottom:0;z-index:5;height:4px;background:rgba(255,255,255,.22);pointer-events:none}
.dio__progress span{display:block;width:100%;height:100%;background:var(--dio-nav);transform:scaleX(0);transform-origin:left}
.dio [hidden]{display:none!important}
.dio-nav--minimal .dio__arrow{filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))}
.dio-nav--minimal .dio__bullet::before{box-shadow:0 0 3px rgba(0,0,0,.6)}
.dio-nav--circle .dio__arrow{border-radius:50%;background:rgba(0,0,0,.36)}
.dio-nav--circle .dio__arrow:hover{background:rgba(0,0,0,.6)}
.dio-nav--square .dio__arrow{border-radius:4px;background:rgba(0,0,0,.48)}
.dio-nav--square .dio__arrow:hover{background:rgba(0,0,0,.7)}
.dio-nav--square .dio__bullet::before{border-radius:2px}
.dio-nav--pill .dio__arrow{width:calc(var(--dio-nav-size)*1.35);border-radius:999px;background:rgba(0,0,0,.4)}
.dio-nav--pill .dio__bullet::before{border-radius:999px}
.dio-nav--pill .dio__bullet[aria-current="true"]::before{width:calc(var(--dio-nav-size)*.62)}
.dio-nav--line .dio__arrow svg{stroke-width:1.4;width:70%;height:70%}
.dio-nav--line .dio__bullet::before{width:calc(var(--dio-nav-size)*.55);height:3px;border-radius:2px}
.dio-nav--outline .dio__arrow{border:2px solid var(--dio-nav);border-radius:50%}
.dio-nav--outline .dio__arrow:hover{background:rgba(255,255,255,.14)}
.dio-nav--outline .dio__bullet::before{background:transparent;border:2px solid var(--dio-nav);opacity:1}
.dio-nav--outline .dio__bullet[aria-current="true"]::before{background:var(--dio-nav)}
@media (max-width:${BREAKPOINT.mobile}px){.dio--arrows-desk .dio__arrow{display:none}}
.dio--static .dio-l,.dio--static .dio__media,.dio--static .dio__bg{animation:none!important}
.dio--canvas .dio-btn{transition:none}
@media (prefers-reduced-motion:reduce){.dio .dio-l,.dio .dio__bg,.dio .dio__media{animation:none!important}.dio .dio-btn,.dio .dio-btn__arrow{transition:none}}
`;
