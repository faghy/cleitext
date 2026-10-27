import { describe, expect, it } from 'vitest';
import {
  FREE_LANGUAGES,
  isFreeSite,
  isUnlocked,
  limitsFor,
  type MultilingualServerApi,
} from '../src/pro';

const api = (...answers: MultilingualServerApi['unlocked']): MultilingualServerApi => ({
  version: 1,
  unlocked: answers,
  upgradeUrl: 'https://example.com/pro',
});

describe('limits without Multilingual Pro', () => {
  it('give the first site of the installation two languages and the others one', () => {
    expect(FREE_LANGUAGES).toBe(2);
    expect(isFreeSite('a', ['a', 'b'])).toBe(true);
    expect(isFreeSite('b', ['a', 'b'])).toBe(false);
    // Older cores cannot tell: every site is free there.
    expect(isFreeSite('b', null)).toBe(true);
    expect(limitsFor(false, true).languages).toBe(2);
    expect(limitsFor(false, false).languages).toBe(1);
    expect(limitsFor(true, false)).toMatchObject({ pro: true, languages: null });
  });

  it('are lifted by any answer of Multilingual Pro, and a failing one counts as no', async () => {
    expect(await isUnlocked(api(), 's')).toBe(false);
    expect(
      await isUnlocked(
        api(
          () => null,
          async () => true,
        ),
        's',
      ),
    ).toBe(true);
    const logged: string[] = [];
    const failing = () => {
      throw new Error('down');
    };
    expect(await isUnlocked(api(failing), 's', (m) => logged.push(m))).toBe(false);
    expect(logged).toHaveLength(1);
  });
});
