/**
 * The widgets of the Captcha plugin in the browser: Cloudflare Turnstile or
 * Google reCAPTCHA (v2 checkbox, v2 invisible, v3) in every
 * `[data-cl-captcha]` box, the token put in the form, the submit button
 * kept disabled until the check is passed (when asked), and the failsafe
 * when Turnstile's script cannot load.
 *
 * Plain forms need nothing more: sending one first waits for the token.
 * Forms sent with JavaScript call `window.cleitextChallenge.prepare(form)`
 * before reading their fields and `reset(form)` after a refused submission
 * (the core's convention, plugin API 1.38).
 *
 * On demand (1.1.0), a box stays empty until it is asked for: by
 * `require(form)` or `reset(form)` after a refusal, or by the page's address
 * (`?cl-challenge=<form id>`) when a form without JavaScript came back.
 */
import type { WidgetOptions } from '../challenge';

interface TurnstileApi {
  render(box: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  getResponse(id: string): string | undefined;
}
interface RecaptchaApi {
  ready(callback: () => void): void;
  render(box: HTMLElement, options: Record<string, unknown>): number;
  reset(id?: number): void;
  getResponse(id?: number): string;
  execute(idOrKey?: number | string, options?: { action: string }): Promise<string> | void;
}
interface ChallengeApi {
  prepare(form: HTMLFormElement): Promise<void>;
  reset(form: HTMLFormElement): void;
  render(root?: ParentNode): void;
  /** Shows the form's captcha when it appears only when asked (plugin API 1.45). */
  require(form: HTMLFormElement): void;
}
type Win = Window & {
  cleitextChallenge?: ChallengeApi;
  turnstile?: TurnstileApi;
  grecaptcha?: RecaptchaApi;
};

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const RECAPTCHA_SRC = 'https://www.google.com/recaptcha/api.js';
/** Turnstile's script did not load in this time: the failsafe takes over. */
const SCRIPT_TIMEOUT = 10_000;
/** How long sending waits for Turnstile to finish by itself. */
const TOKEN_WAIT = 20_000;
/** Tokens of invisible checks are fetched again after this. */
const FRESH_FOR = 90_000;

const win = window as Win;
/** A provider's script did not load. */
const LOAD_ERROR = 'cl-captcha-load';

interface Widget {
  box: HTMLElement;
  o: WidgetOptions;
  form: HTMLFormElement | null;
  /** The token is in the form. */
  ready(): boolean;
  /** Gets a token, asking the provider when needed. */
  ensure(): Promise<void>;
  reset(): void;
}

(() => {
  if (win.cleitextChallenge) {
    // Loaded again by markup added later (innerHTML): render the new boxes.
    win.cleitextChallenge.render(document);
    return;
  }

  const scripts = new Map<string, Promise<void>>();
  function load(src: string, timeoutMs = 0): Promise<void> {
    let loading = scripts.get(src);
    if (!loading) {
      loading = new Promise<void>((resolve, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.async = true;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error(`${src} did not load`));
        document.head.append(el);
        if (timeoutMs) setTimeout(() => reject(new Error(`${src} timed out`)), timeoutMs);
      });
      scripts.set(src, loading);
    }
    return loading;
  }

  async function turnstile(): Promise<TurnstileApi> {
    await load(TURNSTILE_SRC, SCRIPT_TIMEOUT);
    if (!win.turnstile) throw new Error('Turnstile is missing');
    return win.turnstile;
  }

  async function recaptcha(query: string): Promise<RecaptchaApi> {
    await load(`${RECAPTCHA_SRC}${query}`, 30_000);
    const api = win.grecaptcha;
    if (!api) throw new Error('reCAPTCHA is missing');
    await new Promise<void>((resolve) => api.ready(resolve));
    return api;
  }

  const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
  const hl = (o: WidgetOptions) =>
    o.lang && o.lang !== 'auto' ? `&hl=${encodeURIComponent(o.lang)}` : '';

  /** A hidden field of the form, created when missing. */
  function hidden(box: HTMLElement, name: string): HTMLInputElement {
    let input = box.querySelector<HTMLInputElement>(`input[type=hidden][name="${name}"]`);
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      box.append(input);
    }
    return input;
  }

  function say(box: HTMLElement, text: string) {
    let note = box.parentElement?.querySelector<HTMLElement>(':scope > .cl-captcha__message');
    if (!note) {
      note = document.createElement('p');
      note.className = 'cl-captcha__message';
      note.setAttribute('role', 'alert');
      box.after(note);
    }
    note.textContent = text;
    note.hidden = !text;
  }

  function lock(w: { form: HTMLFormElement | null; o: WidgetOptions }, locked: boolean) {
    if (!w.o.lock || !w.form) return;
    w.form
      .querySelectorAll<HTMLButtonElement | HTMLInputElement>(
        'button[type=submit], button:not([type]), input[type=submit]',
      )
      .forEach((button) => {
        if (locked) button.setAttribute('data-cl-locked', '');
        else button.removeAttribute('data-cl-locked');
        button.disabled = locked;
      });
  }

  /** A widget whose token comes when the visitor passes the check (Turnstile, v2 checkbox). */
  function visible(
    box: HTMLElement,
    o: WidgetOptions,
    form: HTMLFormElement | null,
    start: (callbacks: { solved(): void; expired(): void }) => Promise<{
      token(): string;
      reset(): void;
    } | null>,
  ): Widget {
    const waiting: (() => void)[] = [];
    let api: { token(): string; reset(): void } | null = null;
    let failed = false;
    const solved = () => {
      say(box, '');
      lock(w, false);
      waiting.splice(0).forEach((fn) => fn());
    };
    const w: Widget = {
      box,
      o,
      form,
      ready: () => failed || Boolean(api?.token()),
      async ensure() {
        if (w.ready()) return;
        await new Promise<void>((resolve, reject) => {
          waiting.push(resolve);
          setTimeout(() => (w.ready() ? resolve() : reject(new Error(o.msg))), TOKEN_WAIT);
        });
      },
      reset() {
        api?.reset();
        lock(w, true);
      },
    };
    lock(w, true);
    start({ solved, expired: () => lock(w, true) }).then(
      (ready) => {
        api = ready;
        if (!ready) {
          // The failsafe let the form go without a check.
          failed = true;
          solved();
        }
      },
      () => {
        // Nothing to show and no failsafe: say why, so nobody is left guessing.
        failed = true;
        solved();
        say(box, o.err);
      },
    );
    return w;
  }

  function turnstileWidget(box: HTMLElement, o: WidgetOptions, form: HTMLFormElement | null) {
    return visible(box, o, form, async ({ solved, expired }) => {
      try {
        const api = await turnstile();
        const id = api.render(box, {
          sitekey: o.k,
          action: o.a,
          theme: o.theme,
          size: o.size,
          appearance: o.appearance,
          language: o.lang || 'auto',
          'refresh-expired': 'auto',
          callback: solved,
          'expired-callback': expired,
        });
        return { token: () => api.getResponse(id) ?? '', reset: () => api.reset(id) };
      } catch {
        // Turnstile cannot be reached from here: the failsafe decides.
        if (o.failsafe === 'recaptcha' && o.fallback) {
          hidden(box, 'cl-captcha-failsafe').value = 'recaptcha';
          return checkbox(box, { ...o, k: o.fallback }, solved, expired);
        }
        if (o.failsafe === 'allow') {
          hidden(box, 'cl-captcha-failsafe').value = 'allow';
          return null;
        }
        throw new Error('Turnstile did not load');
      }
    });
  }

  async function checkbox(
    box: HTMLElement,
    o: WidgetOptions,
    solved: () => void,
    expired: () => void,
  ) {
    const api = await recaptcha(`?render=explicit${hl(o)}`);
    const id = api.render(box, {
      sitekey: o.k,
      theme: o.theme === 'dark' || (o.theme === 'auto' && prefersDark()) ? 'dark' : 'light',
      size: o.size === 'compact' ? 'compact' : 'normal',
      callback: solved,
      'expired-callback': expired,
    });
    return { token: () => api.getResponse(id), reset: () => api.reset(id) };
  }

  /** A widget whose token is asked for when the form is sent (v2 invisible, v3). */
  function invisible(box: HTMLElement, o: WidgetOptions, form: HTMLFormElement | null): Widget {
    let freshAt = 0;
    let waiting: ((token: string) => void) | null = null;
    let widgetId: number | undefined;
    const field = () => hidden(box, 'g-recaptcha-response');
    const ready =
      o.p === 'recaptcha3'
        ? recaptcha(`?render=${encodeURIComponent(o.k)}${hl(o)}`)
        : recaptcha(`?render=explicit${hl(o)}`).then((api) => {
            widgetId = api.render(box, {
              sitekey: o.k,
              size: 'invisible',
              badge: 'bottomright',
              callback: (token: string) => waiting?.(token),
            });
            return api;
          });
    ready.catch(() => say(box, o.err));
    const w: Widget = {
      box,
      o,
      form,
      ready: () => Boolean(field().value) && Date.now() - freshAt < FRESH_FOR,
      async ensure() {
        if (w.ready()) return;
        const api = await ready.catch(() => {
          throw new Error(LOAD_ERROR);
        });
        let token: string;
        if (o.p === 'recaptcha3') {
          token = (await api.execute(o.k, { action: o.a })) ?? '';
        } else {
          api.reset(widgetId);
          token = await new Promise<string>((resolve) => {
            waiting = resolve;
            void api.execute(widgetId);
          });
        }
        // v2 invisible fills its own textarea too; one field is enough.
        box.querySelectorAll('textarea[name="g-recaptcha-response"]').forEach((t) => t.remove());
        field().value = token;
        freshAt = Date.now();
      },
      reset() {
        field().value = '';
        freshAt = 0;
      },
    };
    return w;
  }

  const widgets: Widget[] = [];
  const inForm = (form: HTMLFormElement) =>
    widgets.filter((w) => w.form === form && w.box.isConnected);

  /** The form ids the page's address asks a captcha for. */
  const asked = new URLSearchParams(window.location.search).getAll('cl-challenge');

  function setUp(box: HTMLElement) {
    let o: WidgetOptions;
    try {
      o = JSON.parse(box.dataset.clCaptcha ?? '') as WidgetOptions;
    } catch {
      box.setAttribute('data-cl-ready', '');
      return;
    }
    // On demand: nothing until asked.
    if (o.d && !box.hasAttribute('data-cl-reveal') && !asked.includes(o.f)) return;
    box.setAttribute('data-cl-ready', '');
    const form = box.closest('form');
    widgets.push(
      o.p === 'turnstile'
        ? turnstileWidget(box, o, form)
        : o.p === 'recaptcha2'
          ? visible(box, o, form, ({ solved, expired }) => checkbox(box, o, solved, expired))
          : invisible(box, o, form),
    );
  }

  function render(root: ParentNode = document) {
    root.querySelectorAll<HTMLElement>('[data-cl-captcha]:not([data-cl-ready])').forEach(setUp);
  }

  const api: ChallengeApi = {
    async prepare(form) {
      const list = inForm(form);
      try {
        await Promise.all(list.map((w) => w.ensure()));
      } catch (error) {
        const first = list[0];
        if (first)
          say(first.box, (error as Error).message === LOAD_ERROR ? first.o.err : first.o.msg);
        throw error;
      }
    },
    reset(form) {
      inForm(form).forEach((w) => w.reset());
      // After a refusal, a captcha shown on demand appears.
      api.require(form);
    },
    render,
    require(form) {
      form
        .querySelectorAll<HTMLElement>('[data-cl-captcha]:not([data-cl-ready])')
        .forEach((box) => {
          box.setAttribute('data-cl-reveal', '');
          setUp(box);
        });
    },
  };
  win.cleitextChallenge = api;

  // Sending a form first waits for its tokens, then sends it again.
  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const list = inForm(form);
      if (list.length === 0 || list.every((w) => w.ready())) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const submitter = (event as SubmitEvent).submitter;
      api.prepare(form).then(
        () => {
          if (!list.every((w) => w.ready())) return;
          if (typeof form.requestSubmit === 'function')
            form.requestSubmit(
              submitter instanceof HTMLElement ? (submitter as HTMLButtonElement) : undefined,
            );
          else form.submit();
        },
        () => {},
      );
    },
    true,
  );

  const style = document.createElement('style');
  style.textContent =
    '.cl-captcha{margin:0 0 1rem;max-width:100%}.cl-captcha--invisible{margin:0}' +
    '.cl-captcha__message{color:#b91c1c;margin:0 0 1rem}' +
    'html[dir] [data-cl-locked]{cursor:not-allowed;opacity:.6}';
  document.head.append(style);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => render());
  } else {
    render();
  }
  // Forms added later (popups, pages loaded with JavaScript).
  const hasBox = (node: Node) =>
    node instanceof Element &&
    (node.matches('[data-cl-captcha]') || node.querySelector('[data-cl-captcha]') !== null);
  new MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some(hasBox))) render();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
