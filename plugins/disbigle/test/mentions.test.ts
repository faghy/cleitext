import type { CxdBlock } from '@cleitext/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { fullAcct, linkMentions, mentionMap, protectMentions } from '../src/mentions';
import { withAliases } from '../src/service';

const profiles = mentionMap([
  { acct: 'anna@disbigle.com', url: 'https://disbigle.com/@anna' },
  { acct: 'bob@mastodon.social', url: 'https://mastodon.social/@bob' },
  { acct: 'evil@x.example', url: 'javascript:alert(1)' },
]);

describe('mentions in the article', () => {
  it('become links to the profiles the server resolved', () => {
    const blocks: CxdBlock[] = [
      {
        id: 'p',
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [
          {
            text: 'Grazie @Anna@disbigle.com e @bob@mastodon.social, non @nobody@else.example.',
            marks: ['italic'],
          },
        ],
      },
    ];
    const [p] = linkMentions(blocks, profiles);
    expect(p!.content).toEqual([
      { text: 'Grazie ', marks: ['italic'] },
      {
        type: 'link',
        href: 'https://disbigle.com/@anna',
        rel: 'nofollow noopener',
        children: [{ text: '@Anna@disbigle.com', marks: ['italic'] }],
      },
      { text: ' e ', marks: ['italic'] },
      {
        type: 'link',
        href: 'https://mastodon.social/@bob',
        rel: 'nofollow noopener',
        children: [{ text: '@bob@mastodon.social', marks: ['italic'] }],
      },
      { text: ', non @nobody@else.example.', marks: ['italic'] },
    ]);
  });

  it('leave links, code, unsafe profiles and untouched blocks alone', () => {
    const blocks: CxdBlock[] = [
      {
        id: 'g',
        type: 'core/group',
        v: 1,
        attrs: {},
        children: [
          {
            id: 'p',
            type: 'core/paragraph',
            v: 1,
            attrs: {},
            content: [
              {
                type: 'link',
                href: 'https://x.example',
                children: [{ text: '@anna@disbigle.com' }],
              },
              { text: '@anna@disbigle.com', marks: ['code'] },
              { text: ' @evil@x.example' },
            ],
          },
        ],
      },
      { id: 'q', type: 'core/paragraph', v: 1, attrs: {}, content: [{ text: 'nulla' }] },
    ];
    expect(linkMentions(blocks, profiles)).toBe(blocks);
    // Without the @ it is not linked (only written mentions are).
    const plain: CxdBlock[] = [
      {
        id: 'p',
        type: 'core/paragraph',
        v: 1,
        attrs: {},
        content: [{ text: 'anna@disbigle.com' }],
      },
    ];
    expect(linkMentions(plain, profiles)).toBe(plain);
  });

  it('complete the accounts of the server itself', () => {
    expect(fullAcct('anna', 'Disbigle.com')).toBe('anna@disbigle.com');
    expect(fullAcct('@bob@mastodon.social', 'disbigle.com')).toBe('bob@mastodon.social');
  });
});

describe('protectMentions', () => {
  it('hides the handles from Cloudflare’s Email Obfuscation, in text and links only', () => {
    const html =
      '<head><title>By @a@x.example</title><script>var s="@b@y.example";</script></head>' +
      '<p data-x="@c@z.example">Thanks @Ersel@disbigle.com and <a href="https://disbigle.com/@Ersel">@Ersel@disbigle.com</a>, mail info@disbigle.com</p>';
    expect(protectMentions(html)).toBe(
      '<head><title>By @a@x.example</title><script>var s="@b@y.example";</script></head>' +
        '<p data-x="@c@z.example">Thanks <!--email_off-->@Ersel@disbigle.com<!--email_on--> and <a href="https://disbigle.com/@Ersel"><!--email_off-->@Ersel@disbigle.com<!--email_on--></a>, mail info@disbigle.com</p>',
    );
  });

  it('gives back the same page when there is no handle', () => {
    const html = '<p>Write to info@disbigle.com</p>';
    expect(protectMentions(html)).toBe(html);
  });
});

describe('withAliases', () => {
  it('also names the server’s people by the domain of their handles', () => {
    const hosts = new Set(['app.disbigle.com', 'disbigle.com']);
    expect(
      withAliases(
        [
          { acct: 'ersel@app.disbigle.com', url: 'https://app.disbigle.com/@Ersel' },
          { acct: 'bob@mastodon.social', url: 'https://mastodon.social/@bob' },
        ],
        hosts,
      ),
    ).toEqual([
      { acct: 'ersel@app.disbigle.com', url: 'https://app.disbigle.com/@Ersel' },
      { acct: 'bob@mastodon.social', url: 'https://mastodon.social/@bob' },
      { acct: 'ersel@disbigle.com', url: 'https://app.disbigle.com/@Ersel' },
    ]);
  });
});
