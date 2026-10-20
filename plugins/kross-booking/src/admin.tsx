import {
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
  TextField,
  type AdminPageProps,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

interface Config {
  hotelId: string;
  widgetId: number | null;
  version: number;
}

const T = {
  en: {
    title: 'Kross Booking',
    intro:
      'The booking widget of Kross Booking on your pages: add the Kross Booking block (or, in Fresco, the Kross Booking element under Plugins) where it should appear. Its files load only on those pages.',
    hotel: 'Hotel ID',
    hotelHint: 'The name of your hotel at Kross Booking, as in its widget code, e.g. pratonevoso.',
    widget: 'Widget ID',
    widgetHint: 'The number of the widget, e.g. 11.',
    version: 'Cache version',
    versionHint:
      'Part of the widget’s addresses. When Kross Booking changes the widget, use “Refresh the widget” below.',
    save: 'Save',
    saved: 'Saved.',
    refreshTitle: 'Refresh the widget',
    refreshText:
      'Did Kross Booking change the look or the texts of your widget? Visitors may still have the old one in their browser: this gives the widget a new version, so every browser loads it again.',
    refresh: 'Refresh the widget',
    refreshed: (v: number) => `Done: the widget now has version ${v}.`,
    missing: 'Until the hotel ID and the widget ID are set, pages show no widget.',
  },
  it: {
    title: 'Kross Booking',
    intro:
      'Il widget di prenotazione di Kross Booking nelle tue pagine: aggiungi il blocco Kross Booking (o, in Fresco, l’elemento Kross Booking sotto Plugin) dove deve comparire. I suoi file si caricano solo in quelle pagine.',
    hotel: 'ID dell’hotel',
    hotelHint:
      'Il nome del tuo hotel su Kross Booking, come nel codice del widget, es. pratonevoso.',
    widget: 'ID del widget',
    widgetHint: 'Il numero del widget, es. 11.',
    version: 'Versione della cache',
    versionHint:
      'Fa parte degli indirizzi del widget. Quando Kross Booking cambia il widget, usa “Aggiorna il widget” qui sotto.',
    save: 'Salva',
    saved: 'Salvato.',
    refreshTitle: 'Aggiorna il widget',
    refreshText:
      'Kross Booking ha cambiato l’aspetto o i testi del tuo widget? I visitatori potrebbero avere ancora quello vecchio nel browser: così il widget riceve una nuova versione e ogni browser lo carica di nuovo.',
    refresh: 'Aggiorna il widget',
    refreshed: (v: number) => `Fatto: ora il widget ha la versione ${v}.`,
    missing:
      'Finché l’ID dell’hotel e l’ID del widget non sono impostati, le pagine non mostrano il widget.',
  },
};

function KrossBookingPage({ api, user }: AdminPageProps) {
  const t = user.locale.startsWith('it') ? T.it : T.en;
  const client = useQueryClient();
  const config = useQuery({
    queryKey: ['kross-booking', 'config'],
    queryFn: () => api<Config>('GET', '/config'),
  });
  const [hotelId, setHotelId] = useState('');
  const [widgetId, setWidgetId] = useState('');
  const [version, setVersion] = useState('');
  useEffect(() => {
    if (!config.data) return;
    setHotelId(config.data.hotelId);
    setWidgetId(config.data.widgetId === null ? '' : String(config.data.widgetId));
    setVersion(String(config.data.version));
  }, [config.data]);

  const done = (data: Config) => client.setQueryData(['kross-booking', 'config'], data);
  const save = useMutation({
    mutationFn: () => api<Config>('PUT', '/config', { hotelId: hotelId.trim(), widgetId, version }),
    onSuccess: done,
  });
  const refresh = useMutation({
    mutationFn: () => api<Config>('POST', '/refresh'),
    onSuccess: (data) => {
      save.reset();
      done(data);
    },
  });

  if (config.isError) return <Alert kind="error">{errorMessage(config.error)}</Alert>;
  if (!config.data) return <p className="text-sm text-slate-500">…</p>;
  const configured = config.data.hotelId !== '' && config.data.widgetId !== null;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="text-slate-700">{t.intro}</p>
      {!configured && <Alert kind="error">{t.missing}</Alert>}

      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <TextField
            label={t.hotel}
            hint={t.hotelHint}
            value={hotelId}
            maxLength={64}
            pattern="[A-Za-z0-9_\-]+"
            required
            onChange={(e) => setHotelId(e.target.value)}
          />
          <TextField
            label={t.widget}
            hint={t.widgetHint}
            type="number"
            min={1}
            step={1}
            value={widgetId}
            required
            onChange={(e) => setWidgetId(e.target.value)}
          />
          <TextField
            label={t.version}
            hint={t.versionHint}
            type="number"
            min={1}
            step={1}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
          {save.isError && <Alert kind="error">{errorMessage(save.error)}</Alert>}
          {save.isSuccess && <Alert kind="success">{t.saved}</Alert>}
          <Button type="submit" disabled={save.isPending}>
            {t.save}
          </Button>
        </form>
      </Card>

      <Card title={t.refreshTitle}>
        <p className="mb-3 text-sm text-slate-700">{t.refreshText}</p>
        {refresh.isError && <Alert kind="error">{errorMessage(refresh.error)}</Alert>}
        {refresh.isSuccess && <Alert kind="success">{t.refreshed(refresh.data.version)}</Alert>}
        <Button
          type="button"
          variant="secondary"
          disabled={refresh.isPending}
          onClick={() => refresh.mutate()}
        >
          {t.refresh}
        </Button>
      </Card>
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Kross Booking', it: 'Kross Booking' },
      parent: '/settings',
      capability: 'manage_settings',
      component: KrossBookingPage,
      // A calendar.
      icon: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
    },
  ],
});
