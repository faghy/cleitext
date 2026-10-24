// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { challengeHtml } from './challenge';

const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({ token: '1790000000000.abcdefghijklmnopqrstuvwxyz012345', wait: 0 }),
}));

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  document.body.innerHTML =
    `<form id="f"><textarea name="comment"></textarea>${challengeHtml({ form: 'core/comment', locale: 'en' }, '/a.js')}<button>Send</button></form>` +
    '<form id="plain"><input name="q"><button>Search</button></form>';
  await import('./public/antispam');
});

const form = () => document.getElementById('f') as HTMLFormElement;
const token = () => form().querySelector<HTMLInputElement>('input[name="cl_as_t"]')!.value;
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('the browser script', () => {
  it('fetches nothing until the visitor starts', () => {
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the form only once the token is in it, through its own handlers', async () => {
    const sent: string[] = [];
    form().addEventListener('submit', (e) => {
      e.preventDefault();
      sent.push(new FormData(form()).get('cl_as_t') as string);
    });
    form().requestSubmit();
    expect(sent).toEqual([]);
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(sent).toEqual(['1790000000000.abcdefghijklmnopqrstuvwxyz012345']);
    expect(fetchMock).toHaveBeenCalledWith(
      '/_antispam/token',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('fills the token when the visitor starts writing', async () => {
    form().querySelector<HTMLInputElement>('input[name="cl_as_t"]')!.value = '';
    form()
      .querySelector('textarea')!
      .dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await flush();
    expect(token()).toBe('1790000000000.abcdefghijklmnopqrstuvwxyz012345');
  });

  it('leaves other forms alone', () => {
    const plain = document.getElementById('plain') as HTMLFormElement;
    let sent = 0;
    plain.addEventListener('submit', (e) => {
      e.preventDefault();
      sent++;
    });
    plain.requestSubmit();
    expect(sent).toBe(1);
  });
});
