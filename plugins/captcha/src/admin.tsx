import {
  type AdminPageProps,
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  TextField,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_MESSAGES, type CaptchaConfig, type FormGroup, type Provider } from './options';

interface SettingsView {
  config: CaptchaConfig;
  secrets: { secret: boolean; fallbackSecret: boolean };
}

const select = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-slate-800">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

function CaptchaPage(props: AdminPageProps) {
  const it = props.user.locale.startsWith('it');
  const tr = (en: string, itText: string) => (it ? itText : en);
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: ['captcha', 'settings'],
    queryFn: () => props.api<SettingsView>('GET', '/settings'),
  });
  const [draft, setDraft] = useState<CaptchaConfig | null>(null);
  const [secret, setSecret] = useState('');
  const [fallbackSecret, setFallbackSecret] = useState('');
  const [trusted, setTrusted] = useState('');
  const [locale, setLocale] = useState(props.site.defaultLocale);
  useEffect(() => {
    if (saved.data && !draft) {
      setDraft(saved.data.config);
      setTrusted(saved.data.config.trustedIps.join('\n'));
    }
  }, [saved.data, draft]);
  const save = useMutation({
    mutationFn: (body: { config: CaptchaConfig; secrets: Record<string, string | null> }) =>
      props.api<SettingsView>('PUT', '/settings', body),
    onSuccess: (next) => {
      queryClient.setQueryData(['captcha', 'settings'], next);
      setDraft(next.config);
      setTrusted(next.config.trustedIps.join('\n'));
      setSecret('');
      setFallbackSecret('');
    },
  });

  if (saved.isError) return <Alert>{errorMessage(saved.error)}</Alert>;
  if (!draft || !saved.data) return <p className="text-sm text-slate-500">…</p>;

  const set = (changes: Partial<CaptchaConfig>) => setDraft({ ...draft, ...changes });
  const setForm = (group: FormGroup, value: boolean) =>
    set({ forms: { ...draft.forms, [group]: value } });
  const secrets = saved.data.secrets;
  const turnstile = draft.provider === 'turnstile';
  const active = Boolean(saved.data.config.siteKey && secrets.secret);
  const languages =
    props.site.locales.length > 0
      ? props.site.locales
      : [{ code: props.site.defaultLocale, name: props.site.defaultLocale }];
  const send = (removeSecret?: 'secret' | 'fallbackSecret') =>
    save.mutate({
      config: { ...draft, trustedIps: trusted.split(/[\s,;]+/).filter(Boolean) },
      secrets: removeSecret
        ? { [removeSecret]: null }
        : {
            ...(secret.trim() ? { secret: secret.trim() } : {}),
            ...(fallbackSecret.trim() ? { fallbackSecret: fallbackSecret.trim() } : {}),
          },
    });

  const providers: [Provider, string][] = [
    ['turnstile', 'Cloudflare Turnstile'],
    ['recaptcha2', tr('Google reCAPTCHA v2 (checkbox)', 'Google reCAPTCHA v2 (casella)')],
    [
      'recaptcha2-invisible',
      tr('Google reCAPTCHA v2 (invisible)', 'Google reCAPTCHA v2 (invisibile)'),
    ],
    ['recaptcha3', tr('Google reCAPTCHA v3 (score)', 'Google reCAPTCHA v3 (punteggio)')],
  ];
  const groups: [FormGroup, string][] = [
    [
      'admin',
      tr('Admin sign-in and lost password', 'Accesso all’amministrazione e password dimenticata'),
    ],
    ['login', tr('Sign in (visitors)', 'Accesso (visitatori)')],
    ['register', tr('Create an account', 'Registrazione')],
    ['password', tr('Lost and new password', 'Password dimenticata e nuova password')],
    ['comments', tr('Comments and reviews', 'Commenti e recensioni')],
    ['forms', tr('Forms plugin', 'Plugin Moduli')],
    ['shop', tr('Shop checkout (Cleishop)', 'Cassa del negozio (Cleishop)')],
    [
      'builders',
      tr('Page builder forms (Fresco Pro, Prisma)', 'Moduli dei page builder (Fresco Pro, Prisma)'),
    ],
    ['other', tr('Forms of other plugins', 'Moduli di altri plugin')],
  ];

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <h1 className="text-2xl font-semibold">Captcha</h1>
      <div
        className={`rounded border px-3 py-2 text-sm ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}
        role="status"
      >
        {active
          ? tr(
              'The protection is on for the forms ticked below.',
              'La protezione è attiva sui moduli selezionati qui sotto.',
            )
          : tr(
              'The protection is off: add the site key and the secret key, then save.',
              'La protezione è spenta: inserisci la chiave del sito e la chiave segreta, poi salva.',
            )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={tr('Service and keys', 'Servizio e chiavi')}>
          <div className="space-y-4">
            <Field label={tr('Service', 'Servizio')}>
              <select
                className={select}
                value={draft.provider}
                onChange={(e) => set({ provider: e.target.value as Provider })}
              >
                {providers.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-xs text-slate-500">
              {turnstile
                ? tr(
                    'Get the keys for free in the Cloudflare dashboard → Turnstile → Add widget, with your domain.',
                    'Ottieni le chiavi gratis nella dashboard di Cloudflare → Turnstile → Add widget, con il tuo dominio.',
                  )
                : tr(
                    'Get the keys at google.com/recaptcha/admin, for the same version chosen here and your domain.',
                    'Ottieni le chiavi su google.com/recaptcha/admin, per la stessa versione scelta qui e il tuo dominio.',
                  )}
            </p>
            <TextField
              label={tr('Site key', 'Chiave del sito')}
              value={draft.siteKey}
              onChange={(e) => set({ siteKey: e.target.value.trim() })}
              autoComplete="off"
              spellCheck={false}
            />
            <TextField
              label={tr('Secret key', 'Chiave segreta')}
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={
                secrets.secret
                  ? tr('Saved: leave empty to keep it', 'Salvata: lascia vuoto per mantenerla')
                  : ''
              }
              autoComplete="new-password"
              hint={tr(
                'It is stored encrypted and never shown again.',
                'Viene salvata cifrata e non viene più mostrata.',
              )}
            />
            {secrets.secret && (
              <Button type="button" variant="danger" onClick={() => send('secret')}>
                {tr('Remove the secret key', 'Rimuovi la chiave segreta')}
              </Button>
            )}
            {draft.provider === 'recaptcha3' && (
              <Field
                label={tr('Lowest score that passes', 'Punteggio minimo per passare')}
                hint={tr(
                  'From 0.1 (lenient) to 0.9 (strict); 0.5 suits most sites.',
                  'Da 0.1 (tollerante) a 0.9 (severo); 0.5 va bene per la maggior parte dei siti.',
                )}
              >
                <input
                  className={select}
                  type="number"
                  min={0.1}
                  max={0.9}
                  step={0.1}
                  value={draft.minScore}
                  onChange={(e) => set({ minScore: Number(e.target.value) })}
                />
              </Field>
            )}
          </div>
        </Card>

        <Card title={tr('Forms to protect', 'Moduli da proteggere')}>
          <div className="space-y-2">
            {groups.map(([group, label]) => (
              <Check key={group} checked={draft.forms[group]} onChange={(v) => setForm(group, v)}>
                {label}
              </Check>
            ))}
            {draft.forms.admin && (
              <p className="text-xs text-slate-500">
                {tr(
                  'Try the keys in a private window before signing out. Locked out? On the server: cleitext plugin:deactivate captcha --site <site>.',
                  'Prova le chiavi in una finestra privata prima di uscire. Rimasto fuori? Sul server: cleitext plugin:deactivate captcha --site <sito>.',
                )}
              </p>
            )}
            <hr className="my-3 border-slate-200" />
            <Check checked={draft.skipSignedIn} onChange={(v) => set({ skipSignedIn: v })}>
              {tr(
                'Do not ask people who are signed in',
                'Non chiedere a chi ha effettuato l’accesso',
              )}
            </Check>
            <Field
              label={tr('Trusted addresses', 'Indirizzi fidati')}
              hint={tr(
                'One per line, IPv4 or IPv6, also ranges such as 203.0.113.0/24: their submissions are not checked (the widget may still show on cached pages).',
                'Uno per riga, IPv4 o IPv6, anche intervalli come 203.0.113.0/24: i loro invii non vengono controllati (il widget può comparire comunque nelle pagine in cache).',
              )}
            >
              <textarea
                className={select}
                rows={3}
                value={trusted}
                onChange={(e) => setTrusted(e.target.value)}
                spellCheck={false}
              />
            </Field>
          </div>
        </Card>

        <Card title={tr('Look and behaviour', 'Aspetto e comportamento')}>
          <div className="space-y-4">
            {(turnstile || draft.provider === 'recaptcha2') && (
              <>
                <Field label={tr('Theme', 'Tema')}>
                  <select
                    className={select}
                    value={draft.theme}
                    onChange={(e) => set({ theme: e.target.value as CaptchaConfig['theme'] })}
                  >
                    <option value="auto">
                      {tr(
                        'Automatic (as the visitor’s device)',
                        'Automatico (come il dispositivo del visitatore)',
                      )}
                    </option>
                    <option value="light">{tr('Light', 'Chiaro')}</option>
                    <option value="dark">{tr('Dark', 'Scuro')}</option>
                  </select>
                </Field>
                <Field label={tr('Size', 'Dimensione')}>
                  <select
                    className={select}
                    value={draft.size}
                    onChange={(e) => set({ size: e.target.value as CaptchaConfig['size'] })}
                  >
                    <option value="normal">{tr('Normal', 'Normale')}</option>
                    {turnstile && (
                      <option value="flexible">{tr('Full width', 'Larghezza piena')}</option>
                    )}
                    <option value="compact">{tr('Compact', 'Compatta')}</option>
                  </select>
                </Field>
              </>
            )}
            {turnstile && (
              <Field label={tr('Appearance', 'Visualizzazione')}>
                <select
                  className={select}
                  value={draft.appearance}
                  onChange={(e) =>
                    set({ appearance: e.target.value as CaptchaConfig['appearance'] })
                  }
                >
                  <option value="always">{tr('Always shown', 'Sempre visibile')}</option>
                  <option value="interaction-only">
                    {tr(
                      'Only when the visitor has to click',
                      'Solo quando il visitatore deve cliccare',
                    )}
                  </option>
                </select>
              </Field>
            )}
            {draft.provider !== 'recaptcha3' && (
              <TextField
                label={tr('Language of the widget', 'Lingua del widget')}
                value={draft.language}
                onChange={(e) => set({ language: e.target.value.trim() })}
                hint={tr(
                  '“auto” follows the language of the page; or a code such as it, en, de.',
                  '“auto” segue la lingua della pagina; oppure un codice come it, en, de.',
                )}
              />
            )}
            {(turnstile || draft.provider === 'recaptcha2') && (
              <Check checked={draft.disableSubmit} onChange={(v) => set({ disableSubmit: v })}>
                {tr(
                  'Keep the send button disabled until the check is passed',
                  'Tieni disattivato il pulsante di invio finché il controllo non è superato',
                )}
              </Check>
            )}
          </div>
        </Card>

        <Card title={tr('Error message', 'Messaggio di errore')}>
          <div className="space-y-3">
            {languages.length > 1 && (
              <div
                role="tablist"
                aria-label={tr('Language', 'Lingua')}
                className="flex flex-wrap gap-1"
              >
                {languages.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    role="tab"
                    aria-selected={l.code === locale}
                    className={`rounded px-2 py-1 text-sm ${l.code === locale ? 'bg-sky-700 text-white' : 'border border-slate-300 bg-white'}`}
                    onClick={() => setLocale(l.code)}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            )}
            <TextField
              label={tr('Shown when the check fails', 'Mostrato quando il controllo non riesce')}
              value={draft.messages[locale] ?? ''}
              placeholder={DEFAULT_MESSAGES[locale.split('-')[0] ?? ''] ?? DEFAULT_MESSAGES.en}
              maxLength={200}
              onChange={(e) => set({ messages: { ...draft.messages, [locale]: e.target.value } })}
              hint={tr('Empty: the default text.', 'Vuoto: il testo predefinito.')}
            />
          </div>
        </Card>

        {turnstile && (
          <Card title={tr('If Cloudflare is down', 'Se Cloudflare non risponde')}>
            <div className="space-y-4">
              <Field
                label={tr('Failsafe', 'Piano di riserva')}
                hint={tr(
                  'What happens when Turnstile cannot be loaded or Cloudflare does not answer.',
                  'Cosa succede quando Turnstile non si carica o Cloudflare non risponde.',
                )}
              >
                <select
                  className={select}
                  value={draft.failsafe}
                  onChange={(e) => set({ failsafe: e.target.value as CaptchaConfig['failsafe'] })}
                >
                  <option value="off">{tr('Refuse the submissions', 'Rifiuta gli invii')}</option>
                  <option value="recaptcha">
                    {tr('Use Google reCAPTCHA v2 instead', 'Usa Google reCAPTCHA v2 al suo posto')}
                  </option>
                  <option value="allow">
                    {tr(
                      'Allow the submissions while Cloudflare is down',
                      'Accetta gli invii finché Cloudflare non risponde',
                    )}
                  </option>
                </select>
              </Field>
              {draft.failsafe === 'recaptcha' && (
                <>
                  <TextField
                    label={tr('reCAPTCHA v2 site key', 'Chiave del sito reCAPTCHA v2')}
                    value={draft.fallbackSiteKey}
                    onChange={(e) => set({ fallbackSiteKey: e.target.value.trim() })}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <TextField
                    label={tr('reCAPTCHA v2 secret key', 'Chiave segreta reCAPTCHA v2')}
                    type="password"
                    value={fallbackSecret}
                    onChange={(e) => setFallbackSecret(e.target.value)}
                    placeholder={
                      secrets.fallbackSecret
                        ? tr(
                            'Saved: leave empty to keep it',
                            'Salvata: lascia vuoto per mantenerla',
                          )
                        : ''
                    }
                    autoComplete="new-password"
                  />
                  {secrets.fallbackSecret && (
                    <Button type="button" variant="danger" onClick={() => send('fallbackSecret')}>
                      {tr('Remove the reCAPTCHA secret key', 'Rimuovi la chiave segreta reCAPTCHA')}
                    </Button>
                  )}
                </>
              )}
            </div>
          </Card>
        )}
      </div>

      {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert kind="success">{tr('Saved.', 'Salvato.')}</Alert>}
      <Button type="submit" disabled={save.isPending}>
        {tr('Save', 'Salva')}
      </Button>
    </form>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Captcha', it: 'Captcha' },
      parent: '/settings',
      capability: 'manage_settings',
      component: CaptchaPage,
    },
  ],
});
