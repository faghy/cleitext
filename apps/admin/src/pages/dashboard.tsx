import { useMe } from '../auth';
import { Card, useT } from '../components/ui';
import { SECTIONS } from '../navigation';

export function DashboardPage() {
  const me = useMe();
  const { t } = useT();
  const signedIn = me.role
    ? t('You are signed in to {site} as {role}.', { role: me.role.name })
    : me.user.isSuperAdmin
      ? t('You are signed in to {site} as super admin.')
      : t('You are signed in to {site}.');
  const [signedInBefore, signedInAfter] = signedIn.split('{site}');
  const otherSites = me.sites.length - 1;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('Dashboard')}</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t('Welcome, {name}', { name: me.user.displayName })}>
          <p className="text-sm text-slate-600">
            {signedInBefore}
            <strong>{me.site.name}</strong>
            {signedInAfter}
          </p>
          {me.sites.length > 1 && (
            <p className="mt-2 text-sm text-slate-600">
              {otherSites === 1
                ? t('You also have access to 1 other site.')
                : t('You also have access to {count} other sites.', { count: otherSites })}
            </p>
          )}
        </Card>
        <Card title={t('Getting started')}>
          <p className="text-sm text-slate-600">
            {t('Content, media and themes arrive in the next milestones.')}
          </p>
        </Card>
      </div>
    </div>
  );
}

/** Sections planned for later milestones. */
export function PlaceholderPage({ path }: { path: string }) {
  const { t } = useT();
  const section = SECTIONS.find((s) => s.to === path);
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t(section?.label ?? 'Not found')}</h1>
      <p className="mt-2 text-slate-600">{t('This section is not available yet.')}</p>
    </div>
  );
}

export function ForbiddenPage() {
  const { t } = useT();
  return (
    <div>
      <h1 className="text-2xl font-semibold">{t('Access denied')}</h1>
      <p className="mt-2 text-slate-600">{t('You do not have permission to open this page.')}</p>
    </div>
  );
}
