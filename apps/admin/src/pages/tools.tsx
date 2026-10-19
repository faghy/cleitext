import { Link } from '@tanstack/react-router';
import { useMe } from '../auth';
import { Card, useT } from '../components/ui';
import { labelText } from '@cleitext/shared';
import { MenuIcon, pluginIcon } from '../components/menu-icons';
import { childSections } from '../navigation';
import { pagePath, usePluginAdmin } from '../plugins';

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
  const core = childSections('/tools', me.capabilities).map((section) => ({
    to: section.to,
    label: t(section.label),
    icon: section.icon,
    description: t(DESCRIPTIONS[section.to] ?? ''),
  }));
  // Pages that plugins put under Tools (plugin API 1.26), after the core's.
  const added = usePluginAdmin().flatMap((plugin) =>
    (plugin.definition?.pages ?? [])
      .filter(
        (page) =>
          page.parent === '/tools' &&
          page.menu !== false &&
          (!page.capability || me.capabilities.includes(page.capability)),
      )
      .map((page) => ({
        to: page.link ?? pagePath(plugin.slug, page.path),
        label: labelText(page.title, me.user.locale),
        icon: pluginIcon(page.icon),
        description: page.description ? labelText(page.description, me.user.locale) : '',
      })),
  );
  const tools = [...core, ...added];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('Tools')}</h1>
      <div className="grid gap-4 md:grid-cols-2">
        {tools.map((tool) => (
          <Card key={tool.to} title={tool.label}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-slate-500">
                <MenuIcon path={tool.icon} />
              </span>
              <div className="space-y-2">
                {tool.description && <p className="text-sm text-slate-600">{tool.description}</p>}
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
