/** Path patterns of plugin routes (plugin API 1.69: `:param.ext`). */
import { describe, expect, it } from 'vitest';
import { compileRoute } from '../src/plugins/route-matcher.js';

describe('compileRoute', () => {
  it('matches fixed segments, parameters and a final *', () => {
    expect(compileRoute('/events.ics').match('/events.ics')).toEqual({});
    expect(compileRoute('/forms/:id').match('/forms/a%20b')).toEqual({ id: 'a b' });
    expect(compileRoute('/files/*').match('/files/a/b')).toEqual({ '*': 'a/b' });
    expect(compileRoute('/forms/:id').match('/forms/a/b')).toBeNull();
  });

  it('takes a segment with an ending for :param.ext, without the ending', () => {
    const route = compileRoute('/:key.txt');
    expect(route.match('/abc123.txt')).toEqual({ key: 'abc123' });
    expect(route.match('/robots.txt')).toEqual({ key: 'robots' });
    expect(route.match('/.txt')).toBeNull();
    expect(route.match('/abc.xml')).toBeNull();
    expect(route.match('/abc')).toBeNull();
    expect(route.match('/a/b.txt')).toBeNull();
  });
});
