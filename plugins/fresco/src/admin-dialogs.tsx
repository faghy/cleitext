/**
 * The editor's dialogs (a confirmation, a box to type a name, notices) on
 * admin pages of Fresco and of the plugins that extend it, with the few
 * styles they need outside the editor.
 */
import { Dialogs } from './editor/dialogs.js';

export { askText, confirmAction, notify } from './editor/dialogs.js';

const DIALOG_CSS = `
.frx-dialogs{--fre-accent:#c2410c}
.frx-dialogs .fre-modalbg{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.4)}
.frx-dialogs .fre-dialog{width:min(420px,92vw);padding:22px 24px 18px;border-radius:6px;background:#fff;box-shadow:0 2px 15px rgba(0,0,0,.3);font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#515962}
.frx-dialogs .fre-dialog h2{margin:0 0 12px;font-size:15px;color:#0c0d0e}
.frx-dialogs .fre-dialog p{margin:0 0 14px}
.frx-dialogs .fre-dialog label{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
.frx-dialogs .fre-dialog input{height:34px;padding:0 10px;border:1px solid #d5d8dc;border-radius:4px;font:inherit}
.frx-dialogs .fre-dialog input:focus{outline:0;border-color:var(--fre-accent);box-shadow:0 0 0 1px var(--fre-accent)}
.frx-dialogs .fre-dialog__actions{display:flex;justify-content:flex-end;gap:8px}
.frx-dialogs .fre-button{display:inline-flex;align-items:center;justify-content:center;padding:7px 14px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#1f2937;font:inherit;font-weight:500;cursor:pointer}
.frx-dialogs .fre-button:hover{border-color:var(--fre-accent);color:var(--fre-accent)}
.frx-dialogs .fre-button--primary,.frx-dialogs .fre-button--primary:hover{background:var(--fre-accent);border-color:var(--fre-accent);color:#fff}
.frx-dialogs .fre-button--danger,.frx-dialogs .fre-button--danger:hover{background:#dc2626;border-color:#dc2626}
.frx-dialogs .fre-toasts{position:fixed;left:16px;bottom:16px;z-index:1001;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.frx-dialogs .fre-toast{max-width:380px;margin:0;padding:12px 16px;border-radius:4px;background:#1f2124;color:#fff;font:13px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.frx-dialogs .fre-toast--success{box-shadow:inset 4px 0 0 #0a875a,0 4px 14px rgba(0,0,0,.25)}
.frx-dialogs .fre-toast--error{box-shadow:inset 4px 0 0 #dc2626,0 4px 14px rgba(0,0,0,.25)}
`;

/** Mounted once on an admin page that asks with `confirmAction` or `askText`. */
export function AdminDialogs() {
  return (
    <div className="frx-dialogs">
      <style>{DIALOG_CSS}</style>
      <Dialogs />
    </div>
  );
}
