import {
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Submission } from './schema';

function SubmissionsPage({ api, user }: AdminPageProps) {
  const it = user.locale.startsWith('it');
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['forms', 'submissions'],
    queryFn: () => api<Submission[]>('GET', '/submissions'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/submissions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['forms', 'submissions'] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{it ? 'Messaggi' : 'Messages'}</h1>
      {list.error && <Alert>{errorMessage(list.error)}</Alert>}
      {remove.error && <Alert>{errorMessage(remove.error)}</Alert>}
      {list.data?.length === 0 && (
        <p className="text-sm text-slate-600">
          {it ? 'Nessun messaggio ricevuto.' : 'No messages yet.'}
        </p>
      )}
      <ul className="space-y-3" aria-label={it ? 'Messaggi' : 'Messages'}>
        {list.data?.map((s) => (
          <li key={s.id}>
            <Card title={`${s.name} · ${s.formName}`}>
              <p className="text-xs text-slate-500">
                {new Date(s.createdAt).toLocaleString(user.locale)} ·{' '}
                <a className="text-sky-700" href={`mailto:${s.email}`}>
                  {s.email}
                </a>
                {s.phone && ` · ${s.phone}`} · {s.pagePath}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{s.message}</p>
              <div className="mt-3">
                <Button
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(it ? 'Eliminare il messaggio?' : 'Delete this message?')) {
                      remove.mutate(s.id);
                    }
                  }}
                >
                  {it ? 'Elimina' : 'Delete'}
                </Button>
              </div>
            </Card>
          </li>
        ))}
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
    },
  ],
});
