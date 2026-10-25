/**
 * Multilingual's dropdown switchers (a `<details>`): closed by Escape, by a
 * click elsewhere and when focus leaves them. They work without it too.
 */
const OPEN = '.ml-switcher__dropdown[open]';

function close(except?: Element | null): void {
  for (const details of document.querySelectorAll<HTMLDetailsElement>(OPEN)) {
    if (details !== except) details.open = false;
  }
}

document.addEventListener('click', (event) => {
  close((event.target as Element | null)?.closest('.ml-switcher__dropdown'));
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const open = (event.target as Element | null)?.closest<HTMLDetailsElement>(OPEN);
  close();
  open?.querySelector('summary')?.focus();
});

document.addEventListener('focusout', (event) => {
  const details = (event.target as Element | null)?.closest<HTMLDetailsElement>(OPEN);
  const next = event.relatedTarget as Node | null;
  if (details && next && !details.contains(next)) details.open = false;
});
