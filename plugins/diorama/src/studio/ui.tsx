/**
 * The small parts the admin screens are made of, with their own CSS (the
 * admin compiles only its own Tailwind classes): fields, toggles, segmented
 * choices, tabs, dialogs and toasts. Everything is scoped under `.dst`.
 */
import { useT } from '@cleitext/admin-sdk';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { color } from '../model/normalize';

export const STUDIO_CSS = `
.dst{--dst-accent:#4f46e5;--dst-accent-soft:#eef2ff;--dst-line:#e2e8f0;--dst-muted:#64748b;--dst-ink:#0f172a;--dst-bg:#f8fafc;color:var(--dst-ink);font-size:14px;line-height:1.45}
.dst *{box-sizing:border-box}
.dst h1,.dst h2,.dst h3{margin:0;font-weight:650;color:var(--dst-ink)}
.dst-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:34px;padding:6px 12px;border:1px solid var(--dst-line);border-radius:8px;background:#fff;color:var(--dst-ink);font:inherit;font-weight:550;cursor:pointer;white-space:nowrap;text-decoration:none}
.dst-btn:hover{border-color:#cbd5e1;background:#f8fafc}
.dst-btn:focus-visible,.dst-icon-btn:focus-visible,.dst-seg button:focus-visible,.dst-tabs button:focus-visible,.dst-card:focus-visible{outline:2px solid var(--dst-accent);outline-offset:2px}
.dst-btn[disabled]{opacity:.5;cursor:default}
.dst-btn--primary{background:var(--dst-accent);border-color:var(--dst-accent);color:#fff}
.dst-btn--primary:hover{background:#4338ca;border-color:#4338ca}
.dst-btn--danger{color:#b91c1c}
.dst-btn--ghost{border-color:transparent;background:transparent}
.dst-btn--small{min-height:28px;padding:3px 8px;font-size:13px}
.dst-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:#334155;cursor:pointer}
.dst-icon-btn:hover{background:#f1f5f9}
.dst-icon-btn[aria-pressed="true"]{background:var(--dst-accent-soft);color:var(--dst-accent);border-color:#c7d2fe}
.dst-icon-btn[disabled]{opacity:.35;cursor:default}
.dst-icon-btn svg,.dst-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.dst-field{display:grid;gap:4px;margin:0 0 12px}
.dst-field>span:first-child,.dst-label{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:#334155}
.dst-help{font-size:12px;color:var(--dst-muted)}
.dst-input,.dst-select,.dst-textarea{width:100%;min-height:34px;padding:6px 9px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:var(--dst-ink);font:inherit}
.dst-textarea{min-height:70px;resize:vertical}
.dst-textarea--line{min-height:34px}
.dst-input:focus,.dst-select:focus,.dst-textarea:focus{outline:2px solid #a5b4fc;outline-offset:0;border-color:var(--dst-accent)}
.dst-row{display:flex;gap:8px;align-items:center}
.dst-row>*{min-width:0}
.dst-grow{flex:1}
.dst-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.dst-num{display:flex;align-items:center;gap:8px}
.dst-num input[type=range]{flex:1;accent-color:var(--dst-accent)}
.dst-num .dst-input{width:76px;flex:none}
.dst-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 10px;font-size:13px;cursor:pointer}
.dst-toggle input{position:absolute;opacity:0;width:1px;height:1px}
.dst-switch{position:relative;width:34px;height:20px;border-radius:999px;background:#cbd5e1;flex:none;transition:background .15s}
.dst-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s}
.dst-toggle input:checked+.dst-switch{background:var(--dst-accent)}
.dst-toggle input:checked+.dst-switch::after{transform:translateX(14px)}
.dst-toggle input:focus-visible+.dst-switch{outline:2px solid var(--dst-accent);outline-offset:2px}
.dst-seg{display:flex;flex-wrap:wrap;gap:2px;padding:2px;border-radius:8px;background:#f1f5f9}
.dst-seg button{flex:1;min-height:28px;padding:3px 8px;border:0;border-radius:6px;background:transparent;color:#334155;font:inherit;font-size:12.5px;font-weight:550;cursor:pointer;white-space:nowrap}
.dst-seg button[aria-pressed="true"]{background:#fff;color:var(--dst-ink);box-shadow:0 1px 2px rgba(15,23,42,.12)}
.dst-tabs{display:flex;border-bottom:1px solid var(--dst-line);margin:0 0 12px}
.dst-tabs button{flex:1;padding:10px 6px;border:0;border-bottom:2px solid transparent;background:none;color:var(--dst-muted);font:inherit;font-weight:600;cursor:pointer}
.dst-tabs button[aria-selected="true"]{color:var(--dst-accent);border-bottom-color:var(--dst-accent)}
.dst-section{border-top:1px solid var(--dst-line);padding:12px 0 2px}
.dst-section:first-child{border-top:0;padding-top:0}
.dst-section>h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dst-muted);margin:0 0 10px}
.dst-dot{width:7px;height:7px;border-radius:50%;background:var(--dst-accent);display:inline-block}
.dst-reset{border:0;background:none;color:var(--dst-accent);font:inherit;font-size:11.5px;cursor:pointer;padding:0;text-decoration:underline}
.dst-color{display:flex;align-items:center;gap:6px}
.dst-color input[type=color]{width:34px;height:34px;padding:2px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;cursor:pointer;flex:none}
.dst-color .dst-input{flex:1;font-family:ui-monospace,monospace;font-size:12.5px}
.dst-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.55)}
.dst-dialog{display:flex;flex-direction:column;width:min(960px,100%);max-height:calc(100vh - 48px);border-radius:14px;background:#fff;box-shadow:0 24px 60px rgba(15,23,42,.35);overflow:hidden}
.dst-dialog--small{width:min(520px,100%)}
.dst-dialog--wide{width:min(1200px,100%)}
.dst-dialog>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--dst-line)}
.dst-dialog>header h2{font-size:18px}
.dst-dialog-body{padding:20px;overflow:auto}
.dst-dialog-body p{margin:0 0 10px}
.dst-dialog>footer{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid var(--dst-line);background:#f8fafc}
.dst-toast{position:fixed;left:50%;bottom:24px;z-index:1100;translate:-50% 0;padding:10px 16px;border-radius:10px;background:#0f172a;color:#fff;font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.25)}
.dst-toast--error{background:#b91c1c}
.dst-card{display:block;width:100%;padding:0;border:1px solid var(--dst-line);border-radius:12px;background:#fff;text-align:left;font:inherit;color:inherit;cursor:pointer;overflow:hidden;transition:box-shadow .15s,border-color .15s}
.dst-card:hover{border-color:#a5b4fc;box-shadow:0 8px 24px rgba(79,70,229,.12)}
.dst-empty{padding:40px 20px;border:2px dashed #cbd5e1;border-radius:14px;text-align:center;color:var(--dst-muted)}
.dst-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:#f1f5f9;color:#334155;font-size:12px;font-weight:600}
.dst-font{position:relative}
.dst-font__button{display:flex;align-items:center;text-align:left;cursor:pointer}
.dst-font__button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dst-font__panel{margin-top:4px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;overflow:hidden}
.dst-font__panel .dst-input{border:0;border-bottom:1px solid var(--dst-line);border-radius:0}
.dst-font__list{max-height:240px;margin:0;padding:4px 0;overflow-y:auto;list-style:none}
.dst-font__list [role=option]{padding:4px 10px;font-size:13px;cursor:pointer}
.dst-font__list [role=option][aria-selected=true]{color:var(--dst-accent);font-weight:600}
.dst-font__list [role=option].is-active{background:var(--dst-accent);color:#fff}
.dst-font__group{padding:8px 10px 2px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dst-muted)}
.dst-kbd{font-family:ui-monospace,monospace;font-size:11.5px;padding:1px 5px;border:1px solid var(--dst-line);border-radius:4px;background:#f8fafc}
`;

/** Adds the studio's CSS once. */
export function useStudioCss(): void {
  useEffect(() => {
    if (document.getElementById('dst-css')) return;
    const style = document.createElement('style');
    style.id = 'dst-css';
    style.textContent = STUDIO_CSS;
    document.head.appendChild(style);
  }, []);
}

export const ICON = {
  back: 'M15 5l-7 7 7 7',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  desktop: 'M3 5h18v11H3z M8 20h8 M12 16v4',
  tablet: 'M6 3h12v18H6z M11 18h2',
  mobile: 'M8 3h8v18H8z M11 18h2',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  eyeOff:
    'M3 3l18 18 M10.6 6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.6 3.3 M6.3 6.6C3.8 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.4 4.5-1.1',
  copy: 'M8 8h12v12H8z M16 8V4H4v12h4',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M6 13l6 6 6-6',
  plus: 'M12 5v14 M5 12h14',
  play: 'M7 5v14l11-7z',
  close: 'M6 6l12 12 M18 6L6 18',
  image: 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6 M15.5 9a1.5 1.5 0 1 1 0-.01',
  heading: 'M6 4v16 M18 4v16 M6 12h12',
  text: 'M4 6h16 M4 11h16 M4 16h10',
  button: 'M3 8h18v8H3z M8 12h8',
  icon: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z',
  shape: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z',
  box: 'M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h5',
  eyePreview: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z',
  sliders: 'M3 6h18v12H3z M8 21h8 M9 12l3-3 3 3',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 20h16',
  check: 'M4 12.5l5 5L20 6.5',
  grip: 'M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01',
} as const;

export function Svg({ path, size }: { path: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={size ? { width: size, height: size } : undefined}
    >
      <path d={path} />
    </svg>
  );
}

export function IconButton({
  icon,
  label,
  pressed,
  ...rest
}: { icon: string; label: string; pressed?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="dst-icon-btn"
      aria-label={label}
      title={label}
      {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
      {...rest}
    >
      <Svg path={icon} />
    </button>
  );
}

export function Btn({
  kind,
  small,
  icon,
  children,
  className,
  ...rest
}: {
  kind?: 'primary' | 'danger' | 'ghost';
  small?: boolean;
  icon?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={[
        'dst-btn',
        kind ? `dst-btn--${kind}` : '',
        small ? 'dst-btn--small' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {icon && <Svg path={icon} />}
      {children}
    </button>
  );
}

export function Field({
  label,
  help,
  marker,
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  /** Shown beside the label: e.g. "changed on this device". */
  marker?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="dst-field">
      <span>
        {label}
        {marker}
      </span>
      {children}
      {help && <span className="dst-help">{help}</span>}
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="dst-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="dst-switch" aria-hidden="true" />
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="dst-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumberInput({
  value,
  min,
  max,
  step = 1,
  onChange,
  unit,
  range = true,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  unit?: string;
  range?: boolean;
  label?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw: string) => {
    const n = Number(raw.replace(',', '.'));
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    else setDraft(String(value));
  };
  return (
    <div className="dst-num">
      {range && (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      )}
      <input
        className="dst-input"
        inputMode="decimal"
        value={draft}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
      />
      {unit && <span className="dst-help">{unit}</span>}
    </div>
  );
}

/** A colour with optional transparency (`#rrggbbaa`), with a picker for its colour part. */
export function ColorInput({
  value,
  onChange,
  label,
  allowTransparent = true,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  allowTransparent?: boolean;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const hex6 = /^#[0-9a-f]{6}/i.test(value)
    ? value.slice(0, 7)
    : /^#[0-9a-f]{3}$/i.test(value)
      ? `#${[...value.slice(1)].map((c) => c + c).join('')}`
      : '#000000';
  const alpha = /^#[0-9a-f]{8}$/i.test(value) ? value.slice(7) : '';
  const opacity =
    value === 'transparent' ? 0 : alpha ? Math.round((parseInt(alpha, 16) / 255) * 100) : 100;
  const withOpacity = (hex: string, pct: number) =>
    pct >= 100
      ? hex
      : `${hex}${Math.round((pct / 100) * 255)
          .toString(16)
          .padStart(2, '0')}`;
  return (
    <div>
      <div className="dst-color">
        <input
          type="color"
          value={hex6}
          aria-label={label}
          onChange={(e) =>
            onChange(withOpacity(e.target.value, value === 'transparent' ? 100 : opacity))
          }
        />
        <input
          className="dst-input"
          value={draft}
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            // Also `rgb()`/`rgba()`, written as `#rrggbb(aa)` (Diorama 1.3).
            const v = color(draft, '');
            if (v) onChange(v);
            else setDraft(value);
          }}
        />
      </div>
      {allowTransparent && (
        <div className="dst-num" style={{ marginTop: 6 }}>
          <span className="dst-help">{t('Opacity')}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={opacity}
            aria-label={`${label}: ${t('Opacity')}`}
            onChange={(e) => onChange(withOpacity(hex6, Number(e.target.value)))}
          />
          <span className="dst-help" style={{ width: 36, textAlign: 'right' }}>
            {opacity}%
          </span>
        </div>
      )}
    </div>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
  size,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'small' | 'wide';
}) {
  const { t } = useT();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const box = ref.current;
    const first =
      box?.querySelector<HTMLElement>('[data-autofocus]') ??
      box?.querySelector<HTMLElement>('button, input, select, textarea, a[href]');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Tab' && box) {
        const items = [
          ...box.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex="0"]',
          ),
        ];
        if (items.length === 0) return;
        const firstItem = items[0]!;
        const lastItem = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === firstItem) {
          e.preventDefault();
          lastItem.focus();
        } else if (!e.shiftKey && document.activeElement === lastItem) {
          e.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="dst dst-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`dst-dialog${size ? ` dst-dialog--${size}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <header>
          <h2 id={id}>{title}</h2>
          <IconButton icon={ICON.close} label={t('Close')} onClick={onClose} />
        </header>
        <div className="dst-dialog-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

/** A short message at the bottom of the screen. */
export function useToast(): [ReactNode, (text: string, kind?: 'info' | 'error') => void] {
  const [toast, setToast] = useState<{ text: string; kind: 'info' | 'error' } | null>(null);
  const timer = useRef(0);
  const show = (text: string, kind: 'info' | 'error' = 'info') => {
    window.clearTimeout(timer.current);
    setToast({ text, kind });
    timer.current = window.setTimeout(() => setToast(null), kind === 'error' ? 6000 : 2600);
  };
  const node = toast ? (
    <div
      className={`dst dst-toast${toast.kind === 'error' ? ' dst-toast--error' : ''}`}
      role={toast.kind === 'error' ? 'alert' : 'status'}
    >
      {toast.text}
    </div>
  ) : null;
  return [node, show];
}
