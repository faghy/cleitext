import { CSS } from './config';
import { formatMoney } from './model/money';
import type { ReferralStatus } from './model/rules';
import { fill, type Strings } from './model/strings';

/**
 * The affiliate area in the visitor's account (`/account/affiliate`) and the
 * application form, as HTML strings: escaped by default, the same markup
 * as the signup block.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export const esc = (text: unknown) => String(text ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]!);

export const STYLE = `.${CSS}{max-width:46rem}.${CSS} form{display:grid;gap:.9rem;margin:1rem 0}.${CSS} label{display:grid;gap:.3rem;font-weight:600}.${CSS} label.${CSS}-check{display:flex;gap:.5rem;align-items:flex-start;font-weight:400}.${CSS} input[type=text],.${CSS} input[type=email],.${CSS} input[type=url],.${CSS} textarea{font:inherit;padding:.55rem .7rem;border:1px solid #c7ccd4;border-radius:.4rem;font-weight:400}.${CSS} small{font-weight:400;opacity:.75}.${CSS}-button{display:inline-block;font:inherit;font-weight:600;padding:.6rem 1.1rem;border-radius:.4rem;border:0;background:#0f6b8f;color:#fff;text-decoration:none;cursor:pointer}.${CSS}-button.is-plain{background:transparent;color:inherit;border:1px solid currentColor}.${CSS}-error{color:#b42318;font-weight:600}.${CSS}-notice{padding:.75rem 1rem;border-radius:.4rem;background:#eef6f9}.${CSS}-link{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}.${CSS}-link input{flex:1 1 18rem;font:inherit;padding:.55rem .7rem;border:1px solid #c7ccd4;border-radius:.4rem}.${CSS}-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.75rem;margin:1rem 0}.${CSS}-stat{padding:.8rem 1rem;border:1px solid #e3e6ea;border-radius:.5rem}.${CSS}-stat b{display:block;font-size:1.35rem}.${CSS} table{width:100%;border-collapse:collapse;font-size:.95em}.${CSS} th,.${CSS} td{text-align:left;padding:.45rem .4rem;border-bottom:1px solid #e3e6ea}.${CSS} td.num,.${CSS} th.num{text-align:right}.${CSS}-cta{padding:1.25rem 1.5rem;border-radius:.75rem;background:#f3f7f9}.${CSS}-cta h2,.${CSS}-cta h3{margin-top:0}`;

const COPY_SCRIPT = `<script>document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-${CSS}-copy]');if(!b)return;var i=document.getElementById(b.getAttribute('data-${CSS}-copy'));if(!i)return;var done=function(){var t=b.textContent;b.textContent=b.getAttribute('data-copied')||t;setTimeout(function(){b.textContent=t;},1500);};if(navigator.clipboard)navigator.clipboard.writeText(i.value).then(done,function(){i.select();});else{i.select();try{document.execCommand('copy');done();}catch(x){}}});</script>`;

export interface ApplyFormView {
  action: string;
  termsUrl: string;
  values?: Record<string, string>;
  error?: string;
  /** Inside a block: a heading level below the page's. */
  heading?: string;
}

/** The application form (signed-in visitors who are not affiliates yet). */
export function applyForm(s: Strings, view: ApplyFormView): string {
  const v = view.values ?? {};
  const terms = view.termsUrl
    ? `<a href="${esc(view.termsUrl)}" target="_blank" rel="noopener">${esc(s.termsLink)}</a>`
    : esc(s.termsPlain);
  return `${view.heading ? `<h3>${esc(view.heading)}</h3>` : ''}${
    view.error ? `<p class="${CSS}-error" role="alert">${esc(view.error)}</p>` : ''
  }<form method="post" action="${esc(view.action)}">
<label>${esc(s.wantedCode)}<input type="text" name="code" maxlength="32" pattern="[a-z0-9-]*" value="${esc(v.code)}"><small>${esc(s.wantedCodeHelp)}</small></label>
<label>${esc(s.website)}<input type="url" name="website" maxlength="300" value="${esc(v.website)}"></label>
<label>${esc(s.promotion)}<textarea name="promotion" rows="3" maxlength="1000">${esc(v.promotion)}</textarea></label>
<label>${esc(s.paypal)}<input type="email" name="paypal" maxlength="200" value="${esc(v.paypal)}"></label>
<label>${esc(s.iban)}<input type="text" name="iban" maxlength="40" value="${esc(v.iban)}"><small>${esc(s.payoutHelp)}</small></label>
<label class="${CSS}-check"><input type="checkbox" name="terms" value="1" required> <span>${fill(esc(s.terms), { terms })}</span></label>
<p><button type="submit" class="${CSS}-button">${esc(s.applyButton)}</button></p>
</form>`;
}

/** Guests: sign in or create an account first, then come back. */
export function signInFirst(s: Strings, links: { login: string; register: string | null }): string {
  return `<p>${esc(s.signInFirst)}</p><p class="${CSS}-link"><a class="${CSS}-button" href="${esc(links.login)}">${esc(s.signIn)}</a>${
    links.register
      ? ` <a class="${CSS}-button is-plain" href="${esc(links.register)}">${esc(s.createAccount)}</a>`
      : ''
  }</p>`;
}

export interface DashboardView {
  name: string;
  link: string;
  cookieDays: number;
  refundDays: number;
  locale: string;
  visits: number;
  conversions: number;
  /** By currency. */
  totals: Record<string, { pending: number; approved: number; paid: number }>;
  currency: string;
  latest: {
    createdAt: Date;
    label: string;
    kind: 'conversion' | 'adjustment';
    status: ReferralStatus;
    amountCents: number;
    currency: string;
  }[];
  payouts: { paidAt: Date; amountCents: number; currency: string; note: string }[];
  paypalEmail: string;
  iban: string;
  payoutAction: string;
  termsUrl: string;
  minPayout: string;
  saved: boolean;
  error?: string;
}

const statusText = (s: Strings, status: ReferralStatus) =>
  ({
    pending: s.statusPending,
    approved: s.statusApproved,
    paid: s.statusPaid,
    rejected: s.statusRejected,
  })[status];

/** The affiliate area of an active affiliate. */
export function dashboard(s: Strings, view: DashboardView): string {
  const money = (cents: number, currency: string) => formatMoney(cents, currency, view.locale);
  const date = (d: Date) => d.toLocaleDateString(view.locale || 'en', { dateStyle: 'medium' });
  const currencies = Object.keys(view.totals).length ? Object.keys(view.totals) : [view.currency];
  const sum = (key: 'pending' | 'approved' | 'paid') =>
    currencies.map((c) => money(view.totals[c]?.[key] ?? 0, c)).join(' · ');
  const rows = view.latest
    .map(
      (r) =>
        `<tr><td>${esc(date(r.createdAt))}</td><td>${esc(r.kind === 'adjustment' ? `${s.adjustment} · ${r.label}` : r.label)}</td><td>${esc(statusText(s, r.status))}</td><td class="num">${esc(money(r.amountCents, r.currency))}</td></tr>`,
    )
    .join('');
  const paid = view.payouts
    .map(
      (p) =>
        `<tr><td>${esc(date(p.paidAt))}</td><td>${esc(p.note)}</td><td class="num">${esc(money(p.amountCents, p.currency))}</td></tr>`,
    )
    .join('');
  return `<p><strong>${esc(fill(s.welcome, { name: view.name }))}</strong></p>
<h2>${esc(s.yourLink)}</h2>
<div class="${CSS}-link"><input id="${CSS}-link" type="text" readonly value="${esc(view.link)}" aria-label="${esc(s.yourLink)}"><button type="button" class="${CSS}-button" data-${CSS}-copy="${CSS}-link" data-copied="${esc(s.copied)}">${esc(s.copy)}</button></div>
<p><small>${esc(fill(s.linkHelp, { days: view.cookieDays }))}</small></p>
<div class="${CSS}-stats">
<div class="${CSS}-stat">${esc(s.visits)}<b>${view.visits}</b></div>
<div class="${CSS}-stat">${esc(s.conversions)}<b>${view.conversions}</b></div>
<div class="${CSS}-stat">${esc(s.pendingEarnings)}<b>${esc(sum('pending'))}</b></div>
<div class="${CSS}-stat">${esc(s.approvedEarnings)}<b>${esc(sum('approved'))}</b></div>
<div class="${CSS}-stat">${esc(s.paidEarnings)}<b>${esc(sum('paid'))}</b></div>
</div>
<p><small>${esc(fill(s.pendingHelp, { days: view.refundDays }))}${
    view.minPayout ? ` ${esc(fill(s.minPayout, { amount: view.minPayout }))}` : ''
  }</small></p>
<h2>${esc(s.latest)}</h2>
${
  rows
    ? `<table><thead><tr><th scope="col">${esc(s.date)}</th><th scope="col">${esc(s.what)}</th><th scope="col">${esc(s.status)}</th><th scope="col" class="num">${esc(s.commission)}</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p>${esc(s.none)}</p>`
}
<h2>${esc(s.payouts)}</h2>
${paid ? `<table><tbody>${paid}</tbody></table>` : `<p>${esc(s.payoutsNone)}</p>`}
<h2 id="payout">${esc(s.payoutTitle)}</h2>
${view.saved ? `<p class="${CSS}-notice" role="status">${esc(s.saved)}</p>` : ''}${
    view.error ? `<p class="${CSS}-error" role="alert">${esc(view.error)}</p>` : ''
  }
<form method="post" action="${esc(view.payoutAction)}">
<label>${esc(s.paypal)}<input type="email" name="paypal" maxlength="200" value="${esc(view.paypalEmail)}"></label>
<label>${esc(s.iban)}<input type="text" name="iban" maxlength="40" value="${esc(view.iban)}"></label>
<p><button type="submit" class="${CSS}-button">${esc(s.save)}</button></p>
</form>
${view.termsUrl ? `<p><a href="${esc(view.termsUrl)}">${esc(s.programTerms)}</a></p>` : ''}
${COPY_SCRIPT}`;
}

/** The page around the content, with its style and the way back to the account. */
export function accountPage(s: Strings, back: string, content: string): string {
  return `<style>${STYLE}</style><div class="${CSS}"><p><a href="${esc(back)}">← ${esc(s.back)}</a></p>${content}</div>`;
}
