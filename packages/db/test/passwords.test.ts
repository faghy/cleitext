/** Known breached passwords (ASVS V6). */
import { describe, expect, it } from 'vitest';
import { isBreachedPassword } from '../src/index.js';

describe('breached passwords', () => {
  it('recognises common passwords whatever the case', () => {
    expect(isBreachedPassword('password1234')).toBe(true);
    expect(isBreachedPassword('Password1234')).toBe(true);
    expect(isBreachedPassword('qwertyuiop12')).toBe(true);
  });

  it('accepts passwords that are not in the list', () => {
    expect(isBreachedPassword('correct horse battery staple')).toBe(false);
    expect(isBreachedPassword('a different password')).toBe(false);
  });
});
