import { useMe } from '../auth';
import { useT } from './ui';

/**
 * The bio, and on sites with more languages one more for each other
 * language (core 0.118): pages in that language show it, else the main one.
 */
export function BioFields({
  bio,
  bios,
  onChange,
  help,
}: {
  bio: string;
  bios: Record<string, string>;
  onChange: (bio: string, bios: Record<string, string>) => void;
  help?: string;
}) {
  const { t } = useT();
  const me = useMe();
  const main = me.site.locales.find((l) => l.code === me.site.defaultLocale);
  const others = me.site.locales.filter((l) => l.code !== me.site.defaultLocale);
  const area = 'w-full rounded border border-slate-300 p-2';
  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span className="block font-medium text-slate-800">
          {t('Biographical info')}
          {others.length > 0 && main ? ` (${main.name})` : ''}
        </span>
        <textarea
          className={area}
          rows={4}
          maxLength={2000}
          value={bio}
          onChange={(e) => onChange(e.target.value, bios)}
        />
        {help && <span className="block text-xs text-slate-500">{help}</span>}
      </label>
      {others.map((locale) => (
        <label key={locale.code} className="block space-y-1 text-sm">
          <span className="block font-medium text-slate-800">
            {t('Biographical info')} ({locale.name})
          </span>
          <textarea
            className={area}
            rows={4}
            maxLength={2000}
            lang={locale.code}
            value={bios[locale.code] ?? ''}
            onChange={(e) => onChange(bio, { ...bios, [locale.code]: e.target.value })}
          />
          <span className="block text-xs text-slate-500">
            {t('Empty: pages in this language show the main one.')}
          </span>
        </label>
      ))}
    </div>
  );
}
