import { label } from './_label';

// Marks the event lists as ready (bundled with its import).
for (const list of document.querySelectorAll<HTMLElement>('.events')) {
  list.dataset.ready = label('yes');
}
