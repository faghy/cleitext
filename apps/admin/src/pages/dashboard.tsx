import { useMe } from '../auth';
import { Card } from '../components/ui';
import { SECTIONS } from '../navigation';

export function DashboardPage() {
  const me = useMe();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={`Welcome, ${me.user.displayName}`}>
          <p className="text-sm text-slate-600">
            You are signed in to <strong>{me.site.name}</strong>
            {me.role ? ` as ${me.role.name}` : me.user.isSuperAdmin ? ' as super admin' : ''}.
          </p>
          {me.sites.length > 1 && (
            <p className="mt-2 text-sm text-slate-600">
              You also have access to {me.sites.length - 1} other site
              {me.sites.length > 2 ? 's' : ''}.
            </p>
          )}
        </Card>
        <Card title="Getting started">
          <p className="text-sm text-slate-600">
            Content, media and themes arrive in the next milestones.
          </p>
        </Card>
      </div>
    </div>
  );
}

/** Sections planned for later milestones. */
export function PlaceholderPage({ path }: { path: string }) {
  const section = SECTIONS.find((s) => s.to === path);
  return (
    <div>
      <h1 className="text-2xl font-semibold">{section?.label ?? 'Not found'}</h1>
      <p className="mt-2 text-slate-600">This section is not available yet.</p>
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="mt-2 text-slate-600">You do not have permission to open this page.</p>
    </div>
  );
}
