import type { OAuthConsentView } from '@cleitext/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { Alert, Button, Card, useT } from '../components/ui';

/**
 * Connect an assistant (RF-AI-02): the consent of /oauth/authorize, which
 * sends the browser here with its query. On Allow the assistant gets a code.
 */
export function ConnectPage() {
  const { t } = useT();
  // The query as the assistant sent it, untouched by the router.
  const [params] = useState(() => Object.fromEntries(new URLSearchParams(window.location.search)));
  const consent = useQuery({
    queryKey: ['oauth-consent', params],
    queryFn: () =>
      api<OAuthConsentView>('GET', `/oauth/consent?${new URLSearchParams(params).toString()}`),
    retry: false,
  });
  const [publish, setPublish] = useState(false);
  const decide = useMutation({
    mutationFn: (allow: boolean) =>
      api<{ redirect: string }>('POST', '/oauth/consent', { params, allow, publish }),
    onSuccess: ({ redirect }) => window.location.assign(redirect),
  });
  const view = consent.data;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">{t('Connect an assistant')}</h1>
      {consent.error && (
        <Alert>
          {t(errorMessage(consent.error))} {t('Start again from your assistant.')}
        </Alert>
      )}
      {decide.error && <Alert>{t(errorMessage(decide.error))}</Alert>}
      {view && (
        <Card>
          <div className="space-y-4 text-sm">
            <p className="text-base">
              {t('{app} wants to work on {site} as {user}.', {
                app: view.client,
                site: view.site,
                user: view.user,
              })}
            </p>
            <div>
              <p className="font-medium text-slate-800">{t('It will be able to')}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>{t('read pages, posts, media and menus')}</li>
                {view.scopes.includes('write') && (
                  <li>{t('create and change drafts, upload images, set menus')}</li>
                )}
              </ul>
            </div>
            {view.canPublish && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={publish}
                  onChange={(e) => setPublish(e.target.checked)}
                />
                {t('also publish (otherwise everything stays a draft)')}
              </label>
            )}
            <p className="text-xs text-slate-500">
              {t(
                'It acts with your permissions, and everything it does is in the activity log. You can disconnect it at any time in AI assistants.',
              )}
            </p>
            <div className="flex gap-2">
              <Button disabled={decide.isPending} onClick={() => decide.mutate(true)}>
                {t('Allow')}
              </Button>
              <Button
                variant="secondary"
                disabled={decide.isPending}
                onClick={() => decide.mutate(false)}
              >
                {t('Cancel')}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
