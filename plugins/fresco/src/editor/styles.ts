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
.fre-color{position:relative;display:inline-flex}
.fre-color__swatch{width:30px;height:30px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;background-image:linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%),linear-gradient(45deg,#e5e7eb 25%,transparent 25%,transparent 75%,#e5e7eb 75%);background-size:8px 8px;background-position:0 0,4px 4px}
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
.fre-modal__grid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;padding:14px;align-content:start}
.fre-modal__grid--icons{grid-template-columns:repeat(auto-fill,minmax(92px,1fr))}
.fre-modal__foot{display:flex;justify-content:flex-end;padding:10px 14px;border-top:1px solid var(--fre-line)}
.fre-thumb{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;aspect-ratio:1;padding:6px;border:2px solid transparent;border-radius:8px;background:#f8fafc;cursor:pointer;overflow:hidden}
.fre-thumb img{width:100%;height:100%;object-fit:cover;border-radius:4px}
.fre-thumb.is-on,.fre-thumb:hover{border-color:var(--fre-accent)}
.fre-thumb--icon{aspect-ratio:auto;padding:12px 4px}
.fre-thumb--icon .fr-icon{width:24px;height:24px}
.fre-thumb--icon span{font-size:10.5px;color:var(--fre-muted);word-break:break-all;text-align:center}
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
.fre-menu{position:fixed;z-index:100000;min-width:200px;padding:4px;border:1px solid var(--fre-line,#e5e7eb);border-radius:8px;background:#fff;box-shadow:0 10px 30px rgba(0,0,0,.18);font:13px system-ui,sans-serif}
.fre-menu__title{margin:4px 8px 6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
.fre-menu button{display:flex;justify-content:space-between;gap:16px;width:100%;padding:6px 10px;border:0;border-radius:5px;background:none;cursor:pointer;text-align:left}
.fre-menu button:hover{background:#fff1e8;color:#c2410c}
.fre-menu button:disabled{opacity:.4;cursor:default;background:none;color:inherit}
.fre-menu kbd{font:11px system-ui,sans-serif;color:#9ca3af}
.fre-ok{color:#15803d;margin:8px 0}
.fre-library__save{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.fre-library__list{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:6px}
.fre-library__item{display:flex;align-items:center;gap:6px;padding:8px;border:1px solid var(--fre-line);border-radius:8px}
.fre-library__info{flex:1;min-width:0;display:flex;flex-direction:column}
.fre-library__info strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fre-library__info span{font-size:11.5px;color:var(--fre-muted)}
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
.fre-root--full .fre-panel{width:300px;flex-basis:300px}
.fre-panel__head{display:flex;align-items:center;gap:8px;height:48px;flex:0 0 48px;padding:0 8px 0 16px;border-bottom:1px solid #e6e8ea;background:#fff}
.fre-panel__head h2{flex:1;margin:0;font-size:15px;font-weight:700;color:#0c0d0e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fre-panel__headbtn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:0;border-radius:4px;background:none;color:#515962;cursor:pointer}
.fre-panel__headbtn:hover{background:#f1f2f3;color:#0c0d0e}

.fre-root--full{--fre-line:#e6e8ea;--fre-border:#d5d8dc;--fre-text:#515962;--fre-ink:#0c0d0e;--fre-hover:#f1f2f3;font:13px/1.35 Roboto,system-ui,-apple-system,"Segoe UI",sans-serif}
.fre-root--full .fre-panel{background:#fff;border-right:0;box-shadow:0 0 5px rgba(0,0,0,.1);z-index:2}
.fre-root--full .fre-panel__body{padding:0;color:var(--fre-text)}
.fre-root--full .fre-panel__body>*:not(.fre-elements):not(.fre-element){padding:12px 16px}
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
`;
