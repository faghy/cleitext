import { useEffect, useState } from 'react';

/** Admin sections, in the familiar WordPress order. Placeholders for now (M0). */
const SECTIONS = [
  'Dashboard',
  'Posts',
  'Media',
  'Pages',
  'Appearance',
  'Plugins',
  'Users',
  'Settings',
] as const;

type ServerStatus = 'checking' | 'ok' | 'error' | 'offline';

function useServerStatus(): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>('checking');
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch('/health/ready');
        if (!cancelled) setStatus(res.ok ? 'ok' : 'error');
      } catch {
        if (!cancelled) setStatus('offline');
      }
    };
    void check();
    const timer = setInterval(check, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return status;
}

const STATUS_LABEL: Record<ServerStatus, string> = {
  checking: 'Checking server…',
  ok: 'Server ready',
  error: 'Server not ready',
  offline: 'Server offline',
};

const STATUS_COLOR: Record<ServerStatus, string> = {
  checking: 'bg-slate-400',
  ok: 'bg-emerald-500',
  error: 'bg-amber-500',
  offline: 'bg-red-500',
};

export function App() {
  const status = useServerStatus();
  const [active, setActive] = useState<(typeof SECTIONS)[number]>('Dashboard');

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="w-56 shrink-0 bg-slate-900 text-slate-200">
        <div className="px-4 py-4 text-lg font-semibold text-white">Cleitext</div>
        <nav aria-label="Main">
          <ul>
            {SECTIONS.map((section) => (
              <li key={section}>
                <button
                  type="button"
                  onClick={() => setActive(section)}
                  aria-current={section === active ? 'page' : undefined}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-800 ${
                    section === active ? 'bg-sky-700 text-white' : ''
                  }`}
                >
                  {section}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-2 border-b border-slate-200 bg-white px-6 py-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[status]}`} aria-hidden="true" />
          <span role="status">{STATUS_LABEL[status]}</span>
        </header>
        <main className="p-6">
          <h1 className="text-2xl font-semibold">{active}</h1>
          <p className="mt-2 text-slate-600">
            This section is not implemented yet. See the roadmap in docs/SPECIFICATIONS.md.
          </p>
        </main>
      </div>
    </div>
  );
}
