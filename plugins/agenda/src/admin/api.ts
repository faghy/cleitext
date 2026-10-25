/** The plugin's endpoints, as the admin calls them. */
import { ApiError, pluginApi, t } from '@cleitext/admin-sdk';
import { SLUG } from '../config';
import type { LimitState } from '../model/limit';
import type { Appointment, Exception, Service, Settings, Status } from '../model/types';
import type { ImportNote } from '../import/types';

export const agendaApi = pluginApi(SLUG);

export interface Overview {
  limit: LimitState;
  upgradeUrl: string;
  timeZone: string;
  setupDone: boolean;
  services: number;
  today: number;
  week: number;
  pending: number;
  next: Appointment[];
}

export interface SettingsAnswer {
  settings: Settings;
  siteTimeZone: string | null;
  locales: string[];
  defaultLocale: string;
}

export interface ImportPreview {
  services: {
    name: string;
    duration: number;
    status: string;
    bufferBefore: number;
    bufferAfter: number;
  }[];
  appointments: number;
  future: number;
  exceptions: number;
  timezone: string | null;
  siteTimeZone: string;
  notes: ImportNote[];
}

export interface ImportResult {
  services: number;
  servicesUpdated: number;
  exceptions: number;
  appointments: number;
  existing: number;
  orphans: number;
  settings: { notify: string[]; emails: string[]; shared: boolean | null };
}

export function messageOf(error: unknown): string {
  if (error instanceof ApiError) {
    const p = error.problem as unknown as Record<string, unknown>;
    const text = [p.message, p.detail, p.title].find((v) => typeof v === 'string' && v);
    if (typeof text === 'string') return t(text);
  }
  return t('Something went wrong. Check your connection and try again.');
}

export const agenda = {
  overview: () => agendaApi<Overview>('GET', '/overview'),
  services: (archived = false) =>
    agendaApi<Service[]>('GET', `/services${archived ? '?archived=1' : ''}`),
  createService: (s: Partial<Service>) => agendaApi<Service>('POST', '/services', s),
  saveService: (s: Service) => agendaApi<Service>('PUT', `/services/${s.id}`, s),
  removeService: (id: string) =>
    agendaApi<{ outcome: 'deleted' | 'archived' }>('DELETE', `/services/${id}`),
  exceptions: () => agendaApi<Exception[]>('GET', '/exceptions'),
  createException: (e: Partial<Exception>) => agendaApi<Exception>('POST', '/exceptions', e),
  saveException: (e: Exception) => agendaApi<Exception>('PUT', `/exceptions/${e.id}`, e),
  removeException: (id: string) => agendaApi<{ ok: true }>('DELETE', `/exceptions/${id}`),
  appointments: (query: Record<string, string>) =>
    agendaApi<{ items: Appointment[]; total: number }>(
      'GET',
      `/appointments?${new URLSearchParams(query).toString()}`,
    ),
  book: (input: Record<string, unknown>) => agendaApi<Appointment>('POST', '/appointments', input),
  update: (
    id: string,
    input: {
      status?: Status;
      start?: string;
      name?: string;
      email?: string;
      phone?: string;
      notes?: string;
      notify?: boolean;
    },
  ) => agendaApi<Appointment>('PATCH', `/appointments/${id}`, input),
  slots: (service: string, from: string, to: string) =>
    agendaApi<{ timeZone: string; slots: { start: string; end: string; left: number }[] }>(
      'GET',
      `/slots?service=${service}&from=${from}&to=${to}`,
    ),
  settings: () => agendaApi<SettingsAnswer>('GET', '/settings'),
  saveSettings: (s: Partial<Settings>) => agendaApi<Settings>('PUT', '/settings', s),
  setup: (input: Record<string, unknown>) =>
    agendaApi<{ settings: Settings; service: Service | null }>('POST', '/setup', input),
  importFiles: () => agendaApi<{ files: { name: string; size: number }[] }>('GET', '/import/files'),
  clearImport: () => agendaApi<{ files: [] }>('DELETE', '/import/files'),
  runImport: (kind: 'ssa' | 'wpbc', dryRun: boolean) =>
    agendaApi<{ preview: ImportPreview; result?: ImportResult }>('POST', '/import/run', {
      kind,
      dryRun,
    }),
};
