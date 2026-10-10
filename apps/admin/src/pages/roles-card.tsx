import type { CapabilityCatalog, RoleView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { useMe } from '../auth';
import { CAPABILITY_GROUPS, CAPABILITY_LABELS } from '../capability-labels';
import { Alert, Button, Card, TextField, useT } from '../components/ui';

type Draft = { id: string | null; name: string; capabilities: string[] };

/** Users → Roles (RF-USR-06): built-in roles are read-only, custom ones editable. */
export function RolesCard() {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const canPromote = me.capabilities.includes('promote_users');
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<RoleView[]>('GET', '/roles') });
  const catalog = useQuery({
    queryKey: ['roles', 'capabilities'],
    queryFn: () => api<CapabilityCatalog>('GET', '/roles/capabilities'),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['roles'] });

  const save = useMutation({
    mutationFn: (value: Draft) =>
      value.id
        ? api<RoleView>('PATCH', `/roles/${value.id}`, {
            name: value.name,
            capabilities: value.capabilities,
          })
        : api<RoleView>('POST', '/roles', { name: value.name, capabilities: value.capabilities }),
    onSuccess: async () => {
      setDraft(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/roles/${id}`),
    onSuccess: refresh,
  });
  const error = save.error ?? remove.error;
  const label = (capability: string) =>
    CAPABILITY_LABELS[capability]
      ? t(CAPABILITY_LABELS[capability])
      : (catalog.data?.plugins.find((p) => p.name === capability)?.label ?? capability);

  return (
    <Card title={t('Roles')}>
      <div className="space-y-3 text-sm">
        {error && <Alert>{errorMessage(error)}</Alert>}
        <ul className="divide-y divide-slate-100" aria-label={t('Roles')}>
          {roles.data?.map((role) => (
            <li key={role.id} aria-label={role.name} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  <span className="font-medium">{t(role.name)}</span>{' '}
                  <span className="text-xs text-slate-500">
                    {role.system ? t('built-in') : t('custom')} ·{' '}
                    {t('{count} members', { count: role.members ?? 0 })}
                  </span>
                </p>
                {canPromote && (
                  <div className="flex gap-2">
                    {role.system ? (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setDraft({
                            id: null,
                            name: t('{name} (copy)', { name: t(role.name) }),
                            capabilities: role.capabilities,
                          })
                        }
                      >
                        {t('Duplicate')}
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setDraft({
                              id: role.id,
                              name: role.name,
                              capabilities: role.capabilities,
                            })
                          }
                        >
                          {t('Edit')}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={(role.members ?? 0) > 0}
                          title={
                            (role.members ?? 0) > 0
                              ? t('Give its members another role first.')
                              : undefined
                          }
                          onClick={() => {
                            if (window.confirm(t('Delete the role "{name}"?', { name: role.name })))
                              remove.mutate(role.id);
                          }}
                        >
                          {t('Delete')}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {role.capabilities.map(label).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
        {canPromote && !draft && (
          <Button onClick={() => setDraft({ id: null, name: '', capabilities: ['read'] })}>
            {t('Add role')}
          </Button>
        )}
        {draft && catalog.data && (
          <RoleForm
            draft={draft}
            catalog={catalog.data}
            own={me.user.isSuperAdmin ? null : me.capabilities}
            label={label}
            pending={save.isPending}
            onSubmit={(value) => save.mutate(value)}
            onCancel={() => setDraft(null)}
          />
        )}
      </div>
    </Card>
  );
}

function RoleForm({
  draft,
  catalog,
  own,
  label,
  pending,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  catalog: CapabilityCatalog;
  /** The current user's capabilities: others cannot be granted (null: all). */
  own: string[] | null;
  label: (capability: string) => string;
  pending: boolean;
  onSubmit: (draft: Draft) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(draft.name);
  const [selected, setSelected] = useState(new Set(draft.capabilities));
  const groups = [
    ...CAPABILITY_GROUPS.map((group) => ({
      title: t(group.title),
      capabilities: group.capabilities.filter((c) => catalog.core.includes(c)),
    })),
    ...(catalog.plugins.length > 0
      ? [{ title: t('Plugins'), capabilities: catalog.plugins.map((p) => p.name) }]
      : []),
  ];
  const toggle = (capability: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(capability);
      else next.delete(capability);
      return next;
    });

  return (
    <form
      className="space-y-3 rounded border border-slate-200 p-3"
      aria-label={draft.id ? t('Edit role') : t('New role')}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ ...draft, name, capabilities: [...selected] });
      }}
    >
      <TextField label={t('Role name')} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map((group) => (
          <fieldset key={group.title} className="space-y-1">
            <legend className="mb-1 font-medium text-slate-800">{group.title}</legend>
            {group.capabilities.map((capability) => {
              const allowed = own === null || own.includes(capability);
              return (
                <label
                  key={capability}
                  className={`flex items-start gap-2 ${allowed ? '' : 'text-slate-400'}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(capability)}
                    disabled={!allowed || capability === 'read'}
                    onChange={(e) => toggle(capability, e.target.checked)}
                  />
                  {label(capability)}
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !name.trim()}>
          {draft.id ? t('Save') : t('Add role')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('Cancel')}
        </Button>
      </div>
    </form>
  );
}
