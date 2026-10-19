import { Link } from '@tanstack/react-router';
import { useMe } from '../auth';
import { Card, useT } from '../components/ui';
import { MenuIcon } from '../components/menu-icons';
import { childSections } from '../navigation';

/** What each tool is for, in a line (Tools page, as in WordPress). */
const DESCRIPTIONS: Record<string, string> = {
  '/redirects':
    'Send old addresses to new ones (301), and see the addresses visitors did not find.',
  '/structure': 'Content types and taxonomies of the site, with their fields and addresses.',
  '/activity': 'Who did what on the site: logins, changes, publications and settings.',
  '/system': 'The server, the database, the background tasks and what Cleitext needs to run well.',
  '/sites': 'The sites of this installation, their addresses and their administrators.',
};

export function ToolsPage() {
  const me = useMe();
  const { t } = useT();
  const tools = childSections('/tools', me.capabilities);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('Tools')}</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {tools.map((tool) => (
          <Card key={tool.to} title={t(tool.label)}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-slate-500">
                <MenuIcon path={tool.icon} />
              </span>
              <div className="space-y-2">
                <p className="text-sm text-slate-600">{t(DESCRIPTIONS[tool.to] ?? '')}</p>
                <Link to={tool.to} className="text-sm font-medium text-sky-800 underline">
                  {t('Open')}
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
