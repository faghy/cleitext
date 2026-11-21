import type { AssistantsStatus } from '@cleitext/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { AssistantChat } from '../pages/assistant-chat';
import { Alert, useT } from './ui';

const ASSISTANTS_PATH: string = '/assistants';
const OPEN_KEY = 'cleitext-chriss-open';
const SIZE_KEY = 'cleitext-chriss-size';
const DEFAULT_SIZE = { width: 400, height: 600 };

/** Storage that may be missing or refuse (private windows): never breaks the admin. */
function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Kept for this page only.
  }
}

/** The panel's size on wide screens, within the window. */
function clampSize(size: { width: number; height: number }) {
  const maxWidth = Math.max(320, window.innerWidth - 48);
  const maxHeight = Math.max(360, window.innerHeight - 120);
  return {
    width: Math.round(Math.min(Math.max(size.width, 320), maxWidth)),
    height: Math.round(Math.min(Math.max(size.height, 360), maxHeight)),
  };
}

/** A speech bubble with a spark: Chriss, without any other brand's mark. */
function ChrissIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z"
        fill="currentColor"
        opacity="0.95"
      />
      <path d="M12 6.2l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z" className="fill-sky-700" />
    </svg>
  );
}

/**
 * Chriss on every screen of the admin (core 0.117): a round button at the
 * bottom right opens the chat in a panel (a full-height sheet on phones),
 * which stays open while moving around the admin. Not on the Chriss page,
 * where the chat already is; the full-screen editors are outside this layout
 * and the customizer covers it.
 */
export function ChrissBubble({ pathname }: { pathname: string }) {
  const { t } = useT();
  const me = useMe();
  const titleId = useId();
  const [open, setOpen] = useState(() => read(() => sessionStorage, OPEN_KEY) === '1');
  const [size, setSize] = useState(() => {
    try {
      const saved = JSON.parse(read(() => localStorage, SIZE_KEY) ?? '') as {
        width?: unknown;
        height?: unknown;
      };
      if (typeof saved.width === 'number' && typeof saved.height === 'number')
        return { width: saved.width, height: saved.height };
    } catch {
      // The default size.
    }
    return DEFAULT_SIZE;
  });
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const hidden = pathname === ASSISTANTS_PATH || !me.capabilities.includes('edit_entries');
  const status = useQuery({
    queryKey: ['assistants'],
    queryFn: () => api<AssistantsStatus>('GET', '/assistants'),
    enabled: open && !hidden,
  });

  const close = useCallback(() => {
    setOpen(false);
    write(() => sessionStorage, OPEN_KEY, null);
    // Back to the button that opened it.
    requestAnimationFrame(() => button.current?.focus());
  }, []);

  useEffect(() => {
    if (!open || hidden) return;
    // Into the panel: the request box when there, else the panel itself.
    const frame = requestAnimationFrame(() => {
      const target = panel.current?.querySelector<HTMLElement>('textarea') ?? panel.current ?? null;
      // The panel itself had the focus while the chat loaded: on to the box now.
      const active = document.activeElement;
      if (target && (!panel.current?.contains(active) || active === panel.current)) target.focus();
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panel.current?.contains(document.activeElement)) {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, hidden, close, status.data?.chat]);

  // The window got smaller: the panel stays inside it.
  useEffect(() => {
    if (!open) return;
    const fit = () => setSize((s) => clampSize(s));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [open]);

  /** Resizing from the top-left corner, as the panel is anchored bottom right. */
  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, ...size };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let last = size;
    const move = (e: globalThis.PointerEvent) => {
      last = clampSize({
        width: start.width + (start.x - e.clientX),
        height: start.height + (start.y - e.clientY),
      });
      setSize(last);
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      write(() => localStorage, SIZE_KEY, JSON.stringify(last));
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };

  if (hidden) return null;

  return (
    <>
      {open && (
        <div
          ref={panel}
          id="chriss-panel"
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          // Phones: a full-height sheet over the admin. Wider screens: a panel at the bottom right.
          className="fixed z-[45] flex flex-col bg-white text-slate-900 shadow-2xl outline-none max-md:inset-0 max-md:pt-[env(safe-area-inset-top)] max-md:pr-[env(safe-area-inset-right)] max-md:pb-[env(safe-area-inset-bottom)] max-md:pl-[env(safe-area-inset-left)] md:right-6 md:bottom-24 md:rounded-xl md:border md:border-slate-200"
          style={
            window.matchMedia?.('(min-width: 48rem)').matches
              ? { width: size.width, height: size.height }
              : undefined
          }
        >
          <div
            className="absolute top-0 left-0 z-10 hidden size-4 cursor-nwse-resize md:block"
            onPointerDown={startResize}
            aria-hidden="true"
            title={t('Drag to resize')}
          />
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-sky-700 text-white">
              <ChrissIcon size={18} />
            </span>
            <h2 id={titleId} className="flex-1 font-semibold">
              Chriss
            </h2>
            <Link
              to={ASSISTANTS_PATH}
              className="rounded px-2 py-1 text-xs text-sky-700 hover:bg-slate-100 hover:underline"
              onClick={() => {
                setOpen(false);
                write(() => sessionStorage, OPEN_KEY, null);
              }}
            >
              {t('Open the Chriss page')}
            </Link>
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
              aria-label={t('Close the chat')}
              onClick={close}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {status.error ? (
              <Alert>{errorMessage(status.error)}</Alert>
            ) : !status.data ? (
              <p className="text-sm text-slate-500">…</p>
            ) : status.data.chat ? (
              <AssistantChat
                suggestion={null}
                compact
                onNavigate={() => {
                  if (!window.matchMedia?.('(min-width: 48rem)').matches) close();
                }}
              />
            ) : (
              <div className="space-y-3 text-sm text-slate-600">
                <p>
                  {me.capabilities.includes('manage_plugins')
                    ? t('Chriss is not set up yet: choose a free or your own AI service.')
                    : t('To chat with Chriss, a super admin has to set up an AI provider.')}
                </p>
                {me.capabilities.includes('manage_plugins') && (
                  <Link
                    to={ASSISTANTS_PATH}
                    className="inline-block rounded bg-sky-700 px-3 py-2 font-medium text-white hover:bg-sky-800"
                    onClick={() => setOpen(false)}
                  >
                    {t('Set up Chriss')}
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <button
        ref={button}
        type="button"
        aria-label={open ? t('Close the chat') : t('Ask Chriss')}
        aria-expanded={open}
        aria-controls="chriss-panel"
        title={open ? t('Close the chat') : t('Ask Chriss')}
        onClick={() => {
          if (open) close();
          else {
            setOpen(true);
            write(() => sessionStorage, OPEN_KEY, '1');
          }
        }}
        // Above the safe area of phones; hidden on phones while the sheet covers the screen.
        className={`fixed right-[max(1.5rem,env(safe-area-inset-right))] bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[35] flex size-14 items-center justify-center rounded-full bg-sky-700 text-white shadow-lg shadow-slate-900/25 transition hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${open ? 'max-md:hidden' : ''}`}
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
          </svg>
        ) : (
          <ChrissIcon />
        )}
      </button>
    </>
  );
}
