/**
 * Newsletter forms embedded from email-marketing services (since 1.30.0):
 * Brevo (sibforms.com), Mailchimp (list-manage.com), MailerLite, Kit
 * (ConvertKit) and ActiveCampaign forms pasted in HTML blocks or in the
 * classic editor. HTML blocks never reach the `import.block` filter, so the
 * ones holding such a form become `core/imported` placeholders named
 * `core/html`: an active newsletter plugin turns them into its signup form,
 * and without one the core keeps the original HTML block (its `fallback`).
 * In classic content the form or iframe would be lost (forms are dropped,
 * iframes become links), so it is first marked as an HTML block.
 */
import { IMPORTED_BLOCK } from '@cleitext/blocks/html';
import type { CxdBlock } from '@cleitext/blocks';

/** The services, by the hosts their forms post to or load from. */
const SERVICES: [string, RegExp][] = [
  ['Brevo', /\bsibforms\.com\b|\bsib-form\b/i],
  ['Mailchimp', /\blist-manage\.com\b/i],
  ['MailerLite', /\bmailerlite\.com\b|\bml-embedded\b|\bml-form-embed/i],
  ['Kit', /\bconvertkit\.com\b|\bkit\.com\/forms\b|\.ck\.page\b|\bdata-sv-form\b/i],
  ['ActiveCampaign', /\bactivehosted\.com\b/i],
];

/** Something that shows the form, not a mere link to it. */
const FORM_MARKUP = /<(?:form|iframe)\b|class=["'][^"']*\bml-embedded\b|data-sv-form/i;

/** The service whose form the HTML embeds, or null. */
export function newsletterEmbed(html: string): string | null {
  if (!FORM_MARKUP.test(html)) return null;
  for (const [name, test] of SERVICES) if (test.test(html)) return name;
  return null;
}

/**
 * HTML blocks (at any depth) holding a newsletter form, as placeholders
 * for plugins; `found` counts them by service. Returns the same array when
 * nothing changed.
 */
export function markNewsletterEmbeds(blocks: CxdBlock[], found: Map<string, number>): CxdBlock[] {
  let changed = false;
  const out = blocks.map((block) => {
    if (block.type === 'core/html' && typeof block.attrs.content === 'string') {
      const service = newsletterEmbed(block.attrs.content);
      if (service) {
        changed = true;
        found.set(service, (found.get(service) ?? 0) + 1);
        return {
          id: block.id,
          type: IMPORTED_BLOCK,
          v: 1,
          attrs: {
            name: 'core/html',
            attrs: { content: block.attrs.content },
            html: block.attrs.content,
            fallback: [block],
          },
        } satisfies CxdBlock;
      }
    }
    if (block.children?.length) {
      const children = markNewsletterEmbeds(block.children, found);
      if (children !== block.children) {
        changed = true;
        return { ...block, children };
      }
    }
    return block;
  });
  return changed ? out : blocks;
}

const EMBED_ELEMENTS =
  /<form\b[^>]*>[\s\S]*?<\/form\s*>|<iframe\b[^>]*>(?:[\s\S]*?<\/iframe\s*>)?/gi;

/**
 * Classic content (no block markup): each newsletter form or iframe is
 * wrapped as an HTML block, so the conversion keeps it as one.
 */
export function wrapClassicEmbeds(content: string): string {
  if (content.includes('<!-- wp:') || !FORM_MARKUP.test(content)) return content;
  return content.replace(EMBED_ELEMENTS, (element) =>
    newsletterEmbed(element) ? `\n<!-- wp:html -->${element}<!-- /wp:html -->\n` : element,
  );
}

/** The report's line, or null when there were none. */
export function newsletterEmbedsWarning(found: Map<string, number>): string | null {
  if (found.size === 0) return null;
  const list = [...found].map(([service, n]) => `${service} ${n}×`).join(', ');
  return `Newsletter forms embedded from email services (${list}): with a newsletter plugin active (NewLetter) they become its signup form; otherwise their HTML is kept as it was.`;
}
