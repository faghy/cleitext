/** Prisma taxonomy list: the dropdown opens the chosen term's page. */

function initTaxonomyLists(): void {
  document
    .querySelectorAll<HTMLSelectElement>('select[data-pr-taxonomy-list]')
    .forEach((select) => {
      select.addEventListener('change', () => {
        const url = select.value;
        // Only addresses of the site or http(s) ones.
        if (url && /^(https?:\/\/|\/(?!\/))/.test(url)) window.location.href = url;
      });
    });
}

if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', initTaxonomyLists);
else initTaxonomyLists();

export {};
