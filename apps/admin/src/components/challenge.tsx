import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../api';

/**
 * A plugin's bot protection of the admin's sign-in forms (plugin API 1.38),
 * e.g. the Captcha plugin's Turnstile: the server gives the widget's markup
 * (`GET /auth/challenge`), shown before the submit button; its fields go
 * with the request.
 */

/** The admin's sign-in forms a plugin can protect. */
export type AdminForm =
  'core/admin-login' | 'core/admin-lost-password' | 'core/admin-reset-password';

interface ChallengeApi {
  prepare(form: HTMLFormElement): Promise<void>;
  reset(form: HTMLFormElement): void;
  render(root?: ParentNode): void;
}
const challengeApi = () =>
  (window as unknown as { cleitextChallenge?: ChallengeApi }).cleitextChallenge;

/** The check could not be completed in the browser (its message is shown by the widget). */
export class ChallengeError extends Error {}

export function useChallenge(form: AdminForm) {
  const query = useQuery({
    queryKey: ['auth', 'challenge', form],
    queryFn: () => api<{ html: string }>('GET', `/auth/challenge?form=${encodeURIComponent(form)}`),
    staleTime: Infinity,
    retry: false,
  });
  const ref = useRef<HTMLFormElement>(null);
  const html = query.data?.html ?? '';
  return {
    formRef: ref,
    html,
    /** The challenge's fields (tokens), after asking for them when needed. */
    async fields(): Promise<Record<string, string>> {
      const element = ref.current;
      if (!html || !element) return {};
      try {
        await challengeApi()?.prepare(element);
      } catch {
        throw new ChallengeError('challenge');
      }
      const out: Record<string, string> = {};
      element
        .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          '[data-cx-challenge] input[name], [data-cx-challenge] textarea[name]',
        )
        .forEach((field) => {
          if (field.value) out[field.name] = field.value;
        });
      return out;
    },
    /** Tokens work once: a new one after a refused attempt. */
    reset() {
      if (ref.current) challengeApi()?.reset(ref.current);
    },
  };
}

/** The widget's markup, with its scripts run (added with innerHTML, they would not). */
export function Challenge({ html }: { html: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = box.current;
    if (!element || !html) return;
    element.innerHTML = html;
    element.querySelectorAll('script').forEach((old) => {
      const script = document.createElement('script');
      for (const { name, value } of [...old.attributes]) script.setAttribute(name, value);
      // The admin's Content Security Policy runs only scripts from files.
      old.replaceWith(script);
    });
    challengeApi()?.render(element);
    return () => {
      element.innerHTML = '';
    };
  }, [html]);
  return html ? <div ref={box} data-cx-challenge="" /> : null;
}
