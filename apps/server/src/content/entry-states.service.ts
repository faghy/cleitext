import type { EntryState } from '@cleitext/shared';
import { Injectable } from '@nestjs/common';
import { PluginHost } from '../plugins/plugin-host.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { LanguagesService } from './languages.service.js';

/** Pages the site uses for something, set in Settings → Reading. */
const CORE_STATES = [
  ['frontPage', 'front', { en: 'Front page', it: 'Home' }],
  ['postsPage', 'posts', { en: 'Posts page', it: 'Pagina degli articoli' }],
  ['errorPage', 'error', { en: '404 page', it: 'Pagina 404' }],
] as const;

/**
 * What entries are for, shown next to their title (like WordPress's post
 * states): the front, posts and 404 pages, with their translations, and
 * what plugins add through the `entry.states` filter.
 */
@Injectable()
export class EntryStatesService {
  constructor(
    private readonly settings: SettingsService,
    private readonly languages: LanguagesService,
    private readonly host: PluginHost,
  ) {}

  async of(siteId: string, ids: string[]): Promise<Record<string, EntryState[]>> {
    const states: Record<string, EntryState[]> = {};
    if (ids.length === 0) return states;
    const wanted = new Set(ids);
    const core = await this.settings.getCore(siteId);
    const special = CORE_STATES.flatMap(([setting, key, label]) => {
      const id = core[setting];
      return id ? [{ id, key, label }] : [];
    });
    // The translations of the front page are the front pages of their languages.
    const translations = await this.languages.translations(
      siteId,
      'entry',
      special.map((s) => s.id),
    );
    for (const { id, key, label } of special) {
      for (const target of [id, ...(translations.get(id) ?? []).map((t) => t.id)]) {
        if (wanted.has(target)) (states[target] ??= []).push({ key, label });
      }
    }
    const filtered = await this.host.applyFilter(
      'entry.states',
      states,
      { siteId, ids: [...wanted] },
      siteId,
    );
    // Only the entries asked for, with well-formed states.
    const result: Record<string, EntryState[]> = {};
    for (const id of wanted) {
      const list = (filtered[id] ?? []).filter(
        (s) =>
          s &&
          typeof s.key === 'string' &&
          (typeof s.label === 'string' || typeof s.label === 'object'),
      );
      if (list.length > 0) result[id] = list;
    }
    return result;
  }

  /** The same items, each with its states. */
  async annotate<T extends { id: string }>(
    siteId: string,
    items: T[],
  ): Promise<(T & { states?: EntryState[] })[]> {
    const states = await this.of(
      siteId,
      items.map((item) => item.id),
    );
    return items.map((item) => (states[item.id] ? { ...item, states: states[item.id] } : item));
  }
}
