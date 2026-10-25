/**
 * Small pieces of Agenda's admin: its stylesheet (the admin's Tailwind only
 * has the classes the core uses, so Agenda brings its own, prefixed `agx-`),
 * fields and the counter of the free limit.
 */
import { useT } from '@cleitext/admin-sdk';
import { useEffect, type ReactNode } from 'react';
import { PRO_NAME, SLUG } from '../config';
import type { LimitState } from '../model/limit';

const CSS = `
.agx{--agx-accent:#2563eb;--agx-border:#e2e8f0;--agx-muted:#64748b;--agx-bg:#fff;--agx-soft:#f8fafc;color:#0f172a;font-size:14px}
.dark .agx{--agx-border:#334155;--agx-muted:#94a3b8;--agx-bg:#0f172a;--agx-soft:#1e293b;color:#e2e8f0}
.agx h1{font-size:1.5rem;font-weight:600;margin:0}
.agx h2{font-size:1.15rem;font-weight:600;margin:0 0 .75rem}
.agx h3{font-size:1rem;font-weight:600;margin:0 0 .5rem}
.agx-head{display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;align-items:center;justify-content:space-between;margin-bottom:1rem}
.agx-tabs{display:flex;flex-wrap:wrap;gap:.25rem;border-bottom:1px solid var(--agx-border);margin-bottom:1.25rem}
.agx-tab{border:0;background:none;padding:.6rem .9rem;border-bottom:2px solid transparent;color:var(--agx-muted);font:inherit;cursor:pointer}
.agx-tab[aria-selected=true]{border-color:var(--agx-accent);color:inherit;font-weight:600}
.agx-card{border:1px solid var(--agx-border);border-radius:10px;background:var(--agx-bg);padding:1rem}
.agx-grid{display:grid;gap:1rem}
.agx-row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.agx-cols{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))}
.agx-field{display:grid;gap:.3rem}
.agx-field>span{font-weight:500}
.agx-help{color:var(--agx-muted);font-size:.85em;margin:0}
.agx input[type=text],.agx input[type=email],.agx input[type=number],.agx input[type=date],.agx input[type=time],.agx input[type=datetime-local],.agx input[type=search],.agx select,.agx textarea{font:inherit;color:inherit;background:var(--agx-bg);border:1px solid var(--agx-border);border-radius:8px;padding:.45rem .6rem;min-height:2.4rem;width:100%}
.agx textarea{min-height:6rem}
.agx-check{display:flex;gap:.5rem;align-items:flex-start}
.agx-check input{margin-top:.2rem}
.agx-btn{font:inherit;display:inline-flex;align-items:center;gap:.35rem;border:1px solid var(--agx-border);background:var(--agx-bg);color:inherit;border-radius:8px;padding:.45rem .8rem;min-height:2.4rem;cursor:pointer;text-decoration:none}
.agx-btn:disabled{opacity:.55;cursor:default}
.agx-primary{background:var(--agx-accent);border-color:var(--agx-accent);color:#fff}
.agx-danger{color:#b91c1c}
.agx-link{background:none;border:0;padding:0;color:var(--agx-accent);text-decoration:underline;cursor:pointer;font:inherit}
.agx-alert{border-radius:8px;padding:.6rem .8rem;background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
.agx-ok{border-radius:8px;padding:.6rem .8rem;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
.agx-warn{border-radius:8px;padding:.6rem .8rem;background:#fffbeb;color:#92400e;border:1px solid #fde68a}
.agx-counter{display:inline-flex;align-items:center;gap:.5rem;padding:.35rem .7rem;border-radius:999px;background:var(--agx-soft);border:1px solid var(--agx-border);font-variant-numeric:tabular-nums}
.agx-counter.is-warn{background:#fffbeb;border-color:#fcd34d;color:#92400e}
.agx-counter.is-full{background:#fef2f2;border-color:#fca5a5;color:#991b1b}
.agx-table{width:100%;border-collapse:collapse}
.agx-table th,.agx-table td{text-align:left;padding:.55rem .5rem;border-bottom:1px solid var(--agx-border);vertical-align:top}
.agx-table th{font-weight:600;color:var(--agx-muted);font-size:.85em}
.agx-table tr[data-click]{cursor:pointer}
.agx-table tr[data-click]:hover td{background:var(--agx-soft)}
.agx-pill{display:inline-block;padding:.1rem .55rem;border-radius:999px;font-size:.8em;background:var(--agx-soft);border:1px solid var(--agx-border);white-space:nowrap}
.agx-pill.s-confirmed{background:#ecfdf5;border-color:#a7f3d0;color:#065f46}
.agx-pill.s-pending{background:#fffbeb;border-color:#fde68a;color:#92400e}
.agx-pill.s-cancelled{background:#f1f5f9;color:#64748b;text-decoration:line-through}
.agx-pill.s-no_show{background:#fef2f2;border-color:#fecaca;color:#991b1b}
.agx-cal{display:grid;gap:.5rem}
.agx-cal-week{grid-template-columns:repeat(7,minmax(0,1fr))}
.agx-cal-month{grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}
.agx-day{border:1px solid var(--agx-border);border-radius:8px;padding:.4rem;min-height:6rem;background:var(--agx-bg)}
.agx-cal-month .agx-day{border-radius:4px;min-height:5.5rem}
.agx-day.is-today{border-color:var(--agx-accent)}
.agx-day.is-other{opacity:.45}
.agx-day-head{font-size:.8em;color:var(--agx-muted);margin-bottom:.3rem;text-transform:capitalize}
.agx-event{display:block;width:100%;text-align:left;border:0;border-left:3px solid var(--c,#2563eb);background:var(--agx-soft);border-radius:4px;padding:.25rem .35rem;margin-bottom:.25rem;font:inherit;font-size:.85em;color:inherit;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.agx-event.is-cancelled{opacity:.5;text-decoration:line-through}
.agx-panel{position:fixed;inset:0 0 0 auto;width:min(28rem,100vw);background:var(--agx-bg);border-left:1px solid var(--agx-border);box-shadow:-8px 0 24px rgba(0,0,0,.12);padding:1.25rem;overflow:auto;z-index:50}
.agx-dl{display:grid;grid-template-columns:max-content 1fr;gap:.35rem .9rem;margin:0 0 1rem}
.agx-dl dt{color:var(--agx-muted)}
.agx-dl dd{margin:0;word-break:break-word}
.agx-steps{display:flex;gap:.4rem;margin-bottom:1rem;flex-wrap:wrap}
.agx-steps span{padding:.2rem .6rem;border-radius:999px;background:var(--agx-soft);color:var(--agx-muted);font-size:.85em}
.agx-steps span[aria-current=step]{background:var(--agx-accent);color:#fff}
.agx-wizard{display:grid;gap:1.5rem;grid-template-columns:minmax(0,1fr)}
@media (min-width:64rem){.agx-wizard{grid-template-columns:minmax(0,1fr) minmax(0,26rem)}}
.agx-chips{display:flex;flex-wrap:wrap;gap:.4rem}
.agx-chip{font:inherit;border:1px solid var(--agx-border);background:var(--agx-bg);color:inherit;border-radius:999px;padding:.35rem .8rem;cursor:pointer;min-height:2.2rem}
.agx-chip[aria-pressed=true]{background:var(--agx-accent);border-color:var(--agx-accent);color:#fff}
.agx-preview{border:1px solid var(--agx-border);border-radius:12px;padding:1rem;background:#fff;color:#1f2937}
.agx-preview-label{font-size:.8em;color:var(--agx-muted);margin:0 0 .5rem;text-transform:uppercase;letter-spacing:.04em}
.agx-days td,.agx-days th{padding:.3rem .4rem;vertical-align:middle}
.agx-muted{color:var(--agx-muted)}
`;

let injected = false;
export function useAgendaCss() {
  useEffect(() => {
    if (injected) return;
    injected = true;
    const style = document.createElement('style');
    style.dataset.agenda = '';
    style.textContent = CSS;
    document.head.append(style);
  }, []);
}

/** The public widget's stylesheet, for the wizard's live preview. */
export function usePublicCss(version: string) {
  useEffect(() => {
    const id = 'agenda-public-css';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `/plugin-assets/${SLUG}/${version}/agenda.css`;
    document.head.append(link);
  }, [version]);
}

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="agx-field">
      <span>{label}</span>
      {children}
      {help ? <p className="agx-help">{help}</p> : null}
    </label>
  );
}

export function Check({
  label,
  checked,
  onChange,
  help,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  help?: string;
}) {
  return (
    <label className="agx-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {help ? (
          <span className="agx-help" style={{ display: 'block' }}>
            {help}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function Counter({ limit, upgradeUrl }: { limit: LimitState; upgradeUrl: string }) {
  const { t } = useT();
  if (limit.limit === null)
    return <span className="agx-counter">{t('{n} bookings', { n: limit.used })}</span>;
  const cls = limit.reached ? 'is-full' : limit.warning ? 'is-warn' : '';
  return (
    <span className="agx-row">
      <span
        className={`agx-counter ${cls}`}
        title={t(
          'Every booking made on the site or here counts, cancelled ones too; imported ones do not.',
        )}
      >
        {t('{used} / {limit} bookings', { used: limit.used, limit: limit.limit })}
      </span>
      {limit.warning ? (
        <a className="agx-link" href={upgradeUrl} target="_blank" rel="noopener noreferrer">
          {limit.reached
            ? t('Limit reached: get {pro}', { pro: PRO_NAME })
            : t('Get {pro} for unlimited bookings', { pro: PRO_NAME })}
        </a>
      ) : null}
    </span>
  );
}

export function Pill({ status }: { status: string }) {
  const { t } = useT();
  const labels: Record<string, string> = {
    confirmed: t('Confirmed'),
    pending: t('Pending'),
    cancelled: t('Cancelled'),
    no_show: t('No-show'),
  };
  return <span className={`agx-pill s-${status}`}>{labels[status] ?? status}</span>;
}

export const pad = (n: number) => String(n).padStart(2, '0');
