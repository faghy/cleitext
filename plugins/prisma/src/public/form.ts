/**
 * Forms of Prisma on the site: sends the message without leaving the page
 * and shows the answer (the form still works without this script: the
 * server then redirects back to the page). Settings in `data-pr-form`.
 */
interface FormConfig {
  id: string;
  confirmationType: 'message' | 'url';
  confirmationUrl: string;
  captcha?: { version: 'v2' | 'v3'; siteKey: string; hideBadge: boolean; message: string };
  /** The site's captcha (Captcha plugin) is in the form. */
  siteCaptcha?: boolean;
  captchaMessage?: string;
}

/** The site's bot protection in the browser (plugin API 1.38). */
interface SiteChallenge {
  prepare(form: HTMLFormElement): Promise<void>;
  reset(form: HTMLFormElement): void;
  /** Shows a captcha that appears only when asked (plugin API 1.45). */
  require?(form: HTMLFormElement): void;
}

interface Grecaptcha {
  ready(fn: () => void): void;
  render(el: HTMLElement, options: { sitekey: string }): number;
  getResponse(id?: number): string;
  reset(id?: number): void;
  execute(siteKey: string, options: { action: string }): Promise<string>;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
    prFormCaptchaLoaded?: () => void;
    cleitextChallenge?: SiteChallenge;
  }
}

/** Not sooner than this after the page opened (the server refuses quicker messages). */
const MIN_FILL_MS = 3000;
const opened = Date.now();

// ---- reCAPTCHA ----------------------------------------------------------------------------

let captchaScript: Promise<Grecaptcha> | null = null;

/** Google's script, once per page (v3 needs the site key in its address). */
function loadCaptcha(config: NonNullable<FormConfig['captcha']>): Promise<Grecaptcha> {
  captchaScript ??= new Promise((resolve, reject) => {
    window.prFormCaptchaLoaded = () => resolve(window.grecaptcha!);
    const script = document.createElement('script');
    script.src =
      config.version === 'v3'
        ? `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(config.siteKey)}&onload=prFormCaptchaLoaded`
        : 'https://www.google.com/recaptcha/api.js?onload=prFormCaptchaLoaded&render=explicit';
    script.async = true;
    script.onerror = () => reject(new Error('reCAPTCHA not loaded'));
    document.head.appendChild(script);
  });
  return captchaScript;
}

// ---- Fields -------------------------------------------------------------------------------

/** A required group of checkboxes needs one checked, not all of them. */
function checkboxGroups(form: HTMLFormElement) {
  for (const group of form.querySelectorAll<HTMLElement>('.pr-form-checkbox')) {
    const boxes = [...group.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
    if (!boxes.some((b) => b.required)) continue;
    const update = () => {
      const any = boxes.some((b) => b.checked);
      for (const b of boxes) b.required = !any;
    };
    for (const b of boxes) b.addEventListener('change', update);
    update();
  }
}

/** The body sent: the form's values, files by name only. */
function bodyOf(form: HTMLFormElement): URLSearchParams {
  const params = new URLSearchParams();
  for (const [name, value] of new FormData(form)) {
    if (typeof value === 'string') params.append(name, value);
    else if (value.name) params.append(name, value.name);
  }
  params.set('_pr_elapsed', String(Date.now() - opened));
  return params;
}

function clearErrors(form: HTMLFormElement) {
  for (const el of form.querySelectorAll('.pr-form__error')) el.remove();
  for (const el of form.querySelectorAll('.pr-form__field.is-invalid'))
    el.classList.remove('is-invalid');
}

/** The server's messages under the fields it refused. */
function showErrors(form: HTMLFormElement, errors: Record<string, string>) {
  for (const [id, message] of Object.entries(errors)) {
    const input = form.querySelector<HTMLElement>(`[name="${CSS.escape(id)}"]:not([type=hidden])`);
    const field = input?.closest<HTMLElement>('.pr-form__field');
    if (!field) continue;
    field.classList.add('is-invalid');
    const note = document.createElement('div');
    note.className = 'pr-form__error';
    note.setAttribute('role', 'alert');
    note.textContent = message;
    field.appendChild(note);
  }
  form
    .querySelector<HTMLElement>(
      '.pr-form__field.is-invalid input, .pr-form__field.is-invalid textarea, .pr-form__field.is-invalid select',
    )
    ?.focus();
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- Sending ------------------------------------------------------------------------------

function init(form: HTMLFormElement) {
  let config: FormConfig;
  try {
    config = JSON.parse(form.dataset.prForm ?? '') as FormConfig;
  } catch {
    return;
  }
  const scope = form.closest<HTMLElement>('.pr-form') ?? form.parentElement!;
  const success = scope.querySelector<HTMLElement>(':scope > .pr-form__success');
  const failed = scope.querySelector<HTMLElement>(':scope > .pr-form__failed');
  const captchaError = form.querySelector<HTMLElement>('.pr-form__captcha-error');
  const button = form.querySelector<HTMLButtonElement>('.pr-form__submit');
  checkboxGroups(form);

  const captcha = config.captcha;
  let widget: number | undefined;
  if (captcha) {
    void loadCaptcha(captcha)
      .then((g) => {
        if (captcha.version === 'v2') {
          const box = form.querySelector<HTMLElement>('.pr-form__captcha');
          if (box) g.ready(() => (widget = g.render(box, { sitekey: captcha.siteKey })));
        } else if (captcha.hideBadge) {
          document.documentElement.classList.add('pr-form-hide-badge');
        }
      })
      .catch(() => {
        if (captchaError) captchaError.textContent = 'reCAPTCHA could not be loaded.';
      });
  }

  const show = (el: HTMLElement | null) => {
    el?.classList.remove('pr-form__message--hide');
  };

  let sending = false;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (sending) return;
    void (async () => {
      clearErrors(form);
      if (captchaError) captchaError.textContent = '';
      const field = form.querySelector<HTMLInputElement>('input[name="_pr_captcha"]');
      if (captcha && field) {
        try {
          const g = await loadCaptcha(captcha);
          field.value =
            captcha.version === 'v3'
              ? await new Promise<string>((resolve, reject) =>
                  g.ready(() =>
                    g.execute(captcha.siteKey, { action: 'submit' }).then(resolve, reject),
                  ),
                )
              : g.getResponse(widget);
        } catch {
          field.value = '';
        }
        if (!field.value) {
          if (captchaError) captchaError.textContent = captcha.message;
          return;
        }
      }
      if (config.siteCaptcha) {
        try {
          await window.cleitextChallenge?.prepare(form);
        } catch {
          if (captchaError) captchaError.textContent = config.captchaMessage ?? '';
          return;
        }
      }
      sending = true;
      button?.setAttribute('aria-busy', 'true');
      if (button) button.disabled = true;
      try {
        // People who fill a form this fast are rare: let the time pass instead of refusing them.
        const early = MIN_FILL_MS + 500 - (Date.now() - opened);
        if (early > 0) await wait(early);
        const res = await fetch(form.action, {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: bodyOf(form),
          credentials: 'same-origin',
        });
        const answer = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          errors?: Record<string, string>;
          redirect?: string;
          message?: string;
          challenge?: boolean;
        };
        // Tokens of the site's captcha work once.
        if (!answer.ok && config.siteCaptcha) window.cleitextChallenge?.reset(form);
        // The site's protection wants a captcha solved first.
        if (!answer.ok && answer.challenge) window.cleitextChallenge?.require?.(form);
        if (!answer.ok && answer.message && res.status === 403) {
          if (captchaError) captchaError.textContent = answer.message;
          return;
        }
        if (answer.ok) {
          if (config.confirmationType === 'url' && answer.redirect) {
            window.location.assign(answer.redirect);
            return;
          }
          form.style.display = 'none';
          show(success);
          success?.focus?.();
          return;
        }
        if (answer.errors && Object.keys(answer.errors).length) {
          showErrors(form, answer.errors);
          return;
        }
        form.style.display = 'none';
        show(failed);
      } catch {
        form.style.display = 'none';
        show(failed);
      } finally {
        sending = false;
        button?.removeAttribute('aria-busy');
        if (button) button.disabled = false;
        if (captcha?.version === 'v2') window.grecaptcha?.reset(widget);
      }
    })();
  });
}

function start() {
  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-pr-form]')) {
    if (form.dataset.prReady) continue;
    form.dataset.prReady = '1';
    init(form);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

export {};
