/**
 * Runs in the Customize preview (a sandboxed frame without an origin): a
 * pencil on the parts of the page a theme marks with `data-customize`
 * opens their settings, and links change the page shown instead of
 * leaving it. Talks to the admin with postMessage only.
 */
export const PREVIEW_SCRIPT = `(() => {
  const post = (message) => parent.postMessage(message, '*');
  const site = new URL(document.baseURI).origin;
  const pencil = document.createElement('button');
  pencil.type = 'button';
  pencil.setAttribute('aria-label', 'Edit');
  pencil.textContent = '\\u270E';
  pencil.style.cssText =
    'position:absolute;z-index:2147483647;display:none;width:26px;height:26px;padding:0;border:0;border-radius:50%;background:#0284c7;color:#fff;font:15px/26px sans-serif;text-align:center;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.3)';
  let target = null;
  const show = (element) => {
    target = element;
    const box = element.getBoundingClientRect();
    pencil.style.left = Math.max(0, box.left + scrollX - 4) + 'px';
    pencil.style.top = Math.max(0, box.top + scrollY - 4) + 'px';
    pencil.style.display = 'block';
  };
  addEventListener('DOMContentLoaded', () => document.body.append(pencil));
  document.addEventListener('mouseover', (event) => {
    if (event.target === pencil) return;
    const element = event.target.closest && event.target.closest('[data-customize]');
    if (element) show(element);
  });
  document.addEventListener(
    'click',
    (event) => {
      if (event.target === pencil) {
        event.preventDefault();
        if (target) post({ type: 'cleitext:customize', section: target.dataset.customize });
        return;
      }
      const link = event.target.closest && event.target.closest('a[href]');
      if (!link || link.getAttribute('href').startsWith('#')) return;
      event.preventDefault();
      const url = new URL(link.href, document.baseURI);
      if (url.origin === site) post({ type: 'cleitext:navigate', path: url.pathname + url.search });
    },
    true,
  );
})();
`;
