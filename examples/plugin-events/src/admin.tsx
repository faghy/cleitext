import {
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RsvpRow } from './schema';

function RsvpsPage({ api, user }: AdminPageProps) {
  const it = user.locale.startsWith('it');
  const queryClient = useQueryClient();
  const rsvps = useQuery({
    queryKey: ['events', 'rsvps'],
    queryFn: () => api<RsvpRow[]>('GET', '/rsvps'),
  });
  const remove = useMutation({
    mutationFn: (row: RsvpRow) =>
      api<void>('DELETE', `/rsvps/${row.eventId}/${encodeURIComponent(row.email)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events', 'rsvps'] }),
  });

  const byEvent = new Map<string, RsvpRow[]>();
  for (const row of rsvps.data ?? []) {
    byEvent.set(row.eventTitle, [...(byEvent.get(row.eventTitle) ?? []), row]);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{it ? 'Prenotazioni' : 'RSVPs'}</h1>
      {rsvps.error && <Alert>{errorMessage(rsvps.error)}</Alert>}
      {remove.error && <Alert>{errorMessage(remove.error)}</Alert>}
      {rsvps.data?.length === 0 && (
        <p className="text-sm text-slate-600">{it ? 'Nessuna prenotazione.' : 'No RSVPs yet.'}</p>
      )}
      {[...byEvent].map(([title, rows]) => (
        <Card key={title} title={`${title} (${rows.length})`}>
          <ul className="divide-y divide-slate-100 text-sm">
            {rows.map((row) => (
              <li key={row.email} className="flex items-center justify-between gap-4 py-2">
                <span>
                  {row.name} ·{' '}
                  <a className="text-sky-700" href={`mailto:${row.email}`}>
                    {row.email}
                  </a>
                </span>
                <Button
                  variant="danger"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(row)}
                >
                  {it ? 'Elimina' : 'Remove'}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: 'rsvps',
      title: { en: 'RSVPs', it: 'Prenotazioni' },
      capability: 'manage_events',
      component: RsvpsPage,
    },
  ],
});
