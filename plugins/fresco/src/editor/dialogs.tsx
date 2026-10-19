/**
 * The editor's own dialogs and notices, instead of the browser's: a box to
 * type a name or an address, a confirmation, and short notices in the
 * bottom-left corner that go away by themselves.
 */
import { useT } from '@cleitext/admin-sdk';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

type Request =
  | {
      kind: 'text';
      title: string;
      label?: string;
      value: string;
      resolve: (value: string | null) => void;
    }
  | {
      kind: 'confirm';
      title: string;
      text?: string;
      action: string;
      danger: boolean;
      resolve: (ok: boolean) => void;
    };

interface Notice {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

let request: Request | null = null;
let notices: Notice[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** An open request is answered "no" when another takes its place. */
function dismiss() {
  if (request?.kind === 'text') request.resolve(null);
  else if (request) request.resolve(false);
}

/** Asks for a text (a name, an address); null when cancelled. */
export function askText(options: {
  title: string;
  label?: string;
  value?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    dismiss();
    request = { kind: 'text', value: '', ...options, resolve };
    emit();
  });
}

/** Asks to confirm an action. */
export function confirmAction(options: {
  title: string;
  text?: string;
  action: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    dismiss();
    request = { kind: 'confirm', danger: false, ...options, resolve };
    emit();
  });
}

/** A short notice in the corner; errors stay a little longer. */
export function notify(text: string, kind: Notice['kind'] = 'info'): void {
  const notice = { id: nextId++, text, kind };
  // At most three at a time, as in other builders.
  notices = [...notices, notice].slice(-3);
  emit();
  setTimeout(
    () => {
      notices = notices.filter((n) => n.id !== notice.id);
      emit();
    },
    kind === 'error' ? 8000 : 5000,
  );
}

function close() {
  request = null;
  emit();
}

/** Mounted once in the editor. */
export function Dialogs() {
  const { t } = useT();
  const current = useSyncExternalStore(subscribe, () => request);
  const list = useSyncExternalStore(subscribe, () => notices);
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (current?.kind === 'text') {
      setValue(current.value);
      setTimeout(() => input.current?.select(), 0);
    }
  }, [current]);

  const cancel = () => {
    if (!current) return;
    if (current.kind === 'text') current.resolve(null);
    else current.resolve(false);
    close();
  };
  const accept = () => {
    if (!current) return;
    if (current.kind === 'text') {
      if (!value.trim()) return;
      current.resolve(value.trim());
    } else current.resolve(true);
    close();
  };

  return (
    <>
      {current && (
        <div className="fre-modalbg fre-modalbg--center" onPointerDown={cancel}>
          <form
            className="fre-dialog"
            role="dialog"
            aria-label={current.title}
            onPointerDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              accept();
            }}
            onKeyDown={(e) => e.key === 'Escape' && cancel()}
          >
            <h2>{current.title}</h2>
            {current.kind === 'text' ? (
              <label>
                {current.label && <span>{current.label}</span>}
                <input ref={input} value={value} onChange={(e) => setValue(e.target.value)} />
              </label>
            ) : (
              current.text && <p>{current.text}</p>
            )}
            <div className="fre-dialog__actions">
              <button type="button" className="fre-button" onClick={cancel}>
                {t('Cancel')}
              </button>
              <button
                type="submit"
                autoFocus={current.kind === 'confirm'}
                className={`fre-button fre-button--primary${current.kind === 'confirm' && current.danger ? ' fre-button--danger' : ''}`}
              >
                {current.kind === 'confirm' ? current.action : t('OK')}
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="fre-toasts" role="status" aria-live="polite">
        {list.map((n) => (
          <p key={n.id} className={`fre-toast fre-toast--${n.kind}`}>
            {n.text}
          </p>
        ))}
      </div>
    </>
  );
}
