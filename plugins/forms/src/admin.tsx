import {
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Submission } from './schema';

function SubmissionsPage({ api, user }: AdminPageProps) {
  const it = user.locale.startsWith('it');
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  // Compact (1.8.0): one line per message, opened on demand; remembered in this browser.
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem('forms.compact') === '1';
    } catch {
      return false;
    }
  });
  const list = useQuery({
    queryKey: ['forms', 'submissions'],
    queryFn: () => api<Submission[]>('GET', '/submissions'),
  });
  const done = () => queryClient.invalidateQueries({ queryKey: ['forms', 'submissions'] });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/submissions/${id}`),
    onSuccess: done,
  });
  const removeMany = useMutation({
    mutationFn: (ids: string[]) => api<{ deleted: number }>('POST', '/submissions/delete', { ids }),
    onSuccess: () => {
      setChosen(new Set());
      return done();
    },
  });
  const rows = list.data ?? [];
  const allChosen = rows.length > 0 && rows.every((s) => chosen.has(s.id));
  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setView = (value: boolean) => {
    setCompact(value);
    try {
      localStorage.setItem('forms.compact', value ? '1' : '0');
    } catch {
      // Not kept: the default next time.
    }
  };
  const deleteChosen = () => {
    const ids = rows.filter((s) => chosen.has(s.id)).map((s) => s.id);
    if (!ids.length) return;
    const question = it
      ? `Eliminare ${ids.length === 1 ? 'il messaggio scelto' : `i ${ids.length} messaggi scelti`}? Non si può annullare.`
      : `Delete ${ids.length === 1 ? 'the chosen message' : `the ${ids.length} chosen messages`}? This cannot be undone.`;
    if (window.confirm(question)) removeMany.mutate(ids);
  };

  const details = (s: Submission) => (
    <>
      <p className="text-xs text-slate-500">
        {new Date(s.createdAt).toLocaleString(user.locale)}
        {s.email && (
          <>
            {' · '}
            <a className="text-sky-700" href={`mailto:${s.email}`}>
              {s.email}
            </a>
          </>
        )}
        {s.phone && ` · ${s.phone}`} · {s.pagePath}
      </p>
      {s.fields ? (
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(8rem,auto)_1fr]">
          {s.fields.map((f) => (
            <div key={f.name} className="contents">
              <dt className="font-medium text-slate-700">{f.label}</dt>
              <dd className="whitespace-pre-wrap text-slate-900">{f.value || '—'}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm">{s.message}</p>
      )}
    </>
  );
  const titleOf = (s: Submission) =>
    `${s.name || s.email || (it ? 'Messaggio' : 'Message')} · ${s.formName}`;
  const preview = (s: Submission) =>
    (s.fields ? s.fields.map((f) => f.value).join(' · ') : s.message)
      .replace(/\s+/g, ' ')
      .slice(0, 140);
  const checkbox = (s: Submission) => (
    <input
      type="checkbox"
      className="mt-1 h-4 w-4"
      checked={chosen.has(s.id)}
      onChange={() => toggle(s.id)}
      aria-label={it ? `Scegli: ${titleOf(s)}` : `Choose: ${titleOf(s)}`}
    />
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{it ? 'Messaggi' : 'Messages'}</h1>
      {list.error && <Alert>{errorMessage(list.error)}</Alert>}
      {remove.error && <Alert>{errorMessage(remove.error)}</Alert>}
      {removeMany.error && <Alert>{errorMessage(removeMany.error)}</Alert>}
      {list.data?.length === 0 && (
        <p className="text-sm text-slate-600">
          {it ? 'Nessun messaggio ricevuto.' : 'No messages yet.'}
        </p>
      )}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-slate-200 bg-white p-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={allChosen}
              onChange={() => setChosen(allChosen ? new Set() : new Set(rows.map((s) => s.id)))}
            />
            {it ? 'Scegli tutti' : 'Choose all'}
          </label>
          <span className="text-slate-500">
            {it ? `${chosen.size} scelti` : `${chosen.size} chosen`}
          </span>
          <Button
            variant="danger"
            disabled={chosen.size === 0 || removeMany.isPending}
            onClick={deleteChosen}
          >
            {it ? 'Elimina i messaggi scelti' : 'Delete the chosen messages'}
          </Button>
          <label className="ml-auto flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={compact}
              onChange={(e) => setView(e.target.checked)}
            />
            {it ? 'Vista compatta' : 'Compact view'}
          </label>
        </div>
      )}
      <ul
        className={compact ? 'divide-y rounded border border-slate-200 bg-white' : 'space-y-3'}
        aria-label={it ? 'Messaggi' : 'Messages'}
      >
        {rows.map((s) =>
          compact ? (
            <li key={s.id} className="flex items-start gap-3 p-2">
              {checkbox(s)}
              <details className="min-w-0 flex-1">
                <summary className="cursor-pointer truncate text-sm">
                  <span className="font-medium">{titleOf(s)}</span>
                  <span className="text-slate-500">
                    {' · '}
                    {new Date(s.createdAt).toLocaleDateString(user.locale)} · {preview(s)}
                  </span>
                </summary>
                <div className="mt-2">{details(s)}</div>
              </details>
            </li>
          ) : (
            <li key={s.id} className="flex items-start gap-3">
              {checkbox(s)}
              <div className="min-w-0 flex-1">
                <Card title={titleOf(s)}>
                  {details(s)}
                  <div className="mt-3">
                    <Button
                      variant="danger"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (
                          window.confirm(it ? 'Eliminare il messaggio?' : 'Delete this message?')
                        ) {
                          remove.mutate(s.id);
                        }
                      }}
                    >
                      {it ? 'Elimina' : 'Delete'}
                    </Button>
                  </div>
                </Card>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: 'messages',
      title: { en: 'Messages', it: 'Messaggi' },
      capability: 'manage_forms',
      component: SubmissionsPage,
      // An envelope.
      icon: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M3.5 7.5L12 13l8.5-5.5',
    },
  ],
});
