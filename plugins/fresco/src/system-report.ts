/**
 * The system info of Fresco's menu as label → value rows, and as plain text
 * to paste in a support request.
 */
import type { FrescoSystemInfo } from './tools.js';

export interface PluginRow {
  slug: string;
  name: string;
  version: string;
  active: boolean;
  status: string;
}
export interface ThemeRow {
  slug: string;
  name: string;
  version: string;
  active: boolean;
}
export interface CoreStatus {
  version: string;
  environment: string;
  uptimeSeconds: number;
  node: string;
  postgres: string;
  database: { sizeBytes: number | null };
  cache: { enabled: boolean; entries: number };
}

export interface SystemData {
  fresco: FrescoSystemInfo | null;
  core: CoreStatus | null;
  plugins: PluginRow[] | null;
  themes: ThemeRow[] | null;
}

const bytes = (value: number | null | undefined) =>
  value === null || value === undefined
    ? '—'
    : value >= 1024 ** 3
      ? `${(value / 1024 ** 3).toFixed(2)} GB`
      : `${(value / 1024 ** 2).toFixed(1)} MB`;

const duration = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
};

/** The sections of the system info, as label → value rows. */
export function systemSections(
  data: SystemData,
  t: (text: string) => string,
): { title: string; rows: [string, string][] }[] {
  const { fresco, core, plugins, themes } = data;
  const pro = plugins?.find((p) => p.slug === 'fresco-pro');
  const theme = themes?.find((item) => item.active);
  const activePlugins = (plugins ?? []).filter((p) => p.active);
  return [
    {
      title: t('Server'),
      rows: [
        ['Cleitext', core?.version ?? '—'],
        [t('Plugin API'), fresco?.pluginApi ?? '—'],
        [t('Environment'), core?.environment ?? '—'],
        ['Node.js', core?.node ?? fresco?.node ?? '—'],
        [t('Operating system'), fresco?.platform ?? '—'],
        ['PostgreSQL', core?.postgres ?? '—'],
        [t('Database size'), bytes(core?.database.sizeBytes)],
        [t('Memory in use'), bytes(fresco?.memory?.rss)],
        [
          t('Page cache'),
          core ? (core.cache.enabled ? `${t('On')} (${core.cache.entries})` : t('Off')) : '—',
        ],
        [t('Running for'), duration(core?.uptimeSeconds ?? fresco?.uptimeSeconds)],
      ],
    },
    {
      title: t('Site'),
      rows: [
        [t('Name'), fresco?.site.name ?? '—'],
        [t('Languages'), fresco?.site.locales.join(', ') || '—'],
        [t('Active theme'), theme ? `${theme.name} ${theme.version}` : '—'],
      ],
    },
    {
      title: 'Fresco',
      rows: [
        ['Fresco', fresco?.fresco.version ?? '—'],
        ['Fresco Pro', pro ? `${pro.version}${pro.active ? '' : ` (${t('inactive')})`}` : '—'],
        [t('Pages made with Fresco'), String(fresco?.fresco.pages ?? '—')],
        [t('Templates of the Theme Builder'), String(fresco?.fresco.templates ?? '—')],
      ],
    },
    {
      title: t('Active plugins'),
      rows: plugins
        ? activePlugins.map((p): [string, string] => [
            p.name,
            `${p.version}${p.status === 'error' ? ` (${t('error')})` : ''}`,
          ])
        : [[t('Active plugins'), t('Only who manages plugins sees them.')]],
    },
  ];
}

/** The system info as plain text, to paste in a support request. */
export function systemReport(sections: { title: string; rows: [string, string][] }[]): string {
  return sections
    .map(
      (section) =>
        `### ${section.title}\n${section.rows.map(([label, value]) => `${label}: ${value}`).join('\n')}`,
    )
    .join('\n\n');
}
