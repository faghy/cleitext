import { Alert, Button, Card, FieldsForm, labelText, useT } from '@cleitext/admin-sdk';
import type {
  FieldGroupView,
  FieldObject,
  FieldScreenView,
  FieldValues,
  UserFieldsView,
} from '@cleitext/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { useMe } from '../auth';

/** The groups an admin screen may show, with their rules (plugin API 1.47). */
export const fieldScreenQuery = (object: FieldObject) =>
  queryOptions({
    queryKey: ['field-screens', object],
    queryFn: () => api<FieldScreenView>('GET', `/field-screens/${object}`),
    staleTime: 60_000,
  });

export function useFieldScreen(object: FieldObject) {
  return useQuery(fieldScreenQuery(object));
}

/** Messages of the fields of a group (`<group>.<name>` → `<name>`). */
export function groupErrors(errors: Record<string, string>, group: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(errors)
      .filter(([path]) => path.startsWith(`${group}.`))
      .map(([path, message]) => [path.slice(group.length + 1), message]),
  );
}

/**
 * Field groups as sections of a form, each with its title and its values
 * under `values[<group id>]` (entries, terms, users).
 */
export function FieldGroupSections({
  groups,
  values,
  errors = {},
  locale,
  readOnly,
  onChange,
  framed = false,
}: {
  groups: FieldGroupView[];
  values: FieldValues;
  /** Messages by `<group>.<field>`. */
  errors?: Record<string, string>;
  locale: string;
  readOnly: boolean;
  onChange: (values: FieldValues) => void;
  /** Each group in a box (the main column of the editor, the term and user screens). */
  framed?: boolean;
}) {
  const { t } = useT();
  return (
    <>
      {groups.map((group) => {
        const title = labelText(group.title, locale);
        const description = labelText(group.description, locale);
        return (
          <section
            key={group.id}
            aria-label={title}
            className={
              framed ? 'space-y-2 rounded border border-slate-200 bg-white p-4' : 'space-y-2'
            }
          >
            <h3 className="font-medium">{title}</h3>
            {description && <p className="text-xs text-slate-500">{description}</p>}
            {group.fields.length === 0 ? (
              <p className="text-xs text-slate-500">{t('This group has no fields yet.')}</p>
            ) : (
              <FieldsForm
                fields={group.fields}
                values={(values[group.id] as FieldValues | undefined) ?? {}}
                errors={groupErrors(errors, group.id)}
                locale={locale}
                disabled={readOnly}
                rowIds
                labelPlacement={group.labelPlacement ?? 'top'}
                onChange={(groupValues) => onChange({ ...values, [group.id]: groupValues })}
              />
            )}
          </section>
        );
      })}
    </>
  );
}

/**
 * A person's user fields (plugin API 1.47): the groups shown on the form
 * (`edit`: Users → Edit, `profile`: their own profile). Nothing without groups.
 */
export function UserFieldsCard({ path, readOnly = false }: { path: string; readOnly?: boolean }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const me = useMe();
  const view = useQuery({
    queryKey: ['user-fields', path],
    queryFn: () => api<UserFieldsView>('GET', path),
  });
  const [values, setValues] = useState<FieldValues | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () =>
      api<UserFieldsView>('PUT', path, { fields: values ?? view.data?.values ?? {} }),
    onSuccess: (saved) => {
      setErrors({});
      setValues(saved.values);
      queryClient.setQueryData(['user-fields', path], saved);
    },
    onError: (error) => {
      const next: Record<string, string> = {};
      if (error instanceof ApiError) {
        for (const e of error.problem.errors ?? []) {
          if (e.path.startsWith('fields.')) next[e.path.slice('fields.'.length)] = e.message;
        }
      }
      setErrors(next);
    },
  });
  if (!view.data || view.data.groups.length === 0) return null;
  const current = values ?? view.data.values;
  return (
    <Card title={t('More about this person')}>
      <form
        className="space-y-4 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <FieldGroupSections
          groups={view.data.groups}
          values={current}
          errors={errors}
          locale={me.user.locale}
          readOnly={readOnly}
          onChange={setValues}
        />
        {save.error && <Alert>{errorMessage(save.error)}</Alert>}
        {save.isSuccess && <p role="status">{t('Saved')}</p>}
        {!readOnly && (
          <Button type="submit" disabled={save.isPending}>
            {t('Save')}
          </Button>
        )}
      </form>
    </Card>
  );
}
