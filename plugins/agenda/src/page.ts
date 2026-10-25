/**
 * The appointment's own page, reached from the links of the emails without
 * an account: what, when and its status, a button to cancel it and the
 * calendar to move it (the booking widget in "move" mode), within the
 * notice the site asks for. Shown inside the theme, never cached.
 */
import { MARKER, PUBLIC_BASE } from './config';
import { serviceText } from './model/normalize';
import type { Strings } from './model/strings';
import { formatWhen } from './model/time';
import type { Appointment, Service, Settings } from './model/types';
import type { WidgetConfig } from './render';

export const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export interface PageInput {
  appointment: Appointment;
  service: Service;
  settings: Settings;
  strings: Strings;
  locale: string;
  timeZone: string;
  token: string;
  /** Changes are still allowed (before the notice). */
  canChange: boolean;
  done?: string;
  widget: WidgetConfig;
}

export function appointmentPage(input: PageInput): string {
  const { appointment: a, strings: s, settings } = input;
  const t = serviceText(input.service, input.locale);
  const when = formatWhen(Date.parse(a.start), input.timeZone, input.locale);
  const holding = a.status === 'confirmed' || a.status === 'pending';
  const future = Date.parse(a.start) > Date.now();
  const status = s[`status_${a.status}` as keyof Strings] ?? a.status;
  const notice =
    input.done === 'cancelled' ? s.cancelled : input.done === 'moved' ? s.rescheduled : '';
  const parts: string[] = [];
  if (notice) parts.push(`<p class="ag-done" role="status">${escapeHtml(notice)}</p>`);
  parts.push(
    `<dl><dt>${escapeHtml(s.what)}</dt><dd>${escapeHtml(t.name)}</dd>` +
      `<dt>${escapeHtml(s.when)}</dt><dd>${escapeHtml(when.date)}, ${escapeHtml(when.time)} <small>(${escapeHtml(input.timeZone.replace(/_/g, ' '))})</small></dd>` +
      `<dt>${escapeHtml(s.statusLabel)}</dt><dd><span class="ag-status">${escapeHtml(status)}</span></dd></dl>`,
  );
  if (holding && future) {
    parts.push(
      `<p><a class="ag-button" href="${PUBLIC_BASE}/appointment.ics?t=${escapeHtml(input.token)}" download="appointment.ics">${escapeHtml(s.downloadIcs)}</a></p>`,
    );
    if (!input.canChange) {
      parts.push(`<p class="ag-note">${escapeHtml(s.tooLate)}</p>`);
      if (settings.contact)
        parts.push(`<p>${escapeHtml(settings.contact).replace(/\r?\n/g, '<br>')}</p>`);
    } else {
      if (settings.allowReschedule && a.status === 'confirmed') {
        const config = escapeHtml(JSON.stringify(input.widget));
        parts.push(
          `<h2>${escapeHtml(s.reschedule)}</h2>` +
            `<div class="ag" ${MARKER}="${config}"><p class="ag-sr" aria-live="polite" data-ag-live=""></p>` +
            `<section class="ag-step" data-ag-step="time"><div class="ag-summary" data-ag-summary=""></div>` +
            `<h3 class="ag-step-title" tabindex="-1">${escapeHtml(s.chooseDay)}</h3>` +
            `<div class="ag-calendar" data-ag-calendar=""><p class="ag-note">${escapeHtml(s.loading)}</p></div>` +
            `<noscript><p class="ag-note">${escapeHtml(s.noscript)}</p></noscript></section>` +
            `<section class="ag-step" data-ag-step="done" hidden tabindex="-1"></section></div>`,
        );
      }
      if (settings.allowCancel) {
        parts.push(
          `<form method="post" action="${PUBLIC_BASE}/appointment">` +
            `<input type="hidden" name="t" value="${escapeHtml(input.token)}">` +
            `<input type="hidden" name="action" value="cancel">` +
            `<details><summary class="ag-link">${escapeHtml(s.cancel)}</summary>` +
            `<p><button type="submit" class="ag-primary">${escapeHtml(s.cancelConfirm)}</button></p></details></form>`,
        );
      }
    }
  }
  return `<div class="ag ag-appointment">${parts.join('')}</div>`;
}

export function invalidLinkPage(s: Strings): string {
  return `<div class="ag ag-appointment"><p class="ag-note">${escapeHtml(s.linkInvalid)}</p></div>`;
}
