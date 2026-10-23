/** The editor's own styles (plugins cannot use the admin's Tailwind build). */
export const EDITOR_CSS = `
.fre-root{--fre-accent:#c2410c;--fre-accent-soft:#fff1e8;--fre-ink:#1f2937;--fre-muted:#6b7280;--fre-line:#e5e7eb;--fre-bg:#f8fafc;
  display:flex;flex:1 1 auto;min-height:0;height:100%;font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fre-ink);background:#e9ecef}
.fre-root *{box-sizing:border-box}
.fre-root button{font:inherit;color:inherit}
.fre-panel{display:flex;flex-direction:column;width:320px;flex:0 0 320px;background:#fff;border-right:1px solid var(--fre-line);min-height:0}
.fre-panel__body{flex:1 1 auto;overflow-y:auto;padding:12px}
.fre-toolbar{display:flex;align-items:center;gap:2px;padding:6px 8px;border-bottom:1px solid var(--fre-line);background:var(--fre-bg)}
.fre-toolbar__gap{flex:1}
.fre-brand{font-weight:700;letter-spacing:.02em;margin-right:8px;color:var(--fre-accent)}
.fre-iconbtn{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;padding:0 6px;border:0;border-radius:6px;background:transparent;cursor:pointer;color:var(--fre-muted)}
.fre-iconbtn:hover{background:#f1f5f9;color:var(--fre-ink)}
.fre-iconbtn.is-on{background:var(--fre-accent-soft);color:var(--fre-accent)}
.fre-iconbtn.is-used{color:var(--fre-accent)}
.fre-iconbtn:disabled{opacity:.35;cursor:default}
.fre-main{flex:1 1 auto;display:flex;flex-direction:column;min-width:0}
.fre-devicebar{display:flex;justify-content:center;gap:4px;padding:6px;background:#fff;border-bottom:1px solid var(--fre-line)}
.fre-canvas{flex:1 1 auto;display:flex;justify-content:center;overflow:hidden;padding:0}
.fre-frame{height:100%;transition:width .25s ease;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.fre-iframe{display:block;width:100%;height:100%;border:0}
.fre-error{color:#b91c1c;margin:8px 0}
.fre-empty-note{color:var(--fre-muted);padding:12px 4px}
.fre-view-title{font-size:14px;font-weight:600;margin:0 0 10px}
.fre-search{margin-bottom:12px}
.fre-category h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--fre-muted);margin:14px 0 8px}
.fre-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.fre-tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 4px 10px;border:1px solid var(--fre-line);border-radius:8px;background:#fff;cursor:grab;color:#374151;touch-action:none;user-select:none}
.fre-tile:hover{border-color:var(--fre-accent);color:var(--fre-accent);box-shadow:0 1px 4px rgba(194,65,12,.12)}
.fre-tile span{font-size:12px;text-align:center}
.fre-pro{position:absolute;top:4px;right:4px;font-style:normal;font-size:9px;font-weight:700;color:#fff;background:var(--fre-accent);border-radius:3px;padding:0 3px}
.fre-ghost{position:fixed;left:0;top:0;z-index:100000;pointer-events:none;padding:4px 10px;border-radius:999px;background:var(--fre-accent,#c2410c);color:#fff;font:600 12px/1.6 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.2)}
.fre-crumbs{font-size:12px;color:var(--fre-muted);margin-bottom:8px}
.fre-crumbs button{border:0;background:none;padding:0;color:var(--fre-accent);cursor:pointer}
.fre-tabs{display:flex;border-bottom:1px solid var(--fre-line);margin:0 -12px 8px;padding:0 12px}
.fre-tabs button{flex:1;padding:8px 4px;border:0;border-bottom:2px solid transparent;background:none;cursor:pointer;color:var(--fre-muted);font-weight:500}
.fre-tabs button.is-on{color:var(--fre-accent);border-bottom-color:var(--fre-accent)}
.fre-section{border-bottom:1px solid var(--fre-line)}
.fre-section__head{display:flex;align-items:center;gap:6px;width:100%;padding:10px 2px;border:0;background:none;cursor:pointer;font-weight:600;text-align:left}
.fre-section__body{padding:2px 2px 12px}
.fre-states{display:flex;margin-bottom:10px;border:1px solid var(--fre-line);border-radius:6px;overflow:hidden}
.fre-states button{flex:1;padding:5px;border:0;background:#fff;cursor:pointer}
.fre-states button.is-on{background:var(--fre-accent-soft);color:var(--fre-accent);font-weight:600}
.fre-control{margin:0 0 12px}
.fre-control__head{display:flex;align-items:center;gap:6px;margin-bottom:5px}
.fre-control__label{flex:1;color:#374151;font-weight:500}
.fre-control--inline{display:flex;align-items:center;gap:8px}
.fre-control--inline .fre-control__head{flex:1;margin:0}
.fre-control--inline .fre-control__body{flex:0 1 auto;max-width:60%}
.fre-control--inline .fre-help{display:none}
.fre-help{margin:4px 0 0;font-size:11.5px;color:var(--fre-muted)}
.fre-subheading{margin:6px 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--fre-muted)}
.fre-notice{padding:8px;border-radius:6px;background:#fef3c7;color:#92400e}
.fre-input{width:100%;min-height:30px;padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;background:#fff;font:inherit;color:inherit}
.fre-input:focus{outline:2px solid rgba(194,65,12,.25);border-color:var(--fre-accent)}
.fre-input--number{width:72px}
.fre-mono,.fre-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
textarea.fre-input{resize:vertical}
.fre-unit{min-height:30px;padding:0 2px;border:1px solid #d1d5db;border-radius:6px;background:#fff;font:inherit;font-size:11px}
.fre-devices{display:inline-flex;gap:1px}
.fre-devices button{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:0;border-radius:4px;background:none;color:#9ca3af;cursor:pointer}
.fre-devices button.is-on{color:var(--fre-accent);background:var(--fre-accent-soft)}
.fre-reset{display:inline-flex;border:0;background:none;color:#9ca3af;cursor:pointer;padding:2px}
.fre-reset:hover{color:var(--fre-accent)}
.fre-choose{display:inline-flex;border:1px solid #d1d5db;border-radius:6px;overflow:hidden}
.fre-choose button{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:28px;padding:0 6px;border:0;border-right:1px solid #e5e7eb;background:#fff;cursor:pointer;color:#4b5563;font-size:11px}
.fre-choose button:last-child{border-right:0}
.fre-choose button.is-on{background:var(--fre-accent);color:#fff}
.fre-choose button.is-inherited{background:var(--fre-accent-soft);color:var(--fre-accent)}
.fre-control:not(.fre-control--inline)>.fre-control__body>.fre-choose{display:flex;width:100%}
.fre-control:not(.fre-control--inline)>.fre-control__body>.fre-choose button{flex:1 1 0;min-width:0}
.fre-switch{position:relative;display:inline-block;width:36px;height:20px}
.fre-switch input{opacity:0;width:0;height:0}
.fre-switch span{position:absolute;inset:0;border-radius:999px;background:#d1d5db;cursor:pointer;transition:background .15s}
.fre-switch span::after{content:'';position:absolute;left:2px;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s}
.fre-switch input:checked+span{background:var(--fre-accent)}
.fre-switch input:checked+span::after{transform:translateX(16px)}
.fre-slider{display:flex;align-items:center;gap:6px}
.fre-slider input[type=range]{flex:1;accent-color:var(--fre-accent);min-width:0}
.fre-box{display:grid;grid-template-columns:repeat(4,1fr) auto auto;gap:4px;align-items:start}
.fre-box label{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;color:var(--fre-muted)}
.fre-box .fre-input--number{width:100%;padding:4px}
.fre-link{display:inline-flex;align-items:center;justify-content:center;width:28px;height:30px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;color:#9ca3af}
.fre-link.is-on{color:var(--fre-accent);border-color:var(--fre-accent)}
.fre-color{position:relative;display:inline-flex;align-items:center;gap:4px}
.fre-color__swatch{width:30px;height:30px;padding:0;overflow:hidden;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;background-image:linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%),linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%);background-size:8px 8px;background-position:0 0,4px 4px}
.fre-color__swatch>span{display:block;width:100%;height:100%}
.fre-color__swatch.is-on{border-color:#818a96;box-shadow:0 0 0 1px #818a96}
.fre-color__none{display:block;width:100%;height:100%;background:linear-gradient(135deg,transparent 45%,#ef4444 45%,#ef4444 55%,transparent 55%)}
.fre-color__row{display:flex;gap:6px;align-items:center}
.fre-color__row input[type=color]{width:36px;height:30px;padding:0;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer}
.fre-popover{position:absolute;right:0;top:36px;z-index:50;width:250px;padding:10px;border:1px solid var(--fre-line);border-radius:8px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.15)}
.fre-popover__title{margin:10px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--fre-muted)}
.fre-popover__actions{display:flex;justify-content:space-between;margin-top:10px}
.fre-popover__actions button{border:0;background:none;color:var(--fre-accent);cursor:pointer}
.fre-globals{display:grid;gap:2px;max-height:180px;overflow:auto}
.fre-globals button{display:flex;align-items:center;gap:8px;padding:4px 6px;border:0;border-radius:4px;background:none;cursor:pointer;text-align:left}
.fre-globals button:hover,.fre-globals button.is-on{background:var(--fre-accent-soft)}
.fre-globals span{width:18px;height:18px;border-radius:4px;border:1px solid rgba(0,0,0,.1)}
.fre-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-weight:500}
.fre-button:hover{border-color:var(--fre-accent);color:var(--fre-accent)}
.fre-button--primary{background:var(--fre-accent);border-color:var(--fre-accent);color:#fff}
.fre-button--primary:hover{color:#fff;filter:brightness(1.05)}
.fre-button:disabled{opacity:.5;cursor:default}
.fre-checks{display:flex;flex-direction:column;gap:6px;margin:8px 0}
.fre-checks label,.fre-checks{cursor:pointer}
label.fre-checks{flex-direction:row;align-items:center;gap:8px}
.fre-media__preview{display:block;width:100%;min-height:110px;padding:0;border:1px dashed #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;overflow:hidden}
.fre-media__preview img{display:block;width:100%;max-height:180px;object-fit:contain;background:#f1f5f9}
.fre-media__empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:110px;color:var(--fre-muted)}
.fre-media__file{display:block;padding:12px;word-break:break-all}
.fre-media__actions{display:flex;gap:10px;margin-top:6px}
.fre-media__actions button{border:0;background:none;color:var(--fre-accent);cursor:pointer;padding:0}
.fre-gallery__grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px}
.fre-gallery__item{position:relative;aspect-ratio:1}
.fre-gallery__item img{width:100%;height:100%;object-fit:cover;border-radius:4px}
.fre-gallery__item button{position:absolute;top:2px;right:2px;width:18px;height:18px;border:0;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;cursor:pointer;line-height:1}
.fre-iconinput{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.fre-iconinput__preview{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:22px}
.fre-iconinput__preview .fr-icon{width:22px;height:22px}
.fre-modal{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.45)}
.fre-modal__box{display:flex;flex-direction:column;width:min(900px,92vw);height:min(640px,86vh);border-radius:12px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden}
.fre-modal__head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--fre-line)}
.fre-modal__head .fre-input{max-width:260px}
.fre-modal__grid{flex:1 1 auto;min-height:0;overflow:auto;padding:14px}
.fre-modal__box>.fre-help{margin:0;padding:6px 14px}
.fre-modal__foot{display:flex;justify-content:flex-end;padding:10px 14px;border-top:1px solid var(--fre-line)}
.fre-thumb{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;aspect-ratio:1;padding:6px;border:2px solid transparent;border-radius:8px;background:#f8fafc;cursor:pointer;overflow:hidden}
.fre-thumb img{width:100%;height:100%;object-fit:cover;border-radius:4px}
.fre-thumb.is-on,.fre-thumb:hover{border-color:var(--fre-accent)}
.fre-thumb{width:100%;height:100%;min-width:0;min-height:0}
.fre-thumb--icon{aspect-ratio:auto;padding:8px 4px;justify-content:flex-start;gap:4px}
.fre-thumb--icon .fr-icon{flex:0 0 auto;width:24px;height:24px;margin-top:6px}
.fre-thumb--icon span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:10.5px;line-height:1.3;color:var(--fre-muted);word-break:break-all;text-align:center}
.fre-thumb__set{font-size:9.5px;line-height:1;color:var(--fre-accent);text-transform:uppercase;letter-spacing:.03em}
.fre-rich{border:1px solid #d1d5db;border-radius:6px;overflow:hidden}
.fre-rich__bar{display:flex;flex-wrap:wrap;gap:1px;padding:3px;border-bottom:1px solid var(--fre-line);background:#f8fafc}
.fre-rich__bar button{min-width:26px;height:26px;border:0;border-radius:4px;background:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.fre-rich__bar button:hover,.fre-rich__bar button.is-on{background:var(--fre-accent-soft);color:var(--fre-accent)}
.fre-rich__area{min-height:140px;max-height:360px;overflow:auto;padding:8px 10px;outline:none}
.fre-rich__area p{margin:0 0 .7em}
.fre-rich .fre-code{border:0;border-radius:0}
.fre-repeater{display:grid;gap:6px}
.fre-repeater__item{border:1px solid var(--fre-line);border-radius:6px;background:#fff}
.fre-repeater__head{display:flex;align-items:center}
.fre-repeater__title{flex:1;padding:8px;border:0;background:none;text-align:left;cursor:pointer;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fre-repeater__body{padding:8px 10px;border-top:1px solid var(--fre-line);background:var(--fre-bg)}
.fre-group__body{margin-top:6px;padding:10px;border:1px solid var(--fre-line);border-radius:8px;background:var(--fre-bg)}
.fre-nav ul{list-style:none;margin:0;padding:0}
.fre-nav__row{display:flex;align-items:center;gap:2px;border-radius:6px}
.fre-nav__row:hover{background:#f1f5f9}
.fre-nav__row.is-on{background:var(--fre-accent-soft)}
.fre-nav__row .fre-iconbtn{min-width:20px;height:24px;padding:0}
.fre-nav__spacer{display:inline-block;width:20px}
.fre-nav__title{display:flex;align-items:center;gap:6px;flex:1;padding:4px 2px;border:0;background:none;cursor:pointer;text-align:left}
.fre-kitrow{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.fre-kitrow .fre-mono{font-size:11px;color:var(--fre-muted)}
.fre-kitfont{padding:8px;border:1px solid var(--fre-line);border-radius:8px;margin-bottom:8px}
.fre-preview-font{margin:4px 0 0;font-size:16px}
.fre-site__save{position:sticky;bottom:-12px;padding:12px 0;background:#fff}
.fre-site__save .fre-button{width:100%}
.fre-menu{position:fixed;z-index:100000;width:250px;padding:5px 0;border:0;border-radius:3px;background:#fff;box-shadow:0 2px 15px rgba(0,0,0,.3);font:13px Roboto,system-ui,sans-serif;color:#0c0d0e}
.fre-menu__group+.fre-menu__group{border-top:1px solid #e6e8ea;margin-top:5px;padding-top:5px}
.fre-root .fre-menu button.is-danger:hover{color:#dc2626;background:#fef2f2}
.fre-menu__title{margin:4px 8px 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
.fre-menu button{display:flex;justify-content:space-between;gap:16px;width:100%;padding:9px 20px;border:0;border-radius:0;background:none;cursor:pointer;text-align:left;font:14px Roboto,system-ui,sans-serif}
.fre-menu button:hover{background:#f1f2f3;color:#0c0d0e}
.fre-menu button:disabled{opacity:.4;cursor:default;background:none;color:inherit}
.fre-menu button>svg{flex:none;margin:1px -8px 0 0}
.fre-menu button>svg+span{flex:1}
.fre-menu kbd{font:11px system-ui,sans-serif;color:#9ca3af}
.fre-ok{color:#15803d;margin:8px 0}
.fre-library__save{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.fre-library__list{list-style:none;margin:10px 0 0;padding:0;display:grid;grid-template-columns:minmax(0,1fr);gap:6px}
.fre-library__item{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0;padding:8px;border:1px solid var(--fre-line);border-radius:8px}
.fre-library__info{flex:1 1 100%;min-width:0;display:flex;flex-direction:column}
.fre-library__info+button{margin-left:auto}
.fre-library__info strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fre-library__info span{font-size:11.5px;color:var(--fre-muted)}
.fre-safebar{display:flex;align-items:center;gap:12px;padding:8px 14px;background:#fef3c7;border-bottom:1px solid #f59e0b;color:#78350f;font-size:12.5px}
.fre-safebar span{flex:1;min-width:0}
.fre-library .fre-library__search{position:static;height:34px;margin:0 0 8px;padding:0 10px;border:1px solid var(--fre-line);border-radius:6px}
.fre-library__source{width:100%;margin:0 0 8px}
.fre-library__thumb{width:44px;height:32px;object-fit:cover;border-radius:4px}
.fre-library__item .fre-iconbtn{min-width:26px;padding:0 4px}
.fre-repeater__item.is-on{border-color:var(--fre-accent)}
.fre-repeater__name{border:0;min-height:28px}
.fre-chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
.fre-chip{display:inline-flex;align-items:center;border:1px solid var(--fre-line);border-radius:999px;background:#fff;font-size:12px;overflow:hidden}
button.fre-chip,.fre-chip button{border:0;background:none;padding:3px 9px;cursor:pointer}
.fre-chip button+button{padding-left:2px;color:var(--fre-muted)}
.fre-chip.is-on{border-color:var(--fre-accent);background:var(--fre-accent-soft);color:var(--fre-accent)}
.fre-dot{display:inline-block;width:6px;height:6px;margin-left:6px;border-radius:50%;background:var(--fre-accent)}
.fre-shadow{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.fre-shadow label{display:flex;flex-direction:column;align-items:center;font-size:10px;color:var(--fre-muted)}
.fre-shadow .fre-input--number{width:100%}
.fre-shadow .fre-mono{grid-column:1/-1}

.fre-root--full{flex-direction:column;--fre-bar:#111418;--fre-bar-2:#1d2126;--fre-bar-ink:#d5d9de;--fre-bar-muted:#8b929b}
.fre-body{display:flex;flex:1 1 auto;min-height:0}
.fre-bar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;height:48px;flex:0 0 48px;padding:0 8px;background:var(--fre-bar);color:var(--fre-bar-ink);font:13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;position:relative;z-index:40}
.fre-bar__side{display:flex;align-items:center;gap:2px;min-width:0}
.fre-bar__side--end{justify-content:flex-end}
.fre-bar__center{display:flex;align-items:center;gap:6px}
.fre-bar__sep{width:1px;height:24px;margin:0 8px;background:#2f343a}
.fre-bar__btn{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:0;border-radius:4px;background:transparent;color:var(--fre-bar-ink);cursor:pointer}
.fre-bar__ext{position:relative}
.fre-bar__badge{position:absolute;top:2px;right:0;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:#c2410c;color:#fff;font:600 10px/16px system-ui,sans-serif;text-align:center;pointer-events:none}
.fre-bar__btn:hover{background:var(--fre-bar-2);color:#fff}
.fre-bar__btn.is-on{background:#2a2f35;color:#fff;box-shadow:inset 0 -2px 0 var(--fre-accent)}
.fre-bar__btn:disabled{opacity:.35;cursor:default;background:transparent}
.fre-bar__logo{display:inline-flex;align-items:center;gap:4px;height:36px;padding:0 8px;border:0;border-radius:4px;background:var(--fre-accent);color:#fff;cursor:pointer}
.fre-bar__logo:hover,.fre-bar__logo.is-on{filter:brightness(1.1)}
.fre-bar__title{width:clamp(140px,22vw,320px);height:32px;padding:0 10px;border:1px solid transparent;border-radius:4px;background:transparent;color:#fff;font:600 13px system-ui,sans-serif;text-align:center}
.fre-bar__title:hover{border-color:#2f343a}
.fre-bar__title:focus{outline:0;border-color:var(--fre-accent);background:var(--fre-bar-2);text-align:left}
.fre-bar__devices{display:flex;gap:2px}
.fre-bar__state{margin:0 8px;font-size:12px;color:var(--fre-bar-muted);white-space:nowrap}
.fre-bar__menuwrap{position:relative;display:inline-flex}
.fre-bar__publish{gap:1px}
.fre-bar__primary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:110px;height:32px;padding:0 14px;border:0;border-radius:4px 0 0 4px;background:var(--fre-accent);color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer}
.fre-bar__primary:hover{filter:brightness(1.08)}
.fre-bar__primary:disabled{background:#3a3f45;color:#9aa1a9;cursor:default;filter:none}
.fre-bar__more{min-width:0;width:30px;padding:0;border-radius:0 4px 4px 0}
.fre-spinner{width:14px;height:14px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:fre-spin .7s linear infinite}
@keyframes fre-spin{to{transform:rotate(360deg)}}
.fre-dropdown{position:absolute;top:calc(100% + 6px);z-index:60;min-width:220px;padding:6px 0;border-radius:4px;background:#fff;color:#1f2937;box-shadow:0 2px 15px rgba(0,0,0,.3)}
.fre-dropdown--left{left:0}
.fre-dropdown--right{right:0}
.fre-dropdown a,.fre-dropdown button{display:flex;align-items:center;gap:10px;width:100%;padding:9px 16px;border:0;background:none;color:inherit;font:13px system-ui,sans-serif;text-decoration:none;text-align:left;cursor:pointer}
.fre-dropdown a:hover,.fre-dropdown button:hover{background:#f1f2f3}
.fre-dropdown hr{margin:6px 0;border:0;border-top:1px solid #e6e8ea}
.fre-dropdown__noicon{display:inline-block;width:16px}
.fre-hosterror{padding:8px 16px;background:#fef2f2;color:#991b1b;border-bottom:1px solid #fecaca}
.fre-panel__head{display:flex;align-items:center;gap:8px;height:48px;flex:0 0 48px;padding:0 8px 0 16px;border-bottom:1px solid #e6e8ea;background:#fff}
.fre-panel__head h2{flex:1;margin:0;font-size:15px;font-weight:700;color:#0c0d0e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fre-panel__headbtn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:0;border-radius:4px;background:none;color:#515962;cursor:pointer}
.fre-panel__headbtn:hover{background:#f1f2f3;color:#0c0d0e}

.fre-root--full{--fre-line:#e6e8ea;--fre-border:#d5d8dc;--fre-text:#515962;--fre-ink:#0c0d0e;--fre-hover:#f1f2f3;font:13px/1.35 Roboto,system-ui,-apple-system,"Segoe UI",sans-serif}
.fre-root--full .fre-panel{background:#fff;border-right:0;box-shadow:0 0 5px rgba(0,0,0,.1);z-index:2}
.fre-root--full .fre-panel__body{padding:0;color:var(--fre-text)}
.fre-root--full .fre-panel__body>*:not(.fre-elements):not(.fre-element):not(.fre-history){padding:12px 16px}
.fre-subtabs{display:flex;border-bottom:1px solid var(--fre-line)}
.fre-subtabs button{flex:1;height:44px;border:0;border-bottom:3px solid transparent;background:none;color:var(--fre-text);font-weight:500;cursor:pointer}
.fre-subtabs button.is-on{color:var(--fre-ink);border-bottom-color:var(--fre-ink)}
.fre-searchbox{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:8px;padding:0 15px;height:46px;background:#fff;border-bottom:1px solid var(--fre-line);color:#818a96}
.fre-searchbox input{flex:1;min-width:0;height:30px;border:0;background:none;font:italic 12px Roboto,system-ui,sans-serif;color:var(--fre-ink);outline:0}
.fre-root--full .fre-category{border-top:1px solid var(--fre-line)}
.fre-root--full .fre-category:first-of-type{border-top:0}
.fre-category__head{display:flex;align-items:center;justify-content:space-between;width:100%;height:48px;padding:0 18px;border:0;background:none;color:var(--fre-ink);font:700 13px Roboto,system-ui,sans-serif;cursor:pointer}
.fre-category__head svg{transition:transform .15s;transform:rotate(90deg);color:#818a96}
.fre-category.is-closed .fre-category__head svg{transform:none}
.fre-root--full .fre-tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:0 15px 18px}
.fre-root--full .fre-tile{gap:0;padding:0;height:86px;justify-content:center;border:1px solid var(--fre-border);border-radius:3px;color:var(--fre-text);cursor:move;transition:background .15s}
.fre-root--full .fre-tile svg{margin-bottom:10px;color:var(--fre-ink)}
.fre-root--full .fre-tile span{font-size:12px;line-height:1.2;padding:0 6px}
.fre-root--full .fre-tile:hover{border-color:var(--fre-border);background:var(--fre-hover);color:var(--fre-ink);box-shadow:none}
.fre-root--full .fre-element{padding:0}
.fre-root--full .fre-crumbs{margin:0;padding:10px 18px 6px;font-size:11px}
.fre-root--full .fre-tabs{margin:0;padding:0;border-bottom:1px solid var(--fre-line)}
.fre-root--full .fre-tabs button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 0 8px;border-bottom:3px solid transparent;color:var(--fre-text);font-size:10px;font-weight:400}
.fre-root--full .fre-tabs button.is-on{color:var(--fre-ink);border-bottom-color:var(--fre-ink)}
.fre-root--full .fre-section{border-bottom:0;border-top:1px solid var(--fre-line)}
.fre-root--full .fre-section:first-of-type{border-top:0}
.fre-root--full .fre-section__head{justify-content:space-between;height:48px;padding:0 20px;font:700 13px Roboto,system-ui,sans-serif;color:var(--fre-ink)}
.fre-root--full .fre-section__head svg{color:#818a96}
.fre-root--full .fre-section__body{padding:0 20px 15px}
.fre-root--full .fre-states{height:27px;border-color:var(--fre-border);border-radius:3px}
.fre-root--full .fre-states button{padding:0;font-size:12px;color:var(--fre-text)}
.fre-root--full .fre-states button.is-on{background:var(--fre-border);color:var(--fre-ink);font-weight:500}
.fre-root--full .fre-control{margin:0 0 15px}
.fre-root--full .fre-control__label{font-size:12px;font-weight:400;color:var(--fre-text)}
.fre-root--full .fre-input{min-height:27px;padding:4px 7px;border-color:var(--fre-border);border-radius:3px;font-size:12px}
.fre-root--full .fre-input:focus{outline:0;border-color:#818a96;box-shadow:0 0 0 1px #818a96 inset}
.fre-root--full .fre-unit{min-height:27px;border:0;background:none;color:var(--fre-text);font-size:11px;cursor:pointer}
.fre-root--full .fre-choose{border-color:var(--fre-border);border-radius:3px}
.fre-root--full .fre-choose button{height:27px;border-right-color:var(--fre-border);color:var(--fre-text)}
.fre-root--full .fre-choose button.is-on{background:var(--fre-border);color:var(--fre-ink)}
.fre-root--full .fre-help{font-size:11px;font-style:italic;color:#818a96}
.fre-root--full .fre-empty-note{color:var(--fre-text)}

.fre-devices{position:relative;display:inline-flex}
.fre-devices>button{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:0;border-radius:3px;background:none;color:#818a96;cursor:pointer}
.fre-devices>button:hover,.fre-devices.is-open>button{color:var(--fre-accent)}
.fre-devices__list{position:absolute;top:100%;left:-3px;z-index:30;display:flex;flex-direction:column;padding:3px;border-radius:3px;background:#fff;box-shadow:0 0 3px rgba(0,0,0,.2)}
.fre-devices__list button{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:0;border-radius:3px;background:none;color:#515962;cursor:pointer}
.fre-devices__list button:hover{color:var(--fre-accent);background:#f1f2f3}
.fre-devices__list button.is-on{color:var(--fre-accent)}
.fre-fontpick{position:relative;width:100%;min-width:0}
.fre-fontpick__value{display:flex;align-items:center;justify-content:space-between;text-align:left;cursor:pointer}
.fre-fontpick__value span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fre-fontpick__value::after{content:'';flex:0 0 auto;margin-left:6px;border:4px solid transparent;border-top-color:currentColor;transform:translateY(2px)}
.fre-fontpick__menu{position:absolute;top:100%;left:0;right:0;z-index:40;margin-top:2px;padding:6px;border-radius:6px;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.18);min-width:220px}
.fre-fontpick__list{position:relative;margin-top:6px;overflow-y:auto}
.fre-fontpick__group{position:absolute;left:0;right:0;display:flex;align-items:flex-end;padding:0 8px 4px;font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#818a96}
.fre-fontpick__option{position:absolute;left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 8px;border:0;border-radius:4px;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer}
.fre-fontpick__option span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fre-fontpick__option small{flex:0 0 auto;color:#9ca3af;font-size:10px}
.fre-fontpick__option:hover,.fre-fontpick__option.is-active{background:#f1f2f3}
.fre-fontpick__option.is-on{color:var(--fre-accent);font-weight:600}
.fre-fontpick__none{margin:8px;color:#818a96}
.fre-group{position:relative}
.fre-toggle{display:inline-flex;align-items:center;justify-content:center;width:27px;height:27px;border:1px solid var(--fre-border,#d5d8dc);border-radius:3px;background:#fff;color:#515962;cursor:pointer}
.fre-toggle:hover,.fre-toggle.is-on{border-color:#818a96;color:var(--fre-ink,#0c0d0e)}
.fre-toggle.is-used{color:var(--fre-accent)}
.fre-popup{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:25;padding:15px 15px 0;border-radius:3px;background:#fff;box-shadow:0 2px 15px rgba(0,0,0,.3)}
.fre-popup::before{content:'';position:absolute;top:-6px;right:12px;border:6px solid transparent;border-top:0;border-bottom-color:#fff;filter:drop-shadow(0 -1px 1px rgba(0,0,0,.08))}
.fre-popup--globals{padding:6px 0 8px}
.fre-popup__title{margin:4px 14px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#818a96}
.fre-popup__font{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:8px 14px;border:0;background:none;color:var(--fre-ink,#0c0d0e);text-align:left;cursor:pointer}
.fre-popup__font span{font-size:15px;line-height:1.2}
.fre-popup__font small{font:10px Roboto,system-ui,sans-serif;color:#818a96}
.fre-popup__font:hover{background:#f1f2f3}
.fre-popup__font.is-on{background:var(--fre-accent-soft);box-shadow:inset 3px 0 0 var(--fre-accent)}
.fre-globaltag{margin-left:6px;padding:1px 6px;border-radius:999px;background:var(--fre-accent-soft);color:var(--fre-accent);font-style:normal;font-size:10px}

.fre-navw{position:fixed;z-index:70;display:flex;flex-direction:column;border-radius:5px;background:#fff;box-shadow:0 2px 20px rgba(0,0,0,.18);font:12px Roboto,system-ui,sans-serif;color:#515962;overflow:hidden}
.fre-navw__head{display:flex;align-items:center;gap:6px;height:40px;flex:0 0 40px;padding:0 6px;border-bottom:1px solid #e6e8ea;background:#fff;cursor:move;user-select:none}
.fre-navw__head span{flex:1;text-align:center;font-weight:700;font-size:13px;color:#0c0d0e}
.fre-navw__btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:3px;background:none;color:#515962;cursor:pointer}
.fre-navw__btn:hover{background:#f1f2f3;color:#0c0d0e}
.fre-navw__body{flex:1;overflow:auto;padding:4px 0}
.fre-navw__body ul{list-style:none;margin:0;padding:0}
.fre-navw__row{position:relative;display:flex;align-items:center;gap:6px;height:30px;padding-right:6px;cursor:default;user-select:none}
.fre-navw__row:hover{background:#f1f2f3}
.fre-navw__row.is-on{background:var(--fre-accent-soft,#fff1e8);color:var(--fre-accent)}
.fre-navw__row.is-hidden .fre-navw__title{opacity:.45;text-decoration:line-through}
.fre-navw__row.is-dragging{opacity:.4}
.fre-navw__row.is-drop-before{box-shadow:inset 0 2px 0 var(--fre-accent)}
.fre-navw__row.is-drop-after{box-shadow:inset 0 -2px 0 var(--fre-accent)}
.fre-navw__row.is-drop-inside{background:var(--fre-accent-soft,#fff1e8);outline:1px dashed var(--fre-accent);outline-offset:-1px}
.fre-navw__caret{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex:0 0 16px;padding:0;border:0;background:none;color:#818a96;cursor:pointer}
.fre-navw__title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:grab;line-height:30px}
.fre-navw__rename{flex:1;min-width:0;height:22px;padding:0 4px;border:1px solid #818a96;border-radius:3px;font:inherit}
.fre-navw__eye{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:3px;background:none;color:#818a96;cursor:pointer;opacity:0}
.fre-navw__row:hover .fre-navw__eye,.fre-navw__eye.is-on{opacity:1}
.fre-navw__eye:hover{color:#0c0d0e}
.fre-navw__empty{padding:14px;text-align:center;color:#818a96}
.fre-navw__foot{height:10px;flex:0 0 10px;border-top:1px solid #e6e8ea;background:linear-gradient(135deg,transparent 60%,#d5d8dc 60%,#d5d8dc 70%,transparent 70%,transparent 80%,#d5d8dc 80%) right bottom/10px 10px no-repeat;cursor:nwse-resize}

.fre-history__list{list-style:none;margin:0;padding:10px 12px;display:grid;gap:6px}
.fre-history__item,.fre-history__rev{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:10px 12px;border:1px solid #e6e8ea;border-radius:3px;background:#fff;color:#515962;text-align:left;cursor:pointer;font:12px Roboto,system-ui,sans-serif}
.fre-history__item:hover,.fre-history__rev:hover{background:#f1f2f3}
.fre-history__item.is-current,.fre-history__rev.is-current{border-color:var(--fre-accent);color:var(--fre-ink,#0c0d0e);box-shadow:inset 3px 0 0 var(--fre-accent)}
.fre-history__item.is-undone{opacity:.5}
.fre-history__item small{color:#818a96;font-size:11px}
.fre-history__rev{justify-content:flex-start}
.fre-history__rev span:last-child{display:flex;flex-direction:column;gap:2px}
.fre-history__rev strong{font-weight:600;color:#0c0d0e}
.fre-history__rev small{color:#818a96;font-size:11px}
.fre-history__rev:disabled{opacity:.45;cursor:default}
.fre-history__avatar{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:0 0 30px;border-radius:50%;background:#e6e8ea;color:#515962;font-weight:700}
.fre-history__apply{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 12px 0;padding:10px;border-radius:3px;background:var(--fre-accent-soft)}
.fre-history__apply span{flex-basis:100%;color:var(--fre-ink,#0c0d0e)}

.fre-root--full .fre-canvas{background:#e6e8ea}
.fre-canvas.is-device{flex-direction:column;align-items:center;padding:0 20px 20px;background:#2b2f34;overflow:auto}
.fre-canvas.is-device .fre-frame{position:relative;flex:1 1 auto;height:auto;min-height:0;box-shadow:0 0 3px rgba(0,0,0,.3),0 0 20px rgba(0,0,0,.15)}
.fre-frame.is-resizing .fre-iframe{pointer-events:none}
.fre-frame.is-resizing{transition:none}
.fre-frame__handle{position:absolute;top:50%;width:4px;height:50px;margin-top:-25px;border-radius:2px;background:rgba(255,255,255,.35);cursor:ew-resize}
.fre-frame__handle::before{content:'';position:absolute;inset:-6px -10px}
.fre-frame__handle:hover{background:rgba(255,255,255,.8)}
.fre-frame__handle--left{left:-12px}
.fre-frame__handle--right{right:-12px}
.fre-rbar{display:flex;align-items:center;gap:6px;height:40px;flex:0 0 40px;color:#d5d9de;font:12px Roboto,system-ui,sans-serif}
.fre-rbar label{display:flex;align-items:center;gap:4px}
.fre-rbar label span{color:#8b929b}
.fre-rbar input{width:62px;height:26px;padding:0 6px;border:1px solid #3f444b;border-radius:3px;background:#1d2126;color:#fff;font:12px Roboto,system-ui,sans-serif}
.fre-rbar button{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 6px;border:0;border-radius:3px;background:none;color:#d5d9de;cursor:pointer;font:inherit;font-size:14px}
.fre-rbar button:hover{background:#3f444b;color:#fff}
.fre-rbar .fre-rbar__text{font-size:12px}
.fre-rbar__zoom{min-width:38px;text-align:center}
.fre-rbar__sep{width:1px;height:18px;margin:0 6px;background:#3f444b}

.fre-main{position:relative}
.fre-paneltoggle{position:absolute;left:0;top:50%;z-index:5;display:inline-flex;align-items:center;justify-content:center;width:16px;height:48px;margin-top:-24px;padding:0;border:0;border-radius:0 4px 4px 0;background:#fff;color:#515962;box-shadow:2px 0 4px rgba(0,0,0,.12);cursor:pointer;opacity:.6}
.fre-paneltoggle:hover{opacity:1}
.fre-modalbg{position:fixed;inset:0;z-index:200;display:flex;align-items:flex-start;justify-content:center;padding-top:18vh;background:rgba(0,0,0,.4)}
.fre-finder{width:min(650px,92vw);border-radius:3px;background:#fff;box-shadow:0 2px 15px rgba(0,0,0,.3);overflow:hidden;font:13px Roboto,system-ui,sans-serif;color:#515962}
.fre-finder__search{display:flex;align-items:center;gap:10px;height:50px;padding:0 16px;border-bottom:1px solid #e6e8ea;color:#818a96}
.fre-finder__search input{flex:1;height:40px;border:0;outline:0;font:italic 14px Roboto,system-ui,sans-serif;color:#0c0d0e}
.fre-finder__list{max-height:min(60vh,440px);overflow:auto;padding:6px 0 10px}
.fre-finder__group{margin:10px 16px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#818a96}
.fre-finder__item{display:flex;align-items:center;gap:10px;width:100%;padding:8px 16px;border:0;background:none;color:#0c0d0e;text-align:left;cursor:pointer;font:13px Roboto,system-ui,sans-serif}
.fre-finder__item small{margin-left:auto;color:#818a96;font-size:11px}
.fre-finder__item.is-active{background:var(--fre-accent-soft);color:var(--fre-accent)}
.fre-finder__none{padding:14px 16px;color:#818a96}
.fre-shortcuts{width:min(860px,94vw);border-radius:3px;background:#fff;box-shadow:0 2px 15px rgba(0,0,0,.3);font:13px Roboto,system-ui,sans-serif;color:#515962}
.fre-shortcuts__head{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #e6e8ea}
.fre-shortcuts__head h2{margin:0;font-size:15px;color:#0c0d0e}
.fre-shortcuts__head button{border:0;background:none;font-size:22px;color:#818a96;cursor:pointer}
.fre-shortcuts__cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;padding:18px 20px 22px}
.fre-shortcuts h3{margin:0 0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#818a96}
.fre-shortcuts p{display:flex;justify-content:space-between;gap:10px;margin:0;padding:7px 0;border-bottom:1px solid #f1f2f3}
.fre-shortcuts kbd{display:inline-block;min-width:22px;margin-left:3px;padding:2px 6px;border:1px solid #d5d8dc;border-bottom-width:2px;border-radius:3px;background:#fff;font:11px Roboto,system-ui,sans-serif;text-align:center;color:#0c0d0e}

.fre-modalbg--center{align-items:center;padding-top:0}
.fre-dialog{width:min(420px,92vw);padding:22px 24px 18px;border-radius:3px;background:#fff;box-shadow:0 2px 15px rgba(0,0,0,.3);font:13px Roboto,system-ui,sans-serif;color:#515962}
.fre-dialog h2{margin:0 0 12px;font-size:15px;color:#0c0d0e}
.fre-dialog p{margin:0 0 14px}
.fre-dialog label{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
.fre-dialog input{height:34px;padding:0 10px;border:1px solid #d5d8dc;border-radius:3px;font:13px Roboto,system-ui,sans-serif}
.fre-dialog input:focus{outline:0;border-color:var(--fre-accent);box-shadow:0 0 0 1px var(--fre-accent)}
.fre-dialog__actions{display:flex;justify-content:flex-end;gap:8px}
.fre-root .fre-button--primary{color:#fff}
.fre-button--danger{background:#dc2626!important;border-color:#dc2626!important}
.fre-toasts{position:fixed;left:16px;bottom:16px;z-index:300;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.fre-toast{max-width:380px;margin:0;padding:12px 16px;border-radius:4px;background:#1f2124;color:#fff;font:13px Roboto,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);animation:fre-in .2s ease-out}
.fre-toast--success{box-shadow:inset 4px 0 0 #0a875a,0 4px 14px rgba(0,0,0,.25)}
.fre-toast--error{box-shadow:inset 4px 0 0 #dc2626,0 4px 14px rgba(0,0,0,.25)}
@keyframes fre-in{from{opacity:0;transform:translateY(8px)}}

.fre-root--full .fre-site--menu{padding:0!important}
.fre-site--menu>.fre-help{margin:12px 18px 4px}
.fre-sitemenu h4{margin:16px 18px 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#818a96}
.fre-sitemenu button{display:flex;align-items:center;gap:12px;width:100%;height:44px;padding:0 18px;border:0;border-top:1px solid #f1f2f3;background:none;color:#0c0d0e;text-align:left;cursor:pointer;font:13px Roboto,system-ui,sans-serif}
.fre-sitemenu button span{flex:1}
.fre-sitemenu button svg:first-child{color:#515962}
.fre-sitemenu button svg:last-child{color:#babfc5}
.fre-sitemenu button:hover{background:#f1f2f3}
.fre-site__back{display:flex;align-items:center;gap:8px;width:calc(100% + 32px);margin:-12px -16px 14px;padding:0 16px;height:44px;border:0;border-bottom:1px solid #e6e8ea;background:#fff;color:#0c0d0e;font:700 13px Roboto,system-ui,sans-serif;cursor:pointer;text-align:left}
.fre-site__back:hover{background:#f1f2f3}
.fre-sizefield{display:inline-flex;align-items:center;gap:2px}

.fre-root--full .fre-panel{position:relative;width:var(--fre-panel-width,300px);flex-basis:var(--fre-panel-width,300px)}
.fre-panel__resize{position:absolute;top:0;right:0;z-index:6;width:6px;height:100%;cursor:ew-resize;touch-action:none}
.fre-panel__resize::after{content:'';position:absolute;top:0;bottom:0;right:0;width:2px;background:transparent;transition:background .15s}
.fre-panel__resize:hover::after,.fre-panel__resize:focus-visible::after,.is-resizing-panel .fre-panel__resize::after{background:var(--fre-accent)}
.fre-panel__resize:focus{outline:0}
.is-resizing-panel{cursor:ew-resize;user-select:none}
.is-resizing-panel .fre-iframe{pointer-events:none}

.fre-navw--docked{position:relative;inset:auto;flex:0 0 auto;height:auto;border-radius:0;border-left:1px solid #e6e8ea;box-shadow:none;z-index:2}
.fre-navw--docked .fre-navw__head{cursor:default}
.fre-navw__btn.is-on{color:var(--fre-accent)}
.fre-navw__edge{position:absolute;top:0;left:-4px;z-index:3;width:8px;height:100%;cursor:ew-resize}
.fre-navw__edge:hover{background:linear-gradient(90deg,transparent 3px,var(--fre-accent) 3px,var(--fre-accent) 5px,transparent 5px)}

.fre-multinote{display:flex;flex-direction:column;gap:4px;margin:10px 16px 0;padding:10px 12px;border-radius:3px;background:var(--fre-accent-soft);color:var(--fre-ink);font-size:12px}
.fre-multinote span{color:var(--fre-text,#515962)}
.fre-multinote button{align-self:flex-start;padding:0;border:0;background:none;color:var(--fre-accent);cursor:pointer;font:inherit;text-decoration:underline}
.fre-menu__note{margin:4px 20px 6px;font-size:12px;font-weight:600;color:var(--fre-accent)}

.fre-picker{width:252px;padding:12px}
.fre-picker__box{position:relative;height:140px;border-radius:3px;cursor:crosshair;touch-action:none;background-image:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent)!important}
.fre-picker__box{background-blend-mode:normal}
.fre-picker__box:focus-visible{outline:2px solid var(--fre-accent);outline-offset:2px}
.fre-picker__dot{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 1px 3px rgba(0,0,0,.3);pointer-events:none}
.fre-picker__row{display:flex;align-items:center;gap:8px;margin-top:10px}
.fre-picker__sliders{display:flex;flex:1;flex-direction:column;gap:8px;min-width:0}
.fre-picker__sliders input{-webkit-appearance:none;appearance:none;width:100%;height:10px;margin:0;border-radius:5px;cursor:pointer}
.fre-picker__hue{background:linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)}
.fre-picker__alpha{background:var(--fre-alpha),repeating-conic-gradient(#d5d8dc 0 25%,#fff 0 50%) 0 0/8px 8px}
.fre-picker__sliders input::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border:2px solid #fff;border-radius:50%;background:transparent;box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.fre-picker__sliders input::-moz-range-thumb{width:10px;height:10px;border:2px solid #fff;border-radius:50%;background:transparent;box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.fre-picker__preview{flex:0 0 30px;width:30px;height:30px;border-radius:50%;overflow:hidden;border:1px solid #d5d8dc;background:repeating-conic-gradient(#d5d8dc 0 25%,#fff 0 50%) 0 0/8px 8px}
.fre-picker__preview span{display:block;width:100%;height:100%}
.fre-picker__row .fre-input{flex:1;min-width:0}
.fre-picker__alphavalue{min-width:36px;text-align:right;font-size:11px;color:#818a96}
.fre-popover--globals{width:230px;padding:8px 0}
.fre-popover--globals .fre-popover__title{margin:2px 12px 6px}
.fre-popover--globals .fre-globals{max-height:240px;padding:0 4px}
.fre-popover--globals .fre-help{margin:6px 12px 2px}
.fre-globals button{width:100%}
.fre-globals small{margin-left:auto;color:#818a96;font:10px ui-monospace,monospace}
.fre-globals button.is-on{box-shadow:inset 3px 0 0 var(--fre-accent)}

.fre-draghandle{display:inline-flex;align-items:center;justify-content:center;width:22px;height:30px;flex:0 0 22px;color:#9da5ae;cursor:grab;touch-action:none}
.fre-draghandle:hover,.fre-draghandle:focus-visible{color:var(--fre-ink,#0c0d0e);outline:0}
.fre-repeater.is-sorting{cursor:grabbing;user-select:none}
.fre-repeater__item{transition:opacity .15s}
.fre-repeater__item.is-dragging{opacity:.45}
.fre-repeater__item.is-drop-before{box-shadow:0 -3px 0 var(--fre-accent)}
.fre-repeater__item.is-drop-after{box-shadow:0 3px 0 var(--fre-accent)}

.fre-root--full .fre-panel__body>.fre-pageview{padding:0}
.fre-pageview__body{padding:12px 16px}
.fre-pageview__section+.fre-pageview__section{margin-top:12px}
.fre-status{display:inline-block;padding:2px 8px;border-radius:999px;background:#f1f2f3;color:#515962;font-size:11px}
.fre-status--published,.fre-status--private{background:#e6f4ef;color:#0a6b47}
.fre-status--draft,.fre-status--pending{background:var(--fre-accent-soft);color:var(--fre-accent)}

/* Elements from other plugins: their plugin's name (2.3), and the filter by plugin. */
.fre-tile__badge{position:absolute;top:3px;right:3px;max-width:calc(100% - 6px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:normal;font-size:9px;font-weight:600;line-height:14px;padding:0 4px;border-radius:3px;background:var(--fre-hover,#f1f2f3);color:var(--fre-text,#515962)}
.fre-sourcefilter{padding:8px 15px 0}
.fre-sourcefilter .fre-input{min-height:28px;font-size:12px}
.fre-globalslist .fre-tiles{padding:10px 15px}
.fre-globalslist>.fre-help,.fre-globalslist>.fre-empty-note,.fre-globalslist>.fre-error{padding:0 15px}
.fre-tile--global svg{color:var(--fre-accent)}
/* The bar of a global widget edited in place. */
.fre-globalbar{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff7ed;border-bottom:1px solid #fed7aa;color:#7c2d12;font-size:12.5px}
.fre-globalbar span{flex:1}
/* Site navigation on the title. */
.fre-bar__center{position:relative}
.fre-sitenav{position:relative;display:inline-flex}
.fre-sitenav__toggle{width:24px}
.fre-dropdown--center{left:50%;transform:translateX(-50%);min-width:280px;max-height:70vh;overflow:auto}
.fre-dropdown__title{margin:6px 16px 4px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#818a96}
.fre-dropdown__note{margin:4px 16px 8px;color:#818a96}
.fre-dropdown small{margin-left:auto;color:#818a96;font-size:11px}
.fre-dropdown span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Structure window: signs and the keyboard. */
.fre-navw__signs{display:inline-flex;gap:3px;margin-left:auto;color:#9da5ae}
.fre-navw__signs+.fre-navw__eye{margin-left:4px}
.fre-navw__sign{display:inline-flex}
.fre-navw__sign--global{color:var(--fre-accent)}
.fre-navw__row:focus{outline:none}
.fre-navw__row:focus-visible{box-shadow:inset 0 0 0 2px var(--fre-accent)}
.fre-history__rev.is-other{opacity:.6}
/* Rich text. */
.fre-rich__bar{align-items:center}
.fre-rich__group{display:inline-flex;gap:1px;padding-left:3px;margin-left:2px;border-left:1px solid var(--fre-line)}
.fre-rich__format{height:26px;max-width:120px;border:1px solid var(--fre-line);border-radius:4px;background:#fff;font:inherit;font-size:12px;color:inherit}
.fre-rich__area img{max-width:100%;height:auto}
.fre-rich__area pre{white-space:pre-wrap;font-family:ui-monospace,monospace}
.fre-rich__area blockquote{margin:0 0 .7em;padding-left:10px;border-left:3px solid var(--fre-line)}
/* Site settings: a global font's other values; preferences. */
.fre-kitfont__more{margin:6px 0 4px;padding:8px 8px 2px;border-radius:4px;background:var(--fre-hover,#f1f2f3)}
.fre-prefs{padding:12px 16px}
.fre-site .fre-sizefield{display:inline-flex;gap:4px}

/* ---- Dark theme (User preferences) ---------------------------------------------------- */
.fre-root--dark{--fre-line:#3f444b;--fre-border:#4b5159;--fre-text:#c7cbd1;--fre-ink:#f1f2f3;--fre-muted:#9da5ae;--fre-hover:#30353b;--fre-bg:#26292c;--fre-accent-soft:#4a2a1c;color:var(--fre-ink);background:#1d2126;color-scheme:dark}
.fre-root--dark .fre-panel,.fre-root--dark.fre-root--full .fre-panel,.fre-root--dark .fre-panel__head,.fre-root--dark .fre-searchbox,.fre-root--dark .fre-popup,.fre-root--dark .fre-popover,.fre-root--dark .fre-navw,.fre-root--dark .fre-menu,.fre-root--dark .fre-dropdown,.fre-root--dark .fre-finder,.fre-root--dark .fre-dialog,.fre-root--dark .fre-modal__box,.fre-root--dark .fre-shortcuts,.fre-root--dark .fre-fontpick__menu,.fre-root--dark .fre-devices__list{background:#26292c;color:var(--fre-ink)}
.fre-root--dark .fre-panel__head{border-color:var(--fre-line)}
.fre-root--dark .fre-panel__head h2{color:var(--fre-ink)}
.fre-root--dark .fre-panel__headbtn{color:var(--fre-text)}
.fre-root--dark .fre-panel__headbtn:hover{background:var(--fre-hover);color:#fff}
.fre-root--dark .fre-site__back{background:#26292c;border-color:var(--fre-line)}
.fre-root--dark .fre-site__back:hover{background:var(--fre-hover)}
.fre-root--dark .fre-crumbs button{color:#fb923c}
.fre-root--dark .fre-input,.fre-root--dark .fre-unit,.fre-root--dark .fre-rich__format,.fre-root--dark .fre-choose,.fre-root--dark .fre-choose button,.fre-root--dark .fre-states,.fre-root--dark .fre-states button,.fre-root--dark .fre-link,.fre-root--dark .fre-color__swatch,.fre-root--dark .fre-fontpick__value,.fre-root--dark .fre-chip,.fre-root--dark .fre-button,.fre-root--dark .fre-media__preview,.fre-root--dark .fre-repeater__item,.fre-root--dark .fre-history__item,.fre-root--dark .fre-history__rev,.fre-root--dark .fre-library__item,.fre-root--dark .fre-dialog input{background:#1f2124;border-color:var(--fre-border);color:var(--fre-ink)}
.fre-root--dark .fre-choose button.is-on,.fre-root--dark .fre-button--primary{background:var(--fre-accent);color:#fff;border-color:var(--fre-accent)}
.fre-root--dark .fre-states button.is-on,.fre-root--dark .fre-chip.is-on{background:var(--fre-accent-soft);color:#fdba74}
.fre-root--dark .fre-tile,.fre-root--dark.fre-root--full .fre-tile{background:#2f343a;border-color:var(--fre-border);color:var(--fre-text)}
.fre-root--dark .fre-tile:hover{background:#3a4048;color:#fff}
.fre-root--dark .fre-tile__badge{background:#1f2124;color:var(--fre-muted)}
.fre-root--dark .fre-control__label,.fre-root--dark .fre-sitemenu button,.fre-root--dark .fre-section__head,.fre-root--dark .fre-category__head,.fre-root--dark .fre-subtabs button.is-on,.fre-root--dark .fre-tabs button.is-on,.fre-root--dark .fre-site__back{color:var(--fre-ink)}
.fre-root--dark .fre-sitemenu button{border-color:var(--fre-line)}
.fre-root--dark .fre-sitemenu button:hover,.fre-root--dark .fre-menu button:hover,.fre-root--dark .fre-dropdown a:hover,.fre-root--dark .fre-dropdown button:hover,.fre-root--dark .fre-navw__row:hover,.fre-root--dark .fre-finder__item.is-active,.fre-root--dark .fre-history__item:hover,.fre-root--dark .fre-history__rev:hover,.fre-root--dark .fre-iconbtn:hover{background:var(--fre-hover);color:#fff}
.fre-root--dark .fre-navw__row.is-on{background:#3a2a22;color:#fff}
.fre-root--dark .fre-menu,.fre-root--dark .fre-navw{color:var(--fre-text)}
.fre-root--dark .fre-menu button,.fre-root--dark .fre-dropdown a,.fre-root--dark .fre-dropdown button,.fre-root--dark .fre-finder__item{color:var(--fre-text)}
.fre-root--dark .fre-menu kbd,.fre-root--dark .fre-shortcuts kbd{background:#1f2124;border-color:var(--fre-border);color:var(--fre-text)}
.fre-root--dark .fre-finder__search input,.fre-root--dark .fre-searchbox input{color:var(--fre-ink)}
.fre-root--dark .fre-rich__bar,.fre-root--dark .fre-kitfont__more,.fre-root--dark .fre-status{background:#1f2124}
.fre-root--dark .fre-rich{border-color:var(--fre-border)}
.fre-root--dark .fre-switch span{background:#4b5159}
.fre-root--dark .fre-notice{background:#3d3220;color:#fcd34d}
.fre-root--dark .fre-globalbar{background:#3a2a22;border-color:#7c2d12;color:#fed7aa}
.fre-root--dark .fre-canvas{background:#1d2126}
.fre-root--dark .fre-paneltoggle{background:#26292c;color:var(--fre-text)}
.fre-root--dark .fre-preview-font{color:var(--fre-ink)}
.fre-root--dark .fre-help,.fre-root--dark .fre-empty-note,.fre-root--dark .fre-subheading{color:var(--fre-muted)}
/* Wave 4: components, class and variables managers, interactions */
.fre-componentslist{padding:10px 12px 0}
.fre-componentslist .fre-tiles{margin-top:8px}
.fre-componentslist>.fre-empty-note{padding:6px 0}
.fre-tilewrap{position:relative;display:block}
.fre-tilewrap .fre-tile{width:100%}
.fre-tile__delete{position:absolute;top:2px;right:2px}
.fre-tile--component svg{color:#7c3aed}
.fre-component-panel{padding:12px}
.fre-component-panel__title{display:flex;align-items:center;gap:6px;margin:0 0 10px;color:#7c3aed}
.fre-compprops .fre-section__head{cursor:default}
.fre-check{display:flex;align-items:center;gap:6px;flex:1;font-size:12px}
.fre-button--small{padding:3px 9px;font-size:12px;margin-top:6px}
.fre-dstable{display:flex;flex-direction:column}
.fre-dsrow>.fre-input{flex:1;min-width:0}
.fre-dsrow>.fre-mono{max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fre-dsrow.is-deleted{opacity:.75}
.fre-dsrow .fre-dsname{flex:1}
.fre-dstype{flex:none;width:34px;font-size:10px;text-transform:uppercase;color:var(--fre-muted);text-align:center}
.fre-swatch{display:inline-block;width:18px;height:18px;border-radius:4px;border:1px solid var(--fre-line);vertical-align:middle}
.fre-dsusage{flex:none;min-width:22px;text-align:right;font-size:11px;color:var(--fre-muted)}
.fre-ia{padding:12px;display:flex;flex-direction:column;gap:10px}
.fre-ia__item{border:1px solid var(--fre-line);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:6px}
.fre-ia__head{display:flex;align-items:center;gap:6px}
.fre-ia__head strong{flex:1;font-size:12px}
.fre-ia__field{display:flex;align-items:center;gap:8px;font-size:12px}
.fre-ia__field>span{flex:0 0 92px;color:var(--fre-muted)}
.fre-ia__field>.fre-input{flex:1;min-width:0}
`;
