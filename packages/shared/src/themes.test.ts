import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_CSS_MAX,
  additionalCssProblem,
  additionalCssSchema,
  styleText,
  themeEntry,
  themeManifestSchema,
} from './themes.js';

describe('Additional CSS', () => {
  it('cannot leave the <style> element', () => {
    expect(additionalCssProblem('.a{color:red} /* <b> */')).toBeNull();
    for (const css of ['</style>', '</STYLE', '</ style', '<style>', '<script>', 'a\u0000b']) {
      expect(additionalCssProblem(css)).not.toBeNull();
    }
    expect(additionalCssProblem('x'.repeat(ADDITIONAL_CSS_MAX + 1))).toContain('100,000');
    expect(additionalCssSchema.safeParse('.a{}').success).toBe(true);
    expect(additionalCssSchema.safeParse('</style>').success).toBe(false);
  });

  it('is escaped when printed anyway', () => {
    expect(styleText('a{}</style><script>\u0000')).toBe('a{}\\3C /style>\\3C script>');
  });
});

describe('theme manifests', () => {
  it('name a parent and the bundle', () => {
    const child = themeManifestSchema.parse({
      slug: 'kid',
      name: 'Kid',
      version: '1.0.0',
      parent: 'mom',
      parentVersion: '^1.0.0',
    });
    expect(child).toMatchObject({ parent: 'mom', parentVersion: '^1.0.0' });
    expect(themeManifestSchema.safeParse({ ...child, parent: '../x' }).success).toBe(false);
    expect(themeEntry(child, () => false)).toBeNull();
    expect(themeEntry(child, (file) => file === 'src/index.tsx')).toBe('dist/index.js');
    expect(themeEntry({ ...child, entry: 'build/x.js' }, () => false)).toBe('build/x.js');
    expect(themeEntry({ entry: undefined, parent: undefined }, () => false)).toBe('dist/index.js');
  });
});
