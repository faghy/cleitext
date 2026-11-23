import { describe, expect, it } from 'vitest';
import { bioFor, cleanBios } from './api.js';

describe('author bios by language (core 0.118)', () => {
  it('shows the bio of the page language, else the main one', () => {
    const bios = { it: 'Scrive le notizie.' };
    expect(bioFor('Writes the news.', bios, 'it')).toBe('Scrive le notizie.');
    expect(bioFor('Writes the news.', bios, 'it-IT')).toBe('Scrive le notizie.');
    expect(bioFor('Writes the news.', bios, 'en')).toBe('Writes the news.');
    expect(bioFor('Writes the news.', { it: ' ' }, 'it')).toBe('Writes the news.');
    expect(bioFor('Writes the news.', null, 'it')).toBe('Writes the news.');
  });

  it('drops empty bios', () => {
    expect(cleanBios({ it: 'Ciao', fr: '', de: '  ' })).toEqual({ it: 'Ciao' });
  });
});
