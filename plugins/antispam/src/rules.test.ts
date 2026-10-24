import { describe, expect, it } from 'vitest';
import { normalizeConfig, parseList } from './config';
import { DEFAULT_CONFIG, DEFAULT_THRESHOLDS } from './options';
import {
  allowlisted,
  authorIsLink,
  blocklistHit,
  decide,
  extract,
  fingerprintText,
  hasBbcode,
  linkPoints,
  links,
  normalizeText,
  score,
  scriptCounts,
  scriptPoints,
  type Facts,
  type Submission,
} from './rules';

const clean: Facts = {
  honeypot: false,
  token: 'ok',
  scripts: 0,
  fingerprint: null,
  senderSpam: 0,
  mx: null,
  blocklisted: false,
};
const sub = (changes: Partial<Submission> = {}): Submission => ({
  text: 'Thank you for the recipe, I tried it yesterday.',
  author: 'Anna',
  email: 'anna@example.com',
  url: '',
  ...changes,
});

describe('extract', () => {
  it('reads the text, the author, the email and the website of a comment', () => {
    expect(
      extract({
        entry: '00000000-0000-0000-0000-000000000001',
        back: '/post',
        comment: 'Nice post',
        name: 'Anna',
        email: 'Anna@Example.com',
        url: 'https://anna.example',
        ts: '123',
        homepage: '',
        cl_as: '1',
        cl_as_t: '1.x',
        'cf-turnstile-response': 'token',
      }),
    ).toEqual({
      text: 'Nice post',
      author: 'Anna',
      email: 'anna@example.com',
      url: 'https://anna.example',
    });
  });

  it('reads every field of a custom form, but not the hidden ones', () => {
    const s = extract({
      _spec: 'signed',
      _pr_form: 'abc',
      nome: 'Mario',
      'arrival-date': '2026-12-01',
      topics: ['rooms', 'spa'],
      message: 'Hello',
    });
    expect(s.author).toBe('Mario');
    expect(s.text).toBe('2026-12-01\nrooms\nspa\nHello');
  });
});

describe('the rules', () => {
  it('counts links and gives points beyond the allowed number', () => {
    expect(links('see https://a.example and www.b.example and <a href="x">')).toHaveLength(3);
    expect(linkPoints(2, 2)).toBe(0);
    expect(linkPoints(3, 2)).toBe(2);
    expect(linkPoints(4, 2)).toBe(3);
    expect(linkPoints(20, 2)).toBe(4);
    expect(linkPoints(1, 0)).toBe(2);
  });

  it('finds forum link tags', () => {
    expect(hasBbcode('buy [url=http://x.example]pills[/url]')).toBe(true);
    expect(hasBbcode('[URL]http://x.example[/URL]')).toBe(true);
    expect(hasBbcode('[img]x[/img]')).toBe(true);
    expect(hasBbcode('a [note] in brackets')).toBe(false);
  });

  it('finds author names that are web addresses', () => {
    expect(authorIsLink('https://cheap.example', '')).toBe(true);
    expect(authorIsLink('www.cheap.example', '')).toBe(true);
    expect(authorIsLink('cheap-pills.com', '')).toBe(true);
    expect(authorIsLink('casino', 'casino')).toBe(true);
    expect(authorIsLink('seo-agency.example', 'https://seo-agency.example/')).toBe(true);
    expect(authorIsLink('Anna Rossi', 'https://anna.example')).toBe(false);
    expect(authorIsLink('Dr. Smith', '')).toBe(false);
    expect(authorIsLink('', '')).toBe(false);
  });

  it('counts the letters of each alphabet', () => {
    expect(scriptCounts('Привет, world 你好')).toEqual({ cyrillic: 6, latin: 5, cjk: 2 });
  });

  it('gives points to texts in alphabets the site does not use', () => {
    const latin = new Set(['latin'] as const);
    expect(scriptPoints('Купите дешевые часы прямо сейчас', latin)).toBe(4);
    expect(scriptPoints('便宜的手表现在就买', latin)).toBe(4);
    // A word or two in a long message is fine; many letters still count a little.
    expect(scriptPoints('A long message in English with one word: привет', latin)).toBe(0);
    expect(
      scriptPoints(`${'An English message that goes on and on. '.repeat(5)}Москва Москва`, latin),
    ).toBe(2);
    expect(scriptPoints('Купите часы', new Set(['latin', 'cyrillic'] as const))).toBe(0);
    expect(scriptPoints('Купите часы', null)).toBe(0);
    expect(scriptPoints('Ciao, è già così', latin)).toBe(0);
  });

  it('matches the block list: words, domains, emails and addresses', () => {
    const list = parseList([
      'viagra',
      'cheap.example',
      'https://www.spam.example/path',
      'bot@mail.example',
      '@junk.example',
      '203.0.113.0/24',
      '2001:db8::1',
    ]);
    const hit = (changes: Partial<Submission>, ip = '198.51.100.1') =>
      blocklistHit(list, sub(changes), ip);
    expect(hit({})).toBe(false);
    expect(hit({ text: 'Buy VIAGRA now' })).toBe(true);
    expect(hit({ text: 'see http://shop.cheap.example/x' })).toBe(true);
    expect(hit({ text: 'visit spam.example today' })).toBe(true);
    expect(hit({ url: 'https://spam.example' })).toBe(true);
    expect(hit({ email: 'bot@mail.example' })).toBe(true);
    expect(hit({ email: 'anyone@junk.example' })).toBe(true);
    expect(hit({}, '203.0.113.77')).toBe(true);
    expect(hit({}, '::ffff:203.0.113.77')).toBe(true);
    expect(hit({}, '2001:db8::1')).toBe(true);
    expect(hit({ author: 'Viagra Seller' })).toBe(true);
  });

  it('lets allowed emails, domains and addresses through', () => {
    const list = parseList(['friend@example.com', '@partner.example', '10.0.0.0/8']);
    expect(allowlisted(list, sub({ email: 'friend@example.com' }), '1.2.3.4')).toBe(true);
    expect(allowlisted(list, sub({ email: 'a@partner.example' }), '1.2.3.4')).toBe(true);
    expect(allowlisted(list, sub({ email: '' }), '10.1.2.3')).toBe(true);
    expect(allowlisted(list, sub({ email: 'other@example.com' }), '1.2.3.4')).toBe(false);
  });

  it('keys texts the same whatever their case, spaces and punctuation', () => {
    expect(normalizeText('  Hello,   WORLD!! ')).toBe('hello world');
    expect(fingerprintText('Short one')).toBe('');
    expect(fingerprintText('Cheap watches, best prices: buy now!')).toBe(
      fingerprintText('cheap   WATCHES best prices buy now'),
    );
  });
});

describe('the score', () => {
  const config = normalizeConfig({});

  it('gives nothing to a normal message', () => {
    expect(score(sub(), clean, config)).toEqual({ score: 0, reasons: [], doubtful: false });
  });

  it('adds the points of each rule and says why', () => {
    const scored = score(
      sub({
        text: '[url=https://a.example]x[/url] https://b.example https://c.example',
        author: 'https://a.example',
      }),
      { ...clean, blocklisted: true, scripts: 4, mx: false, senderSpam: 1 },
      config,
    );
    expect(scored.reasons).toEqual([
      'links',
      'bbcode',
      'blocklist',
      'script',
      'author-link',
      'no-mx',
      'sender',
    ]);
    expect(scored.score).toBe(2 + 4 + 6 + 4 + 3 + 3 + 2);
  });

  it('treats the hidden field, forged tokens and haste as bots', () => {
    expect(score(sub(), { ...clean, honeypot: true }, config).score).toBe(10);
    expect(score(sub(), { ...clean, token: 'invalid' }, config).reasons).toEqual(['token']);
    expect(score(sub(), { ...clean, token: 'too-fast' }, config).score).toBe(6);
  });

  it('only doubts a submission without a token', () => {
    expect(score(sub(), { ...clean, token: 'missing' }, config)).toEqual({
      score: 0,
      reasons: ['no-js'],
      doubtful: true,
    });
    expect(score(sub(), { ...clean, token: 'stale' }, config).doubtful).toBe(true);
    expect(score(sub(), { ...clean, token: 'unmarked' }, config).doubtful).toBe(false);
  });

  it('remembers texts: repeated, marked as spam, marked as good', () => {
    const fp = (seen: number, spam: number, ham: number) =>
      score(sub(), { ...clean, fingerprint: { seen, spam, ham } }, config);
    expect(fp(1, 0, 0).score).toBe(0);
    expect(fp(3, 0, 0)).toMatchObject({ score: 3, reasons: ['repeated'] });
    expect(fp(1, 2, 1)).toMatchObject({ score: 5, reasons: ['known-spam'] });
    expect(fp(1, 0, 1)).toMatchObject({ score: -3, reasons: ['known-good'] });
  });

  it('weighs senders of past spam', () => {
    expect(score(sub(), { ...clean, senderSpam: 2 }, config).score).toBe(2);
    expect(score(sub(), { ...clean, senderSpam: 3 }, config).score).toBe(4);
  });

  it('skips the rules turned off', () => {
    const off = normalizeConfig({ bbcode: false, authorLink: false });
    expect(score(sub({ text: '[url]x[/url]', author: 'www.x.example' }), clean, off).score).toBe(0);
  });

  it('honours the allowed number of links', () => {
    const text = 'https://a.example https://b.example https://c.example';
    expect(score(sub({ text }), clean, config).score).toBe(2);
    expect(score(sub({ text }), clean, normalizeConfig({ maxLinks: 5 })).score).toBe(0);
  });
});

describe('the decision', () => {
  const t = DEFAULT_THRESHOLDS;
  const d = (score: number, reasons: string[] = [], doubtful = false) =>
    decide({ score, reasons: reasons as never, doubtful }, t);

  it('follows the thresholds', () => {
    expect(d(0)).toBe('accept');
    expect(d(2)).toBe('accept');
    expect(d(3)).toBe('doubtful');
    expect(d(5)).toBe('doubtful');
    expect(d(6)).toBe('spam');
    expect(d(9)).toBe('spam');
    expect(d(10)).toBe('reject');
  });

  it('always drops what fills the hidden field', () => {
    expect(decide({ score: 1, reasons: ['honeypot'], doubtful: false }, { ...t, reject: 50 })).toBe(
      'reject',
    );
  });

  it('asks for a challenge when only the token is missing', () => {
    expect(d(0, ['no-js'], true)).toBe('challenge');
    expect(d(4, ['links', 'no-js'], true)).toBe('doubtful');
  });

  it('works with the defaults out of the box', () => {
    expect(DEFAULT_CONFIG.thresholds).toEqual({ challenge: 3, spam: 6, reject: 10 });
  });
});
