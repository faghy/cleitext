import { useT } from '@cleitext/admin-sdk';
import type { AuditEntryView } from '@cleitext/shared';
import { ACTION_LABELS } from '../activity';

/** Description of an action: `action.<code>` in the dictionary, English otherwise. */
function actionText(t: (text: string) => string, code: string): string {
  const key = `action.${code}`;
  const translated = t(key);
  return translated === key ? (ACTION_LABELS[code] ?? code) : translated;
}

/** Lines of the activity log: who did what, when. */
export function ActivityList({
  items,
  showIp = false,
}: {
  items: AuditEntryView[];
  showIp?: boolean;
}) {
  const { t, language } = useT();
  if (items.length === 0)
    return <p className="text-sm text-slate-600">{t('Nothing has happened yet.')}</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
        >
          <span>
            <strong>{item.user?.displayName ?? t('Someone')}</strong> {actionText(t, item.action)}
            {item.targetLabel && <> “{item.targetLabel}”</>}
          </span>
          <span className="text-xs text-slate-500">
            {new Date(item.createdAt).toLocaleString(language, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            {showIp && item.ip && ` · ${item.ip}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
