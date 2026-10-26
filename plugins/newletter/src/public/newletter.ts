/**
 * The signup form, sent in place: the same POST as without JavaScript, with
 * `Accept: application/json`; the outcome is read out in the form's live
 * region, wrong fields are marked and focused. Without this script the form
 * still works (a POST, then back to the page).
 */
import { CSS, MARKER } from '../config';

interface Challenge {
  prepare?(form: HTMLFormElement): Promise<void> | void;
  reset?(form: HTMLFormElement): void;
  require?(form: HTMLFormElement): void;
}

interface Answer {
  outcome?: string;
  message?: string;
  fields?: string[];
  challenge?: boolean;
}

const GOOD = new Set(['success', 'pending', 'already']);

function setup(root: HTMLElement): void {
  const form = root.querySelector('form');
  const live = root.querySelector<HTMLElement>(`.${CSS}__live`);
  if (!form || !live || form.dataset.ready) return;
  form.dataset.ready = '1';
  let config: { sending?: string } = {};
  try {
    config = JSON.parse(root.getAttribute(MARKER) ?? '{}') as typeof config;
  } catch {
    // keep the defaults
  }
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const challenge = () =>
    (window as unknown as { cleitextChallenge?: Challenge }).cleitextChallenge;

  const show = (outcome: string, message: string) => {
    for (const el of root.querySelectorAll<HTMLElement>(`.${CSS}__msg`)) {
      el.classList.remove('is-shown');
      el.removeAttribute('aria-hidden');
    }
    const target = document.getElementById(`${root.id}-${outcome}`);
    if (target) {
      if (message) target.textContent = message;
      target.classList.add('is-shown');
      // Read out once, by the live region.
      target.setAttribute('aria-hidden', 'true');
    }
    live.textContent = message || target?.textContent || '';
    if (GOOD.has(outcome)) {
      root.setAttribute('data-sent', outcome);
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async () => {
      for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
      const label = button?.textContent ?? '';
      if (button) {
        button.disabled = true;
        if (config.sending) button.textContent = config.sending;
      }
      try {
        await challenge()?.prepare?.(form);
        const data = new URLSearchParams();
        for (const [k, v] of new FormData(form)) if (typeof v === 'string') data.append(k, v);
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { accept: 'application/json' },
          body: data,
          credentials: 'same-origin',
        });
        const answer = (await res.json().catch(() => ({}))) as Answer;
        const outcome = answer.outcome ?? 'error';
        show(outcome, answer.message ?? '');
        if (!GOOD.has(outcome)) {
          const first = (answer.fields ?? [])
            .map((name) =>
              form.querySelector<HTMLInputElement>(`[name="${name.replace(/[^\w.-]/g, '')}"]`),
            )
            .filter((el): el is HTMLInputElement => Boolean(el));
          for (const el of first) el.setAttribute('aria-invalid', 'true');
          first[0]?.focus();
          if (answer.challenge) challenge()?.require?.(form);
          else challenge()?.reset?.(form);
        }
      } catch {
        show('error', '');
        challenge()?.reset?.(form);
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = label;
        }
      }
    })();
  });
}

function start(): void {
  for (const root of document.querySelectorAll<HTMLElement>(`[${MARKER}]`)) setup(root);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
