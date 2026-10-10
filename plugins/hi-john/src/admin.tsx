import { defineAdminPlugin } from '@cleitext/admin-sdk';

/**
 * Hi John: the Hello Dolly of Cleitext. A dashboard widget with a line by John
 * Lennon, and the smallest example of a plugin: one admin entry, no server code,
 * no permissions.
 */
const QUOTE = 'Life is what happens to you while you’re busy making other plans.';
const SOURCE = '“Beautiful Boy (Darling Boy)”, 1980';

function HiJohn() {
  return (
    <figure className="space-y-2">
      <blockquote className="border-l-4 border-sky-600 pl-4 text-lg text-slate-800 italic">
        {QUOTE}
      </blockquote>
      <figcaption className="text-sm text-slate-600">
        John Lennon, <cite>{SOURCE}</cite>
      </figcaption>
    </figure>
  );
}

export default defineAdminPlugin({
  dashboardWidgets: [{ id: 'hi-john', title: { en: 'Hi John', it: 'Hi John' }, component: HiJohn }],
});
