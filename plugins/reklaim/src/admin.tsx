import { defineAdminPlugin, errorMessage, type AdminPageProps } from '@cleitext/admin-sdk';
import { useQuery } from '@tanstack/react-query';

interface Stats {
  today: number;
  week: number;
  month: number;
  total: number;
  days: { day: string; clicks: number }[];
  bars: { bar: string; clicks: number }[];
}

/** Clicks on the bar: today, 7 and 30 days, a bar per day, and per bar of Pro. */
function Clicks({ api, user }: AdminPageProps) {
  const it = user.locale.startsWith('it');
  const stats = useQuery({
    queryKey: ['reklaim', 'stats'],
    queryFn: () => api<Stats>('GET', '/stats'),
  });
  if (stats.isError) return <p className="text-sm text-red-700">{errorMessage(stats.error)}</p>;
  if (!stats.data) return <p className="text-sm text-slate-500">…</p>;
  const s = stats.data;
  const max = Math.max(1, ...s.days.map((d) => d.clicks));
  const figures: [string, number][] = [
    [it ? 'Oggi' : 'Today', s.today],
    [it ? '7 giorni' : '7 days', s.week],
    [it ? '30 giorni' : '30 days', s.month],
    [it ? 'Totale' : 'Total', s.total],
  ];
  const name = (bar: string) =>
    bar === 'default'
      ? it
        ? 'Barra del sito'
        : 'Site bar'
      : bar === 'page'
        ? it
          ? 'Barra della pagina'
          : 'Page bar'
        : bar;
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-4 gap-2 text-center">
        {figures.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="text-xl font-semibold text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex h-16 items-end gap-px" aria-hidden="true">
        {s.days.map((d) => (
          <div
            key={d.day}
            title={`${d.day}: ${d.clicks}`}
            className="flex-1 rounded-t bg-blue-500"
            style={{
              height: `${Math.max(2, (d.clicks / max) * 100)}%`,
              opacity: d.clicks ? 1 : 0.25,
            }}
          />
        ))}
      </div>
      {s.bars.length > 1 && (
        <table className="w-full text-sm">
          <caption className="sr-only">
            {it ? 'Clic per barra, 30 giorni' : 'Clicks per bar, 30 days'}
          </caption>
          <tbody>
            {s.bars.map((b) => (
              <tr key={b.bar} className="border-t border-slate-100">
                <td className="py-1 text-slate-700">{name(b.bar)}</td>
                <td className="py-1 text-right font-medium text-slate-800">{b.clicks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default defineAdminPlugin({
  dashboardWidgets: [
    {
      id: 'clicks',
      title: { en: 'Clicks on the Reklaim bar', it: 'Clic sulla barra Reklaim' },
      capability: 'manage_settings',
      component: Clicks,
    },
  ],
});
