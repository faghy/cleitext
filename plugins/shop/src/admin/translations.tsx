import { useT, type AdminPageProps } from '@cleitext/admin-sdk';
import type { Texts } from '../texts';

export type Site = AdminPageProps['site'];

export interface TextField {
  key: string;
  label: string;
  /** The text in the site's main language, shown as a hint. */
  original: string;
  multiline?: boolean;
  maxLength?: number;
}

/**
 * The texts of an item in the site's other languages, folded under
 * "Translations" (nothing on sites with one language). An empty field shows
 * the main language's text, or the default in the customer's language.
 */
export function Translations({
  site,
  value,
  fields,
  onChange,
}: {
  site: Site;
  value: Texts | undefined;
  fields: TextField[];
  onChange: (next: Texts) => void;
}) {
  const { t } = useT();
  const others = site.locales.filter((l) => l.code !== site.defaultLocale);
  if (others.length === 0 || fields.length === 0) return null;
  const texts = value ?? {};
  const done = others.filter((l) => fields.some((f) => texts[l.code]?.[f.key])).length;
  const set = (locale: string, key: string, text: string) => {
    const fieldsOf = { ...(texts[locale] ?? {}), [key]: text };
    if (!text) delete fieldsOf[key];
    const next = { ...texts, [locale]: fieldsOf };
    if (Object.keys(fieldsOf).length === 0) delete next[locale];
    onChange(next);
  };
  return (
    <details className="sh-translations">
      <summary>
        {t('Translations')}
        {done > 0 && (
          <span className="sh-small sh-muted">
            {' '}
            ({done}/{others.length})
          </span>
        )}
      </summary>
      {others.map((locale) => (
        <fieldset key={locale.code} className="sh-stack">
          <legend>{locale.name}</legend>
          {fields.map((field) => {
            const props = {
              value: texts[locale.code]?.[field.key] ?? '',
              placeholder: field.original,
              maxLength: field.maxLength ?? 2000,
              lang: locale.code,
              onChange: (e: { target: { value: string } }) =>
                set(locale.code, field.key, e.target.value),
            };
            return (
              <label key={field.key} className="sh-field">
                <span>{field.label}</span>
                {field.multiline ? (
                  <textarea rows={2} {...props} />
                ) : (
                  <input type="text" {...props} />
                )}
              </label>
            );
          })}
        </fieldset>
      ))}
      <small className="sh-muted">
        {t('Empty: the text in the main language, or the default in the customer’s language.')}
      </small>
    </details>
  );
}
