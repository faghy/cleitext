/**
 * Diorama in the admin: the Diorama page (the sliders, and the editor of
 * one, at `?slider=<id>`), Fresco's Slider widget, and the Italian texts.
 */
import { addMessages, defineAdminPlugin, useT, type AdminPageProps } from '@cleitext/admin-sdk';
import { useCallback, useEffect, useState } from 'react';
import type { SliderRecord } from './model/types';
import { messageOf, sliderApi, type Overview } from './studio/api';
import { registerFrescoWidget, SLIDER_ICON } from './studio/fresco';
import { IT } from './studio/it';
import { ADMIN_LIB } from './studio/lib';
import { proAdmin } from './studio/pro';
import { SlidersList } from './studio/list';
import { Studio } from './studio/studio';
import { useStudioCss } from './studio/ui';

addMessages('it', IT);
registerFrescoWidget();
// Diorama 1.1: extensions draw with Diorama's components.
proAdmin().lib = ADMIN_LIB;

function currentId(): string | null {
  return new URLSearchParams(window.location.search).get('slider');
}

function go(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('slider', id);
  else url.searchParams.delete('slider');
  window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function DioramaPage({ plugin, user, site }: AdminPageProps) {
  useStudioCss();
  const { t } = useT();
  const [id, setId] = useState<string | null>(currentId);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [record, setRecord] = useState<SliderRecord | null>(null);
  const [error, setError] = useState('');
  const locale = user.locale || site.defaultLocale;

  useEffect(() => {
    const onPop = () => setId(currentId());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const refresh = useCallback(() => {
    sliderApi
      .overview()
      .then(setOverview)
      .catch((e) => setError(messageOf(e)));
  }, []);

  useEffect(() => {
    setError('');
    if (!id) {
      setRecord(null);
      refresh();
      return;
    }
    if (record?.id === id) return;
    sliderApi
      .get(id)
      .then(setRecord)
      .catch((e) => setError(messageOf(e)));
  }, [id]);

  if (error)
    return (
      <div
        className="dst"
        role="alert"
        style={{
          padding: 16,
          border: '1px solid #fecaca',
          background: '#fef2f2',
          borderRadius: 10,
          color: '#991b1b',
        }}
      >
        {error}{' '}
        <button type="button" className="dst-reset" onClick={() => go(null)}>
          {t('Back to the sliders')}
        </button>
      </div>
    );

  if (id) {
    if (!record || record.id !== id) return <p className="dst-help">{t('Loading…')}</p>;
    return (
      <Studio
        key={record.id}
        record={record}
        locale={locale}
        version={plugin.version}
        onBack={() => go(null)}
        onSaved={(saved) => setRecord(saved)}
      />
    );
  }

  if (!overview) return <p className="dst-help">{t('Loading…')}</p>;
  return (
    <SlidersList
      overview={overview}
      locale={locale}
      onOpen={(next) => go(next)}
      onCreated={(created) => {
        setRecord(created);
        go(created.id);
      }}
      onChanged={refresh}
    />
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Diorama', it: 'Diorama' },
      capability: 'manage_diorama',
      icon: SLIDER_ICON,
      after: '/media',
      component: DioramaPage,
    },
  ],
});
