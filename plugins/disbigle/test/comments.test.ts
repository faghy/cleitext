import { describe, expect, it } from 'vitest';
import { commentsFromContext, initials, withAvatars } from '../src/comments';

const account = (id: string, acct: string, avatar: string, name = 'Anna Rossi') => ({
  id,
  acct,
  username: acct.split('@')[0],
  display_name: name,
  url: `https://${acct.includes('@') ? acct.split('@')[1] : 'app.disbigle.com'}/@${acct.split('@')[0]}`,
  avatar: avatar.replace('static', 'anim'),
  avatar_static: avatar,
});

const reply = (id: string, parent: string, extra: Record<string, unknown> = {}) => ({
  id,
  in_reply_to_id: parent,
  visibility: 'public',
  url: `https://app.disbigle.com/@anna/${id}`,
  created_at: '2026-11-15T10:00:00.000Z',
  content: `<p>Reply ${id}<script>x</script></p>`,
  spoiler_text: '',
  account: account('7', 'anna', 'https://app.disbigle.com/system/static/anna.png'),
  ...extra,
});

const options = {
  statusId: '100',
  accountId: '1',
  instanceHost: 'app.disbigle.com',
  remoteAvatars: false,
};

describe('fediverse comments', () => {
  it('shows public and unlisted replies, not those of the connected account', () => {
    const comments = commentsFromContext(
      {
        ancestors: [],
        descendants: [
          reply('101', '100'),
          reply('102', '100', {
            visibility: 'unlisted',
            account: account(
              '1',
              'blog',
              'https://app.disbigle.com/system/static/blog.png',
              'Blog',
            ),
          }),
          reply('103', '101', { visibility: 'unlisted' }),
          reply('104', '100', { visibility: 'private' }),
          reply('105', '100', { visibility: 'direct' }),
          reply('106', '103', {
            account: account(
              '8',
              'bob@mastodon.social',
              'https://files.mastodon.social/static/bob.png',
              '',
            ),
          }),
        ],
      },
      options,
    );
    expect(comments.map((c) => [c.id, c.depth])).toEqual([
      ['101', 0],
      ['103', 1],
      ['106', 2],
    ]);
    expect(comments[0]).toMatchObject({
      url: 'https://app.disbigle.com/@anna/101',
      displayName: 'Anna Rossi',
      acct: 'anna@app.disbigle.com',
      profileUrl: 'https://app.disbigle.com/@anna',
      avatar: 'https://app.disbigle.com/system/static/anna.png',
      initials: 'AR',
      html: '<p>Reply 101</p>',
    });
    // Remote picture: initials, unless allowed.
    expect(comments[2]).toMatchObject({ avatar: null, displayName: 'bob', initials: 'B' });
    expect(
      commentsFromContext(
        {
          descendants: [
            reply('106', '100', {
              account: account(
                '8',
                'bob@mastodon.social',
                'https://files.mastodon.social/static/bob.png',
              ),
            }),
          ],
        },
        { ...options, remoteAvatars: true },
      )[0]!.avatar,
    ).toBe('https://files.mastodon.social/static/bob.png');
  });

  it('skips replies without address or account, and anything that is not a context', () => {
    expect(commentsFromContext(null, options)).toEqual([]);
    expect(commentsFromContext({ descendants: 'x' }, options)).toEqual([]);
    expect(
      commentsFromContext(
        {
          descendants: [
            reply('1', '100', { url: 'javascript:1', uri: '' }),
            reply('2', '100', { account: {} }),
          ],
        },
        options,
      ),
    ).toEqual([]);
  });

  it('keeps the content warning as text', () => {
    const [c] = commentsFromContext(
      { descendants: [reply('1', '100', { spoiler_text: ' <b>Spoiler</b> ' })] },
      options,
    );
    expect(c!.spoiler).toBe('<b>Spoiler</b>');
  });

  it('shows remote pictures only when the site allows them', () => {
    const remote = {
      ...commentsFromContext({ descendants: [reply('1', '100')] }, options)[0]!,
      avatar: 'https://files.example/a.png',
    };
    const local = { ...remote, id: '2', avatar: 'https://APP.disbigle.com/a.png' };
    expect(withAvatars([remote, local], 'app.disbigle.com', false).map((c) => c.avatar)).toEqual([
      null,
      'https://APP.disbigle.com/a.png',
    ]);
    expect(withAvatars([remote], 'app.disbigle.com', true)[0]!.avatar).toBe(
      'https://files.example/a.png',
    );
  });

  it('makes initials of names with emoji codes and dots', () => {
    expect(initials('anna.rossi')).toBe('AR');
    expect(initials(':blobcat: Élise')).toBe('É');
    expect(initials('***')).toBe('?');
  });
});

describe('texts', () => {
  it('speak the languages of Disbigle, English otherwise', async () => {
    const { strings } = await import('../src/render');
    expect(strings('es').cta).toBe('Comenta en el fediverso');
    expect(strings('it-IT').cta).toBe('Commenta sul fediverso');
    expect(strings('zh').cta).toBe('在联邦宇宙中评论');
    expect(strings('pt').cta).toBe('Comment on the fediverse');
  });
});
