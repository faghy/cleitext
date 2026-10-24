import { describe, expect, it } from 'vitest';
import {
  allowedScripts,
  alwaysMarked,
  formGroup,
  listOf,
  normalizeConfig,
  parseList,
} from './config';
import { DEFAULT_CONFIG } from './options';

describe('settings', () => {
  it('are on with zero configuration', () => {
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig(null).forms).toEqual({
      comments: true,
      register: true,
      forms: true,
      builders: true,
      other: false,
    });
  });

  it('are made safe', () => {
    const config = normalizeConfig({
      minSeconds: 999,
      maxLinks: -4,
      retentionDays: 0,
      scripts: 'klingon',
      allowedScripts: ['cyrillic', 'elvish'],
      thresholds: { challenge: 8, spam: 4, reject: 2 },
      forms: { other: true, comments: 'yes' },
      blocklist: 'viagra\n\n  casino  \n# a note\nviagra',
      checkMx: 'true',
    });
    expect(config.minSeconds).toBe(60);
    expect(config.maxLinks).toBe(0);
    expect(config.retentionDays).toBe(1);
    expect(config.scripts).toBe('auto');
    expect(config.allowedScripts).toEqual(['latin', 'cyrillic']);
    // Thresholds never go down.
    expect(config.thresholds).toEqual({ challenge: 8, spam: 8, reject: 8 });
    expect(config.forms.other).toBe(true);
    expect(config.forms.comments).toBe(true);
    expect(config.blocklist).toEqual(['viagra', 'casino']);
    expect(config.checkMx).toBe(false);
  });

  it('bounds the lists', () => {
    expect(listOf(Array.from({ length: 600 }, (_, i) => `w${i}`))).toHaveLength(500);
    expect(listOf(['x'.repeat(300)])[0]).toHaveLength(200);
    expect(listOf(42)).toEqual([]);
  });
});

describe('forms', () => {
  it('are grouped as in the settings, sign-ins never checked', () => {
    expect(formGroup('core/comment')).toBe('comments');
    expect(formGroup('shop/review')).toBe('comments');
    expect(formGroup('core/register')).toBe('register');
    expect(formGroup('forms/contact')).toBe('forms');
    expect(formGroup('prisma/form')).toBe('builders');
    expect(formGroup('fresco-pro/form')).toBe('builders');
    expect(formGroup('shop/checkout')).toBe('other');
    for (const form of ['core/login', 'core/lost-password', 'core/admin-login'])
      expect(formGroup(form)).toBeNull();
  });

  it('know which pages always carry the markup', () => {
    expect(alwaysMarked('core/comment')).toBe(true);
    expect(alwaysMarked('forms/contact')).toBe(true);
    expect(alwaysMarked('prisma/form')).toBe(true);
    expect(alwaysMarked('fresco-pro/form')).toBe(false);
    expect(alwaysMarked('shop/review')).toBe(false);
  });
});

describe('lists', () => {
  it('sort entries by kind', () => {
    const list = parseList([
      'Viagra',
      '@Junk.example',
      'Bot@Mail.example',
      'https://www.spam.example/x',
      'www.cheap.example',
      '203.0.113.5',
      '198.51.100.0/24',
      '10.0.0.0/99',
    ]);
    expect(list.words).toEqual(['viagra', '10.0.0.0/99']);
    expect(list.domains).toEqual(['junk.example', 'spam.example', 'cheap.example']);
    expect([...list.emails]).toEqual(['bot@mail.example']);
    expect(list.ips?.check('198.51.100.9', 'ipv4')).toBe(true);
    expect(list.ips?.check('203.0.113.5', 'ipv4')).toBe(true);
  });
});

describe('alphabets', () => {
  it('follow the site’s languages', () => {
    expect([...allowedScripts(DEFAULT_CONFIG, ['it', 'en'])!]).toEqual(['latin']);
    expect([...allowedScripts(DEFAULT_CONFIG, ['it', 'ru', 'zh-hans'])!]).toEqual([
      'latin',
      'cyrillic',
      'cjk',
    ]);
    expect(allowedScripts({ ...DEFAULT_CONFIG, scripts: 'off' }, ['it'])).toBeNull();
    expect([
      ...allowedScripts({ ...DEFAULT_CONFIG, scripts: 'custom', allowedScripts: ['greek'] }, [
        'ru',
      ])!,
    ]).toEqual(['latin', 'greek']);
  });
});
