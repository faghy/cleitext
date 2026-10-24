/**
 * The Antispam plugin in the browser: when the visitor starts filling a
 * protected form (`[data-cl-antispam]`), asks the site for a time token
 * and puts it in the form. Sending waits for the token and for the
 * minimum time, so people are never refused for being quick; forms sent
 * with JavaScript get the token too, since this runs before their own
 * `submit` handlers. Pages stay cacheable: nothing in the page depends on
 * the visitor. Without JavaScript the form still works (the server then
 * treats the message as doubtful, see the README).
 */

interface TokenAnswer {
  token: string;
  /** Minimum seconds between the token and sending. */
  wait: number;
}
type Win = Window & { cleitextAntispam?: { ready(form: HTMLFormElement): Promise<void> } };

const PATH = '/_antispam/token';
const FIELD = 'cl_as_t';
/** Tokens are fetched again after this (the server takes them for a day). */
const FRESH_FOR = 20 * 3600_000;
const win = window as Win;

(() => {
  if (win.cleitextAntispam) return;

  let current: { answer: Promise<TokenAnswer | null>; at: number } | null = null;
  /** When the token arrived, by this browser's clock. */
  let receivedAt = 0;

  function fetchToken(): Promise<TokenAnswer | null> {
    if (current && Date.now() - current.at < FRESH_FOR) return current.answer;
    const answer = fetch(PATH, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
      .then((r) => (r.ok ? (r.json() as Promise<TokenAnswer>) : null))
      .then((a) => {
        if (!a || typeof a.token !== 'string') return null;
        receivedAt = Date.now();
        return a;
      })
      .catch(() => null);
    current = { answer, at: Date.now() };
    // A failure is not kept: the next interaction tries again.
    void answer.then((a) => {
      if (!a) current = null;
    });
    return answer;
  }

  const protectedForm = (target: EventTarget | null): HTMLFormElement | null => {
    const form = target instanceof Element ? target.closest('form') : null;
    return form && form.querySelector('[data-cl-antispam]') ? form : null;
  };

  async function fill(form: HTMLFormElement): Promise<TokenAnswer | null> {
    const answer = await fetchToken();
    if (answer)
      form
        .querySelectorAll<HTMLInputElement>(`input[name="${FIELD}"]`)
        .forEach((input) => (input.value = answer.token));
    return answer;
  }

  /** The token is in the form and the minimum time has passed. */
  async function ready(form: HTMLFormElement): Promise<void> {
    const answer = await fill(form);
    if (!answer) return;
    const early = receivedAt + answer.wait * 1000 + 300 - Date.now();
    if (early > 0) await new Promise((resolve) => setTimeout(resolve, early));
  }
  win.cleitextAntispam = { ready };

  // The visitor starts: the token is fetched while they write.
  for (const type of ['focusin', 'pointerdown', 'keydown', 'input']) {
    document.addEventListener(
      type,
      (event) => {
        const form = protectedForm(event.target);
        if (form) void fill(form);
      },
      { capture: true, passive: true },
    );
  }

  // Sending waits for the token, then sends again (once).
  const waited = new WeakSet<HTMLFormElement>();
  document.addEventListener(
    'submit',
    (event) => {
      const form = protectedForm(event.target);
      if (!form || waited.has(form)) {
        if (form) waited.delete(form);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const submitter = (event as SubmitEvent).submitter;
      void ready(form).then(() => {
        waited.add(form);
        if (typeof form.requestSubmit === 'function')
          form.requestSubmit(
            submitter instanceof HTMLElement ? (submitter as HTMLButtonElement) : undefined,
          );
        else form.submit();
      });
    },
    true,
  );
})();

export {};
