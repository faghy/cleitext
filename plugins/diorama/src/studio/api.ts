/** The plugin's endpoints, as the admin calls them. */
import { ApiError, pluginApi, t } from '@cleitext/admin-sdk';
import type { PostItem } from '../model/posts';
import type { SliderData, SliderRecord, SliderSummary } from '../model/types';

export const dioramaApi = pluginApi('diorama');

export interface Overview {
  sliders: SliderSummary[];
  count: number;
  /** Null: no limit (Diorama Pro). */
  limit: number | null;
  canCreate: boolean;
  upgradeUrl: string;
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  swatch: [string, string];
}

/** The body of a refused request: `code: 'limit'` when the site has all its sliders. */
export function problemOf(error: unknown): Record<string, unknown> {
  return error instanceof ApiError ? (error.problem as unknown as Record<string, unknown>) : {};
}

export function isLimit(error: unknown): boolean {
  return problemOf(error).code === 'limit';
}

export function messageOf(error: unknown): string {
  const p = problemOf(error);
  const text = [p.message, p.detail, p.title].find((v) => typeof v === 'string' && v);
  if (typeof text === 'string') return t(text);
  return t('Something went wrong. Check your connection and try again.');
}

export const sliderApi = {
  overview: () => dioramaApi<Overview>('GET', '/sliders'),
  get: (id: string) => dioramaApi<SliderRecord>('GET', `/sliders/${id}`),
  create: (input: { title?: string; template?: string; quick?: unknown[]; data?: SliderData }) =>
    dioramaApi<SliderRecord>('POST', '/sliders', input),
  save: (id: string, input: { title?: string; alias?: string; data?: SliderData }) =>
    dioramaApi<SliderRecord>('PUT', `/sliders/${id}`, input),
  duplicate: (id: string) => dioramaApi<SliderRecord>('POST', `/sliders/${id}/duplicate`),
  remove: (id: string) => dioramaApi<{ ok: true }>('DELETE', `/sliders/${id}`),
  templates: () => dioramaApi<TemplateInfo[]>('GET', '/templates'),
  postsSample: (count: number) => dioramaApi<PostItem[]>('GET', `/posts-sample?count=${count}`),
};
