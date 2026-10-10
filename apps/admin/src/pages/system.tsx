import { useT } from '@cleitext/admin-sdk';
import type { SystemStatusView } from '@cleitext/shared';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api, errorMessage } from '../api';
import { Alert, Card } from '../components/ui';

function bytes(n: number | null): string {
  if (n === null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** System status (RF-ADM-07): versions, migrations, cache, storage, plugins. */
export function SystemPage() {
  const { t } = useT();
  const status = useQuery({
    queryKey: ['system', 'status'],
    queryFn: () => api<SystemStatusView>('GET', '/system/status'),
  });
  const s = status.data;
  const hours = s ? Math.floor(s.uptimeSeconds / 3600) : 0;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('System status')}</h1>
      {status.error && <Alert>{errorMessage(status.error)}</Alert>}
      {s && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('Software')}>
            <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
              <Row label="Cleitext">{s.version}</Row>
              <Row label="Node.js">{s.node}</Row>
              <Row label="PostgreSQL">{s.postgres}</Row>
              <Row label={t('Environment')}>{s.environment}</Row>
              <Row label={t('Running for')}>
                {t('{hours} h {minutes} min', {
                  hours,
                  minutes: Math.floor((s.uptimeSeconds % 3600) / 60),
                })}
              </Row>
            </dl>
          </Card>
          <Card title={t('Database')}>
            <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
              <Row label={t('Migrations')}>
                {s.migrations.upToDate ? (
                  <span className="text-emerald-700">
                    {t('Up to date ({count})', { count: s.migrations.applied })}
                  </span>
                ) : (
                  <span className="text-red-700">
                    {t('{pending} pending: run cleitext migrate', {
                      pending: s.migrations.expected - s.migrations.applied,
                    })}
                  </span>
                )}
              </Row>
              <Row label={t('Size')}>{bytes(s.database.sizeBytes)}</Row>
            </dl>
          </Card>
          <Card title={t('Media and cache')}>
            <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
              <Row label={t('Media files')}>
                {t('{files} files, {size}', { files: s.media.files, size: bytes(s.media.bytes) })}
              </Row>
              <Row label={t('Page cache')}>
                {s.cache.enabled
                  ? t('{entries} pages · {hits} hits · {misses} misses', {
                      entries: s.cache.entries,
                      hits: s.cache.hits,
                      misses: s.cache.misses,
                    })
                  : t('Disabled')}
              </Row>
              <Row label={t('Scheduled tasks')}>
                {s.scheduler.intervalSeconds > 0
                  ? t('Every {seconds} s', { seconds: s.scheduler.intervalSeconds })
                  : t('Disabled')}
              </Row>
              <Row label={t('Email')}>
                {s.mail.siteSettings
                  ? t('Site SMTP server')
                  : t('Server settings ({driver})', { driver: s.mail.serverDriver })}
              </Row>
            </dl>
          </Card>
          <Card title={t('Plugins')}>
            {s.plugins.length === 0 ? (
              <p className="text-sm text-slate-600">{t('No plugins are installed.')}</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {s.plugins.map((p) => (
                  <li key={p.slug} className="py-1.5">
                    <span className="font-medium">{p.slug}</span> {p.version} ·{' '}
                    {p.status === 'error' ? (
                      <span className="text-red-700">{t('not loaded')}</span>
                    ) : p.active ? (
                      t('active')
                    ) : (
                      t('inactive')
                    )}
                    {p.errors > 0 && (
                      <span className="block text-xs text-red-700">
                        {t('{count} errors', { count: p.errors })}: {p.lastError}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
