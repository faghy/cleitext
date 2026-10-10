import type { RoleView, SecuritySettings } from '@cleitext/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, useT } from '../components/ui';

/** Settings → Security: roles that must use two-factor authentication (RF-USR-04). */
export function SecurityCard() {
  const { t } = useT();
  const me = useMe();
  const settings = useQuery({
    queryKey: ['settings', 'security'],
    queryFn: () => api<SecuritySettings>('GET', '/settings/security'),
  });
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<RoleView[]>('GET', '/roles'),
    enabled: me.capabilities.includes('manage_users'),
  });
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (settings.data) setSelected(settings.data.require2fa);
  }, [settings.data]);
  const save = useMutation({
    mutationFn: () => api<SecuritySettings>('PUT', '/settings/security', { require2fa: selected }),
  });

  const options = [
    ...(me.user.isSuperAdmin ? [{ slug: 'super_admin', name: t('Super admins') }] : []),
    ...(roles.data ?? []).map((role) => ({ slug: role.slug, name: role.name })),
  ];
  const toggle = (slug: string, on: boolean) =>
    setSelected((list) => (on ? [...list, slug] : list.filter((s) => s !== slug)));

  return (
    <Card title={t('Security')}>
      <form
        className="space-y-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <fieldset className="space-y-2">
          <legend className="font-medium text-slate-800">
            {t('Roles that must use two-factor authentication')}
          </legend>
          <p className="text-slate-600">
            {t(
              'Their members can only set it up until it is on. Turn it on for yourself first, if your role is one of them.',
            )}
          </p>
          {options.map((option) => (
            <label key={option.slug} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.includes(option.slug)}
                onChange={(e) => toggle(option.slug, e.target.checked)}
              />
              {t(option.name)}
            </label>
          ))}
        </fieldset>
        {settings.error && <Alert>{errorMessage(settings.error)}</Alert>}
        {save.error && <Alert>{errorMessage(save.error)}</Alert>}
        {save.isSuccess && <Alert kind="success">{t('Settings saved.')}</Alert>}
        <Button type="submit" disabled={save.isPending || !settings.data}>
          {t('Save')}
        </Button>
      </form>
    </Card>
  );
}
