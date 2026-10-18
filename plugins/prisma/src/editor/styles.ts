/** The look of Prisma's settings in the editor's sidebar (Spectra's layout). */
const CSS = `
.pr-tabs{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #e0e0e0;position:sticky;top:0;z-index:2;background:#fff}
.pr-tabs__tab.components-button{flex-direction:column;height:auto;padding:10px 4px 8px;gap:2px;justify-content:center;border-radius:0;color:#50575e;font-size:12px;box-shadow:none}
.pr-tabs__tab.components-button svg{margin:0}
.pr-tabs__tab.is-active.components-button{color:var(--wp-admin-theme-color,#3858e9);box-shadow:inset 0 -2px 0 var(--wp-admin-theme-color,#3858e9)}
.pr-panel .components-base-control{margin-bottom:16px}
.pr-label{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:500;text-transform:uppercase;line-height:1.4}
.pr-device__toggle.components-button{min-width:24px;height:24px;padding:0}
.pr-device__toggle.components-button svg{width:18px;height:18px}
.pr-range__head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.pr-units{display:inline-flex}
.pr-units__unit.components-button{height:22px;min-width:26px;padding:0 4px;font-size:11px}
.pr-spacing__fields{display:grid;grid-template-columns:repeat(4,1fr) auto;gap:4px;align-items:start}
.pr-spacing__side{display:flex;flex-direction:column;align-items:center;font-size:10px;color:#757575}
.pr-spacing__side input{width:100%;min-width:0;height:32px;border:1px solid #949494;border-radius:2px;padding:0 4px;text-align:center}
.pr-color__row{display:flex;align-items:center;justify-content:space-between}
.pr-color__toggle.components-button{padding:0;height:auto}
.pr-color__popover{padding:12px;width:260px}
.pr-states__switch{display:grid;grid-template-columns:1fr 1fr;margin-bottom:12px}
.pr-states__switch .components-button{justify-content:center}
.pr-media__box{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.pr-media__preview{border:0;padding:0;background:none;cursor:pointer}
.pr-media__preview img{max-width:100%;max-height:140px;display:block}
.pr-choice .components-toggle-group-control{margin-top:6px}
.pr-typography__popover{padding:12px;width:280px;display:grid;gap:4px}
`;

/** Added once to the admin's page (the sidebar is outside the canvas). */
export function addEditorStyles(): void {
  if (typeof document === 'undefined' || document.getElementById('prisma-editor-styles')) return;
  const style = document.createElement('style');
  style.id = 'prisma-editor-styles';
  style.textContent = CSS;
  document.head.append(style);
}
