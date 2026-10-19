import type { CoreSettings, RoleView } from '@cleitext/shared';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '../api';
import { useMe } from '../auth';
import { Card, TextField, useT } from '../components/ui';

const selectClass = 'w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm';

type Set = <K extends keyof CoreSettings>(key: K, value: CoreSettings[K]) => void;

function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block font-medium text-slate-800">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  hint?: ReactNode;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="block font-medium text-slate-800">{label}</span>
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

/** Settings → Membership (RF-USR-11): who can create an account. */
export function MembershipCard({
  values,
  set,
  pages,
}: {
  values: CoreSettings;
  set: Set;
  pages: { id: string; title: string }[];
}) {
  const { t } = useT();
  const me = useMe();
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<RoleView[]>('GET', '/roles'),
    enabled: me.capabilities.includes('manage_users'),
  });
  return (
    <Card id="membership" title={t('Membership')}>
      <div className="space-y-4">
        <Check
          checked={values.registration}
          onChange={(v) => set('registration', v)}
          label={t('Anyone can register')}
          hint={t(
            'Visitors create an account on the site (/account/register), to comment and more.',
          )}
        />
        <Select
          label={t('New user default role')}
          value={values.defaultRole}
          options={(roles.data ?? [{ slug: 'subscriber', name: 'Subscriber' } as RoleView]).map(
            (r) => ({ value: r.slug, label: t(r.name) }),
          )}
          onChange={(v) => set('defaultRole', v)}
          hint={t(
            'Roles that can manage the site are never given to new accounts: they get Subscriber instead.',
          )}
        />
        <Check
          checked={values.verifyEmail}
          onChange={(v) => set('verifyEmail', v)}
          label={t('Confirm the email address')}
          hint={t('New accounts open a link sent by email before they can sign in.')}
        />
        <label className="block space-y-1 text-sm">
          <span className="block font-medium text-slate-800">{t('Terms to accept')}</span>
          <select
            className={selectClass}
            value={values.termsPage ?? ''}
            onChange={(e) => set('termsPage', e.target.value || null)}
          >
            <option value="">{t('None')}</option>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Card>
  );
}

/** Settings → Discussion (RF-COM): comments, likes and sharing, as in WordPress. */
export function DiscussionCard({ values, set }: { values: CoreSettings; set: Set }) {
  const { t } = useT();
  const number = (
    key: 'commentCloseAfterDays' | 'commentThreadDepth' | 'commentsPerPage' | 'commentMaxLinks',
    label: string,
    min: number,
    max: number,
    hint?: string,
  ) => (
    <TextField
      label={label}
      type="number"
      min={min}
      max={max}
      value={values[key]}
      onChange={(e) => set(key, Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
      {...(hint ? { hint } : {})}
    />
  );
  return (
    <Card id="discussion" title={t('Discussion')}>
      <div className="space-y-4">
        <Check
          checked={values.commentsDefault}
          onChange={(v) => set('commentsDefault', v)}
          label={t('Allow comments on new posts')}
          hint={t('Each post can still open or close its comments.')}
        />
        <Check
          checked={values.commentRegistration}
          onChange={(v) => set('commentRegistration', v)}
          label={t('Users must be signed in to comment')}
        />
        <Check
          checked={values.commentRequireNameEmail}
          onChange={(v) => set('commentRequireNameEmail', v)}
          label={t('Comment author must fill out name and email')}
        />
        <Select
          label={t('Before a comment appears')}
          value={values.commentModeration}
          options={[
            { value: 'first', label: t('Approve the first comment of each person') },
            { value: 'always', label: t('Approve every comment') },
            { value: 'none', label: t('Publish at once') },
          ]}
          onChange={(v) => set('commentModeration', v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {number('commentMaxLinks', t('Hold comments with more links than'), 0, 50)}
          {number('commentThreadDepth', t('Levels of replies'), 1, 10)}
          {number('commentsPerPage', t('Comments per page (0: all)'), 0, 500)}
          {number('commentCloseAfterDays', t('Close comments after days (0: never)'), 0, 3650)}
        </div>
        <Select
          label={t('Order')}
          value={values.commentOrder}
          options={[
            { value: 'oldest', label: t('Oldest first') },
            { value: 'newest', label: t('Newest first') },
          ]}
          onChange={(v) => set('commentOrder', v)}
        />
        <label className="block space-y-1 text-sm">
          <span className="block font-medium text-slate-800">
            {t('Hold for approval when a comment contains')}
          </span>
          <textarea
            className="w-full rounded border border-slate-300 p-2 text-sm"
            rows={3}
            value={values.commentHoldWords}
            onChange={(e) => set('commentHoldWords', e.target.value)}
          />
          <span className="block text-xs text-slate-500">
            {t('One word or address per line; name, email and website are checked too.')}
          </span>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="block font-medium text-slate-800">
            {t('Send to spam when a comment contains')}
          </span>
          <textarea
            className="w-full rounded border border-slate-300 p-2 text-sm"
            rows={3}
            value={values.commentBlockWords}
            onChange={(e) => set('commentBlockWords', e.target.value)}
          />
        </label>
        <Check
          checked={values.commentNotifyAuthor}
          onChange={(v) => set('commentNotifyAuthor', v)}
          label={t('Email the author when a comment is published')}
        />
        <Check
          checked={values.commentNotifyModerators}
          onChange={(v) => set('commentNotifyModerators', v)}
          label={t('Email the moderators when a comment waits for approval')}
        />
        <Select
          label={t('Avatars')}
          value={values.avatars}
          options={[
            { value: 'initials', label: t('Initials') },
            { value: 'gravatar', label: 'Gravatar' },
          ]}
          onChange={(v) => set('avatars', v)}
          hint={t(
            'Gravatar shows people’s pictures: a hash of their email address is sent to Gravatar.',
          )}
        />
        <Select
          label={t('Likes')}
          value={values.likes}
          options={[
            { value: 'everyone', label: t('Anyone can like posts') },
            { value: 'users', label: t('Only signed-in people') },
            { value: 'off', label: t('Off') },
          ]}
          onChange={(v) => set('likes', v)}
        />
        <Check
          checked={values.shareButtons}
          onChange={(v) => set('shareButtons', v)}
          label={t('Share links under posts')}
          hint={t('Plain links to social networks: no scripts and no tracking.')}
        />
      </div>
    </Card>
  );
}
