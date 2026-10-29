/**
 * Styles of the shop's admin pages. The admin's own classes cover only what
 * the admin uses, so the shop brings its own (prefix `sh-`), built on the
 * admin's palette variables: they follow its dark theme.
 */
export const CSS = `
.sh { --sh-line: var(--color-slate-200); --sh-muted: var(--color-slate-600); --sh-card: var(--color-white, #fff); font-size: .875rem; }
.sh h1 { font-size: 1.5rem; font-weight: 600; margin: 0; }
.sh-row { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
.sh-between { justify-content: space-between; }
.sh-stack > * + * { margin-top: 1rem; }
.sh-muted { color: var(--sh-muted); }
.sh-small { font-size: .75rem; }
.sh-card { background: var(--sh-card); border: 1px solid var(--sh-line); border-radius: .5rem; padding: 1rem; }
.sh-card > h2, .sh-card .sh-row > h2 { font-size: 1rem; font-weight: 600; margin: 0 0 .75rem; }
.sh-grid { display: grid; gap: .75rem 1rem; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); }
.sh-grid-2 { display: grid; gap: .75rem 1rem; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); }
.sh-field { display: flex; flex-direction: column; gap: .25rem; }
.sh-translations { border: 1px dashed var(--color-slate-300); border-radius: .5rem; padding: .5rem .75rem; }
.sh-translations > summary { cursor: pointer; font-weight: 500; color: var(--color-slate-700); }
.sh-translations[open] > summary { margin-bottom: .5rem; }
.sh-translations fieldset { border: 0; margin: 0 0 .75rem; padding: 0; }
.sh-translations legend { font-weight: 600; margin-bottom: .25rem; }
.sh-field > span { font-weight: 500; color: var(--color-slate-800); }
.sh-field small { color: var(--sh-muted); }
.sh-field .sh-error, .sh-error { color: var(--color-red-700); font-size: .75rem; }
.sh input[type=text], .sh input[type=search], .sh input[type=password], .sh input[type=date], .sh input[type=number], .sh input[type=datetime-local], .sh input[type=url],
.sh select, .sh textarea {
  border: 1px solid var(--color-slate-300); border-radius: .375rem; padding: .4rem .55rem;
  background: var(--sh-card); color: inherit; font: inherit; min-width: 0;
}
.sh textarea { width: 100%; }
.sh input:focus-visible, .sh select:focus-visible, .sh textarea:focus-visible, .sh button:focus-visible {
  outline: 2px solid var(--color-sky-600); outline-offset: 1px;
}
.sh-affix { display: flex; align-items: stretch; }
.sh-affix input { flex: 1; border-radius: .375rem 0 0 .375rem; }
.sh-affix > span { border: 1px solid var(--color-slate-300); border-left: 0; border-radius: 0 .375rem .375rem 0; padding: .4rem .5rem; background: var(--color-slate-50); color: var(--sh-muted); }
.sh-check { display: inline-flex; gap: .4rem; align-items: center; }
.sh-btn { display: inline-flex; align-items: center; gap: .35rem; border: 1px solid var(--color-slate-300); background: var(--sh-card); color: var(--color-slate-800); border-radius: .375rem; padding: .4rem .75rem; font: inherit; font-weight: 500; cursor: pointer; }
.sh-btn:hover { background: var(--color-slate-50); }
.sh-btn:disabled { opacity: .55; cursor: default; }
.sh-btn-primary { background: var(--color-sky-700); border-color: var(--color-sky-700); color: var(--color-white, #fff); }
.sh-btn-primary:hover { background: var(--color-sky-800); }
.sh-btn-danger { color: var(--color-red-700); }
.sh-link { background: none; border: 0; padding: 0; color: var(--color-sky-700); cursor: pointer; font: inherit; text-decoration: underline; text-underline-offset: 2px; }
.sh-seg { display: inline-flex; border: 1px solid var(--color-slate-300); border-radius: .375rem; overflow: hidden; }
.sh-seg button { border: 0; border-right: 1px solid var(--color-slate-300); background: var(--sh-card); padding: .35rem .65rem; font: inherit; cursor: pointer; color: var(--color-slate-700); }
.sh-seg button:last-child { border-right: 0; }
.sh-seg button[aria-pressed=true] { background: var(--color-sky-700); color: var(--color-white, #fff); }
.sh-tabs { display: flex; flex-wrap: wrap; gap: .25rem 1rem; border-bottom: 1px solid var(--sh-line); }
.sh-tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: .4rem 0; font: inherit; cursor: pointer; color: var(--color-slate-700); }
.sh-tabs button[aria-current=true] { border-color: var(--color-sky-700); color: var(--color-slate-900); font-weight: 600; }
.sh-filters { display: flex; flex-wrap: wrap; gap: .75rem 1.25rem; align-items: flex-end; }
.sh-table { width: 100%; border-collapse: collapse; }
.sh-table th { text-align: left; font-weight: 500; color: var(--sh-muted); border-bottom: 1px solid var(--sh-line); padding: .45rem .5rem; white-space: nowrap; }
.sh-table th button { background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; }
.sh-table td { border-bottom: 1px solid var(--sh-line); padding: .45rem .5rem; vertical-align: middle; }
.sh-table tbody tr { cursor: pointer; }
.sh-table tbody tr.is-published { background: color-mix(in oklab, var(--color-emerald-100) 45%, transparent); }
.sh-table tbody tr.is-draft { background: color-mix(in oklab, var(--color-sky-100) 45%, transparent); }
.sh-table tbody tr.is-pending, .sh-table tbody tr.is-scheduled { background: color-mix(in oklab, var(--color-amber-100) 55%, transparent); }
.sh-table tbody tr.is-trashed { background: color-mix(in oklab, var(--color-red-100) 45%, transparent); }
.sh-table tbody tr.is-selected { outline: 2px solid var(--color-sky-600); outline-offset: -2px; }
.sh-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.sh-thumb { width: 44px; height: 44px; object-fit: cover; border-radius: .25rem; background: var(--color-slate-100); display: block; }
.sh-badge { display: inline-block; border-radius: 999px; padding: .05rem .55rem; font-size: .75rem; font-weight: 600; white-space: nowrap; }
.sh-badge-ok { background: var(--color-emerald-100); color: var(--color-emerald-800); }
.sh-badge-out { background: var(--color-red-100); color: var(--color-red-800); }
.sh-badge-warn { background: var(--color-amber-100); color: var(--color-amber-900); }
.sh-badge-info { background: var(--color-sky-100); color: var(--color-sky-800); }
.sh-strike { text-decoration: line-through; color: var(--sh-muted); }
.sh-edit { border: 1px dashed transparent; border-radius: .25rem; padding: .1rem .3rem; background: none; font: inherit; color: inherit; cursor: text; }
.sh-edit:hover { border-color: var(--color-slate-400); }
.sh-inline { display: inline-flex; gap: .25rem; align-items: center; }
.sh-inline input { width: 6.5rem; }
.sh-actions { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; background: var(--sh-card); border: 1px solid var(--sh-line); border-radius: .5rem; padding: .6rem .75rem; box-shadow: 0 -4px 12px rgb(0 0 0 / .06); }
.sh-drawer { position: fixed; inset: 0 0 0 auto; width: min(30rem, 100%); background: var(--sh-card); border-left: 1px solid var(--sh-line); box-shadow: -8px 0 24px rgb(0 0 0 / .12); z-index: 40; overflow-y: auto; padding: 1.25rem; }
.sh-drawer-back { position: fixed; inset: 0; background: rgb(0 0 0 / .25); z-index: 39; }
.sh-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr)); gap: .6rem; }
.sh-gallery figure { margin: 0; border: 1px solid var(--sh-line); border-radius: .375rem; padding: .35rem; background: var(--sh-card); }
.sh-gallery figure.is-main { border-color: var(--color-sky-600); box-shadow: 0 0 0 1px var(--color-sky-600); }
.sh-gallery figure.is-over { border-style: dashed; border-color: var(--color-sky-600); }
.sh-gallery img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: .25rem; display: block; cursor: grab; }
.sh-gallery input { width: 100%; margin-top: .3rem; font-size: .75rem; }
.sh-drop { border: 2px dashed var(--color-slate-300); border-radius: .5rem; padding: 1rem; text-align: center; color: var(--sh-muted); }
.sh-drop.is-over { border-color: var(--color-sky-600); background: var(--color-sky-50); }
.sh-progress { height: 4px; background: var(--color-slate-200); border-radius: 2px; overflow: hidden; }
.sh-progress > i { display: block; height: 100%; background: var(--color-sky-600); }
.sh-steps { display: flex; flex-wrap: wrap; gap: .5rem; list-style: none; padding: 0; margin: 0; counter-reset: step; }
.sh-steps li { counter-increment: step; display: flex; align-items: center; gap: .4rem; color: var(--sh-muted); }
.sh-steps li::before { content: counter(step); display: inline-grid; place-items: center; width: 1.6rem; height: 1.6rem; border-radius: 999px; border: 1px solid var(--color-slate-300); font-size: .75rem; }
.sh-steps li[aria-current=step] { color: var(--color-slate-900); font-weight: 600; }
.sh-steps li[aria-current=step]::before { background: var(--color-sky-700); border-color: var(--color-sky-700); color: var(--color-white, #fff); }
.sh-steps li.is-done::before { background: var(--color-emerald-100); border-color: var(--color-emerald-600); }
.sh-chips { display: flex; flex-wrap: wrap; gap: .35rem; }
.sh-chip { display: inline-flex; align-items: center; gap: .3rem; border: 1px solid var(--color-slate-300); border-radius: 999px; padding: .1rem .5rem; background: var(--color-slate-50); }
.sh-chip button { background: none; border: 0; padding: 0; cursor: pointer; color: var(--sh-muted); font: inherit; }
.sh-swatch { display: inline-block; width: .9rem; height: .9rem; border-radius: 999px; border: 1px solid var(--color-slate-300); vertical-align: -2px; }
.sh-tree li { list-style: none; }
.sh-tree-row { display: flex; align-items: center; gap: .5rem; padding: .4rem .5rem; border: 1px solid transparent; border-bottom-color: var(--sh-line); background: var(--sh-card); }
.sh-tree-row[draggable=true] { cursor: grab; }
.sh-tree-row.drop-inside { border-color: var(--color-sky-600); background: var(--color-sky-50); }
.sh-tree-row.drop-before { box-shadow: inset 0 3px 0 var(--color-sky-600); }
.sh-tree-row.drop-after { box-shadow: inset 0 -3px 0 var(--color-sky-600); }
.sh-tree-row img { width: 28px; height: 28px; object-fit: cover; border-radius: .25rem; }
.sh-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.sh-order { display: grid; gap: 1rem; align-items: start; }
@media (min-width: 1000px) { .sh-order { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); } }
@media (max-width: 720px) { .sh-hide-sm { display: none; } }
.sh-chart { margin: 0; }
.sh-chart-title { font-weight: 600; }
.sh-chart-box { position: relative; margin-top: .5rem; }
.sh-chart svg { display: block; width: 100%; height: auto; overflow: visible; touch-action: pan-y; }
.sh-legend { display: inline-flex; align-items: center; gap: .35rem; }
.sh-legend-now, .sh-legend-before { display: inline-block; width: 14px; height: 0; border-top: 2px solid var(--color-sky-600); vertical-align: middle; }
.sh-legend-before { border-top: 2px dashed var(--color-slate-500); }
.sh-tooltip { position: absolute; top: .25rem; pointer-events: none; background: var(--sh-card); border: 1px solid var(--sh-line); border-radius: .375rem; padding: .4rem .6rem; box-shadow: 0 4px 12px rgb(0 0 0 / .12); white-space: nowrap; font-size: .8125rem; z-index: 3; }
.sh-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr)); border: 1px solid var(--sh-line); border-radius: .5rem; overflow: hidden; background: var(--sh-line); gap: 1px; }
.sh-tile { background: var(--sh-card); padding: .75rem 1rem; text-align: left; border: 0; font: inherit; color: inherit; display: flex; flex-direction: column; gap: .2rem; }
button.sh-tile { cursor: pointer; }
button.sh-tile:hover { background: var(--color-slate-50); }
.sh-tile[aria-pressed=true] { box-shadow: inset 0 3px 0 var(--color-sky-600); }
.sh-tile-label { color: var(--sh-muted); }
.sh-tile-value { font-size: 1.25rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.sh-delta { font-size: .75rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.sh-delta-up { color: var(--color-emerald-700); }
.sh-delta-down { color: var(--color-red-700); }
.sh-checklist { list-style: none; padding: 0; margin: 0; }
.sh-checklist li { display: flex; align-items: center; gap: .6rem; padding: .5rem 0; border-bottom: 1px solid var(--sh-line); }
.sh-checklist li:last-child { border-bottom: 0; }
.sh-check-mark { display: inline-grid; place-items: center; width: 1.4rem; height: 1.4rem; border-radius: 999px; border: 1px solid var(--color-slate-300); font-size: .75rem; flex: none; }
.sh-checklist li.is-done .sh-check-mark { background: var(--color-emerald-100); border-color: var(--color-emerald-600); color: var(--color-emerald-800); }
.sh-checklist li.is-done .sh-check-text { color: var(--sh-muted); text-decoration: line-through; }
.sh-home { display: grid; gap: 1rem; align-items: start; }
@media (min-width: 1000px) { .sh-home { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); } }
.sh-list { list-style: none; padding: 0; margin: 0; }
.sh-list li { display: flex; justify-content: space-between; gap: .5rem; padding: .4rem 0; border-bottom: 1px solid var(--sh-line); }
.sh-list li:last-child { border-bottom: 0; }
`;
