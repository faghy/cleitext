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
`;
