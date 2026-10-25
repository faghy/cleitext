import { FieldsForm, labelText } from '@cleitext/admin-sdk';
import type { FieldValues, OptionsScreenView } from '@cleitext/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { useMe } from '../auth';
import { FieldGroupSections } from '../components/field-groups';
import { Alert, Button, Card, useT } from '../components/ui';

/**
 * An options page (plugin API 1.48): its own fields and the field groups
 * attached to it, saved for the whole site; with several languages, each
 * language's translations of the translatable fields.
 */
export function OptionsPagePage({ slug }: { slug: string }) {
  const { t } = useT();
  const me = useMe();
  const queryClient = useQueryClient();
  const [locale, setLocale] = useState<string | null>(null);
  const key = ['options', slug, locale ?? ''];
  const screen = useQuery({
    queryKey: key,
    queryFn: () =>
      api<OptionsScreenView>(
        'GET',
        `/options/${encodeURIComponent(slug)}${locale ? `?locale=${encodeURIComponent(locale)}` : ''}`,
      ),
  });
  // Changes not saved yet, for the language shown.
  const [draft, setDraft] = useState<{ locale: string | null; values: FieldValues } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const values = draft && draft.locale === locale ? draft.values : (screen.data?.values ?? {});
  const change = (next: FieldValues) => setDraft({ locale, values: next });
  const save = useMutation({
    mutationFn: () =>
      api<OptionsScreenView>('PUT', `/options/${encodeURIComponent(slug)}`, {
        fields: values,
        ...(locale ? { locale } : {}),
      }),
    onSuccess: (saved) => {
      setErrors({});
      setDraft(null);
      queryClient.setQueryData(key, saved);
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

  if (screen.error) return <Alert>{errorMessage(screen.error)}</Alert>;
  const view = screen.data;
  if (!view) return null;
  const title = labelText(view.page.title, me.user.locale);
  const description = labelText(view.page.description, me.user.locale);
  const own = view.page.fields ?? [];
  const ownErrors = Object.fromEntries(
    Object.entries(errors).filter(([path]) => !path.includes('.')),
  );
  const nothing = own.length === 0 && view.groups.length === 0;
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {view.locales.length > 1 && (
          <label className="flex items-center gap-2 text-sm">
            <span>{t('Language')}</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              value={view.locale}
              onChange={(e) => {
                const next = view.locales.find((l) => l.code === e.target.value);
                setLocale(next && !next.isDefault ? next.code : null);
                setErrors({});
              }}
            >
              {view.locales.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {description && <p className="text-sm text-slate-600">{description}</p>}
      {view.translationsOnly && (
        <p
          role="note"
          className="rounded border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100"
        >
          {t(
            'Here you write this language’s version of the fields that change with the language. The others are the same in every language: change them in the main language.',
          )}
        </p>
      )}
      <form
        className="space-y-4 text-sm"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {nothing ? (
          <Card title={title}>
            <p className="text-sm text-slate-500">
              {t(
                'This page has no fields yet: attach a field group to it with the rule “Options page is …”.',
              )}
            </p>
          </Card>
        ) : (
          <>
            {own.length > 0 && (
              <section className="space-y-2 rounded border border-slate-200 bg-white p-4">
                <FieldsForm
                  fields={own}
                  values={values}
                  errors={ownErrors}
                  locale={me.user.locale}
                  rowIds
                  onChange={change}
                />
              </section>
            )}
            <FieldGroupSections
              groups={view.groups}
              values={values}
              errors={errors}
              locale={me.user.locale}
              readOnly={false}
              onChange={change}
              framed
            />
          </>
        )}
        {save.error && <Alert>{errorMessage(save.error)}</Alert>}
        {save.isSuccess && !draft && <p role="status">{t('Saved')}</p>}
        {!nothing && (
          <Button type="submit" disabled={save.isPending}>
            {t('Save changes')}
          </Button>
        )}
      </form>
    </div>
  );
}
