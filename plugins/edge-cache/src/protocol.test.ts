import { describe, expect, it } from 'vitest';
import {
  banRegex,
  chunks,
  cloudflareRule,
  cloudflareTag,
  cloudflareTags,
  edgeHeaders,
  varnishTags,
} from './protocol';

const SITE = '01a12345-6789-7abc-8def-0123456789ab';

describe('edge headers', () => {
  it('are none without a cache in front', () => {
    expect(
      edgeHeaders({ varnish: false, cloudflare: false, ttl: 3600 }, SITE, 200, ['site']),
    ).toEqual({});
  });

  it('give Varnish s-maxage and the tags, site first', () => {
    expect(
      edgeHeaders({ varnish: true, cloudflare: false, ttl: 3600 }, SITE, 200, [
        'entry:abc',
        'site',
        'type:article',
        'site',
      ]),
    ).toEqual({
      'cache-control': 'public, max-age=0, s-maxage=3600, must-revalidate',
      'x-cleitext-tags': 'site entry:abc type:article',
    });
  });

  it('give Cloudflare its own TTL header and tags of the site', () => {
    const headers = edgeHeaders({ varnish: false, cloudflare: true, ttl: 600 }, SITE, 404, [
      'site',
      'menus:it',
    ]);
    expect(headers).toEqual({
      'cache-control': 'public, max-age=0, s-maxage=60, must-revalidate',
      'cdn-cache-control': 'max-age=60',
      'cache-tag': 'cx-01a123456789-site,cx-01a123456789-menus:it',
    });
  });

  it('stay within the header limits, keeping site', () => {
    const many = Array.from({ length: 2000 }, (_, i) => `entry:${String(i).padStart(8, '0')}`);
    const v = varnishTags([...many, 'site']);
    expect(v.length).toBeLessThanOrEqual(6000);
    expect(v.startsWith('site ')).toBe(true);
    const c = cloudflareTags(SITE, [...many, 'site']);
    expect(c.length).toBeLessThanOrEqual(15000);
    expect(c.startsWith('cx-01a123456789-site,')).toBe(true);
  });
});

describe('purge', () => {
  it('builds the BAN regex, escaped', () => {
    expect(banRegex(['entry:abc', 'site'])).toBe('(^| )(site|entry:abc)( |$)');
    expect(banRegex(['type:a.b'])).toBe('(^| )(type:a\\.b)( |$)');
    const regex = new RegExp(banRegex(['entry:abc']));
    expect(regex.test('site entry:abc type:article')).toBe(true);
    expect(regex.test('site entry:abcd')).toBe(false);
  });

  it('names Cloudflare tags per site, without forbidden characters', () => {
    expect(cloudflareTag(SITE, 'Entry:X Y,Z')).toBe('cx-01a123456789-entry:x-y-z');
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('writes the Cloudflare rule for the hosts of the site', () => {
    expect(cloudflareRule(['example.com'])).toContain('http.host eq "example.com"');
    expect(cloudflareRule(['a.com', 'b.com'])).toContain('http.host in {"a.com" "b.com"}');
    expect(cloudflareRule(['a.com'])).toContain('not http.cookie contains "cleitext_session"');
  });
});
