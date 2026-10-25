/**
 * Agenda in the admin: the first-run wizard, then the appointments (list and
 * calendar), the services, closures, settings and import; a Dashboard box;
 * Fresco's Booking widget; the Italian texts.
 */
import {
  addMessages,
  adminUrl,
  api,
  defineAdminPlugin,
  useT,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useCallback, useEffect, useState } from 'react';
import { CAPABILITY, NAME, SLUG } from './config';
import { localDate } from './model/time';
import type { Service } from './model/types';
import { agenda, messageOf, type Overview } from './admin/api';
import { Appointments } from './admin/appointments';
import { Closures } from './admin/closures';
import { CALENDAR_ICON, registerFrescoWidget } from './admin/fresco';
import { IT } from './admin/it';
import { ImportTab } from './admin/import';
import { Services } from './admin/services';
import { SettingsTab } from './admin/settings';
import { Counter, Pill, useAgendaCss, usePublicCss } from './admin/ui';
import { Wizard } from './admin/wizard';

addMessages('it', IT);
registerFrescoWidget();

type Tab = 'appointments' | 'services' | 'closures' | 'settings' | 'import';
const TABS: Tab[] = ['appointments', 'services', 'closures', 'settings', 'import'];

function query(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function AgendaPage({ plugin, site }: AdminPageProps) {
  useAgendaCss();
  usePublicCss(plugin.version);
  const { t } = useT();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [tab, setTab] = useState<Tab>(() =>
    TABS.includes(query('tab') as Tab) ? (query('tab') as Tab) : 'appointments',
  );
  const [skipped, setSkipped] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    Promise.all([agenda.overview(), agenda.services(true)])
      .then(([o, s]) => {
        setOverview(o);
        setServices(s);
      })
      .catch((e) => setError(messageOf(e)));
  }, []);
  useEffect(refresh, [refresh]);
  useEffect(() => {
    api<{ user: { email: string } }>('GET', '/auth/me')
      .then((me) => setEmail(me.user.email))
      .catch(() => undefined);
  }, []);
  const go = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    url.searchParams.delete('appointment');
    window.history.replaceState(null, '', url);
  };

  if (error)
    return (
      <p className="agx agx-alert" role="alert">
        {error}
      </p>
    );
  if (!overview) return <p className="agx agx-muted">{t('Loading…')}</p>;
  if (!overview.setupDone && !skipped)
    return (
      <div className="agx">
        <Wizard
          timeZone={overview.timeZone}
          email={email}
          onDone={refresh}
          onSkip={() => {
            setSkipped(true);
            void agenda.saveSettings({ setupDone: true }).then(refresh);
          }}
        />
      </div>
    );

  const labels: Record<Tab, string> = {
    appointments: t('Appointments'),
    services: t('Services'),
    closures: t('Closures'),
    settings: t('Settings'),
    import: t('Import'),
  };
  const active = services.filter((s) => s.status !== 'archived');
  return (
    <div className="agx">
      <div className="agx-head">
        <h1>{NAME.en}</h1>
        <Counter limit={overview.limit} upgradeUrl={overview.upgradeUrl} />
      </div>
      {overview.limit.reached ? (
        <p className="agx-warn" role="status">
          {t(
            'The free version’s bookings are used up: the booking page shows your contacts instead of the calendar. Existing appointments keep working.',
          )}
        </p>
      ) : null}
      {active.length === 0 ? (
        <p className="agx-warn">
          {t('No service yet: add one in Services.')}{' '}
          <button type="button" className="agx-link" onClick={() => go('services')}>
            {t('Add a service')}
          </button>
        </p>
      ) : null}
      <div className="agx-tabs" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="agx-tab"
            aria-selected={tab === id}
            onClick={() => go(id)}
          >
            {labels[id]}
            {id === 'appointments' && overview.pending ? (
              <span className="agx-pill s-pending" style={{ marginLeft: 6 }}>
                {overview.pending}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {tab === 'appointments' ? (
        <Appointments
          services={services}
          timeZone={overview.timeZone}
          onChanged={refresh}
          initial={query('appointment')}
        />
      ) : tab === 'services' ? (
        <Services
          services={active}
          timeZone={overview.timeZone}
          locales={site.locales.map((l) => l.code)}
          defaultLocale={site.defaultLocale}
          phone={overview.phone}
          onChanged={refresh}
        />
      ) : tab === 'closures' ? (
        <Closures services={active} timeZone={overview.timeZone} />
      ) : tab === 'settings' ? (
        <SettingsTab onSaved={refresh} />
      ) : (
        <ImportTab onImported={refresh} />
      )}
    </div>
  );
}

/** The Dashboard box: today, the week, the requests to confirm, the next appointments. */
function DashboardBox() {
  useAgendaCss();
  const { t, language } = useT();
  const [o, setO] = useState<Overview | null>(null);
  useEffect(() => {
    agenda
      .overview()
      .then(setO)
      .catch(() => undefined);
  }, []);
  if (!o) return <p className="agx agx-muted">{t('Loading…')}</p>;
  const lang = language === 'it' ? 'it-IT' : 'en-GB';
  const today = localDate(Date.now(), o.timeZone);
  const fmt = (iso: string) => {
    const ms = Date.parse(iso);
    const time = new Intl.DateTimeFormat(lang, {
      timeZone: o.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(ms));
    return localDate(ms, o.timeZone) === today
      ? `${t('Today')} ${time}`
      : `${new Intl.DateTimeFormat(lang, { timeZone: o.timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ms))} ${time}`;
  };
  return (
    <div className="agx agx-grid">
      <div className="agx-row" style={{ gap: '1.25rem' }}>
        <span>
          <strong style={{ fontSize: '1.4em' }}>{o.today}</strong> {t('today')}
        </span>
        <span>
          <strong style={{ fontSize: '1.4em' }}>{o.week}</strong> {t('in 7 days')}
        </span>
        {o.pending ? (
          <span>
            <strong style={{ fontSize: '1.4em' }}>{o.pending}</strong> {t('to confirm')}
          </span>
        ) : null}
      </div>
      {o.next.length ? (
        <ul style={{ margin: 0, paddingLeft: '1rem' }}>
          {o.next.map((a) => (
            <li key={a.id}>
              <a href={adminUrl(`/ext/${SLUG}?appointment=${a.id}`)}>{fmt(a.start)}</a> · {a.name}{' '}
              <Pill status={a.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="agx-muted" style={{ margin: 0 }}>
          {t('No upcoming appointments.')}
        </p>
      )}
      <Counter limit={o.limit} upgradeUrl={o.upgradeUrl} />
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: NAME.en, it: NAME.it },
      capability: CAPABILITY,
      icon: CALENDAR_ICON,
      after: '/media',
      component: AgendaPage,
    },
  ],
  dashboardWidgets: [
    {
      id: 'agenda',
      title: { en: 'Appointments', it: 'Appuntamenti' },
      capability: CAPABILITY,
      component: DashboardBox,
    },
  ],
});
