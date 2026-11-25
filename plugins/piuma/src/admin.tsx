import {
  type AdminPageProps,
  Alert,
  Button,
  Card,
  defineAdminPlugin,
  errorMessage,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { MAX_SIZES, type PiumaConfig } from './optimize';
import type { LibraryJob } from './server';

interface Status {
  config: PiumaConfig;
  job: LibraryJob;
  supported: boolean;
}

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function PiumaPage(props: AdminPageProps) {
  const it = props.user.locale.startsWith('it');
  const tr = (en: string, itText: string) => (it ? itText : en);
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['piuma', 'status'],
    queryFn: () => props.api<Status>('GET', '/status'),
    // While the library is being done, the numbers move.
    refetchInterval: (query) => (query.state.data?.job.state === 'running' ? 5000 : false),
  });
  const [draft, setDraft] = useState<PiumaConfig | null>(null);
  useEffect(() => {
    if (status.data && !draft) setDraft(status.data.config);
  }, [status.data, draft]);
  const save = useMutation({
    mutationFn: (next: PiumaConfig) => props.api<PiumaConfig>('PUT', '/config', next),
    onSuccess: (next) => {
      setDraft(next);
      void queryClient.invalidateQueries({ queryKey: ['piuma', 'status'] });
    },
  });
  const library = useMutation({
    mutationFn: (action: 'start' | 'stop') => props.api<LibraryJob>('POST', `/library/${action}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['piuma', 'status'] }),
  });

  if (status.isError) return <Alert>{errorMessage(status.error)}</Alert>;
  if (!status.data || !draft) return <p className="text-sm text-slate-500">…</p>;
  const { job, supported } = status.data;
  const dirty = JSON.stringify(draft) !== JSON.stringify(status.data.config);
  const saved = job.bytesBefore - job.bytesAfter;
  const set = <K extends keyof PiumaConfig>(key: K, value: PiumaConfig[K]) =>
    setDraft({ ...draft, [key]: value });

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-slate-600">
        {tr(
          'Pictures as light as they can be without losing quality: pages open sooner, the site takes less space. Cleitext already removes the camera data (GPS) from photos and makes WebP and AVIF copies for the pages.',
          'Immagini leggere quanto si può senza perdere qualità: le pagine si aprono prima e il sito occupa meno spazio. Cleitext toglie già i dati della fotocamera (GPS) dalle foto e crea le copie WebP e AVIF per le pagine.',
        )}
      </p>
      {!supported && (
        <Alert>
          {tr(
            'This version of Cleitext cannot make pictures lighter yet: update it from Updates.',
            'Questa versione di Cleitext non può ancora alleggerire le immagini: aggiornala da Aggiornamenti.',
          )}
        </Alert>
      )}

      <Card title={tr('New pictures', 'Nuove immagini')}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(draft);
          }}
        >
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.onUpload}
              onChange={(e) => set('onUpload', e.target.checked)}
            />
            <span>
              <span className="block font-medium text-slate-800">
                {tr('Make every new picture lighter', 'Alleggerisci ogni nuova immagine')}
              </span>
              <span className="block text-xs text-slate-500">
                {tr(
                  'When it is uploaded: made smaller if it is larger than needed, and saved again with good compression. A picture already light stays as it is.',
                  'Al caricamento: rimpicciolita se è più grande del necessario e salvata di nuovo con una buona compressione. Un’immagine già leggera resta com’è.',
                )}
              </span>
            </span>
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-slate-800">
              {tr('Largest side', 'Lato più lungo')}
            </span>
            <select
              className="mt-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={draft.maxSize}
              onChange={(e) => set('maxSize', Number(e.target.value))}
            >
              {MAX_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size === 0
                    ? tr('Keep the size', 'Non cambiare la misura')
                    : `${size} px${size === 2560 ? tr(' (recommended)', ' (consigliato)') : ''}`}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              {tr(
                'Larger pictures are made smaller to this size: 2560 pixels stay sharp even on large screens.',
                'Le immagini più grandi vengono ridotte a questa misura: 2560 pixel restano nitidi anche sugli schermi grandi.',
              )}
            </span>
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-slate-800">
              {tr('Quality', 'Qualità')}: {draft.quality}
            </span>
            <input
              type="range"
              min={40}
              max={95}
              className="mt-1 w-64"
              value={draft.quality}
              onChange={(e) => set('quality', Number(e.target.value))}
            />
            <span className="mt-1 block text-xs text-slate-500">
              {tr(
                'For JPEG and WebP photos. 82 is the recommended balance: no difference to see, much lighter files. PNG pictures stay lossless.',
                'Per le foto JPEG e WebP. 82 è l’equilibrio consigliato: nessuna differenza visibile, file molto più leggeri. Le immagini PNG restano senza perdita.',
              )}
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.pngToJpeg}
              onChange={(e) => set('pngToJpeg', e.target.checked)}
            />
            <span>
              <span className="block font-medium text-slate-800">
                {tr('PNG photos become JPEG', 'Le foto PNG diventano JPEG')}
              </span>
              <span className="block text-xs text-slate-500">
                {tr(
                  'Only new uploads without transparency, and only when the JPEG is much lighter: logos and screenshots stay PNG.',
                  'Solo i nuovi caricamenti senza trasparenza, e solo quando il JPEG è molto più leggero: loghi e schermate restano PNG.',
                )}
              </span>
            </span>
          </label>
          {save.error && <Alert>{errorMessage(save.error)}</Alert>}
          <Button type="submit" disabled={save.isPending || !dirty}>
            {tr('Save', 'Salva')}
          </Button>
        </form>
      </Card>

      <Card title={tr('Pictures already in the library', 'Immagini già nella libreria')}>
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            {tr(
              'Piuma goes through the library in the background, a few pictures each minute, with the settings above. Addresses do not change, so pages keep working. PNG pictures stay PNG.',
              'Piuma passa la libreria in background, qualche immagine al minuto, con le impostazioni qui sopra. Gli indirizzi non cambiano, quindi le pagine continuano a funzionare. Le immagini PNG restano PNG.',
            )}
          </p>
          {job.state !== 'idle' || job.seen > 0 ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-500">{tr('Looked at', 'Esaminate')}</dt>
                <dd className="font-medium">{job.seen}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{tr('Made lighter', 'Alleggerite')}</dt>
                <dd className="font-medium">{job.optimized}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  {tr('Space saved', 'Spazio risparmiato')}
                </dt>
                <dd className="font-medium">
                  {megabytes(saved)}
                  {job.bytesBefore > 0 && ` (−${Math.round((saved / job.bytesBefore) * 100)}%)`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{tr('Errors', 'Errori')}</dt>
                <dd className="font-medium">{job.failed}</dd>
              </div>
            </dl>
          ) : null}
          {job.state === 'running' && (
            <p className="text-sm text-sky-800">{tr('Working on it…', 'Al lavoro…')}</p>
          )}
          {job.state === 'done' && (
            <Alert kind="success">
              {tr('The whole library is done.', 'Tutta la libreria è stata alleggerita.')}
            </Alert>
          )}
          {job.lastError && (
            <p className="text-xs text-slate-500">
              {tr('Last error', 'Ultimo errore')}: {job.lastError}
            </p>
          )}
          {library.error && <Alert>{errorMessage(library.error)}</Alert>}
          {job.state === 'running' ? (
            <Button
              variant="secondary"
              disabled={library.isPending}
              onClick={() => library.mutate('stop')}
            >
              {tr('Stop', 'Ferma')}
            </Button>
          ) : (
            <Button
              disabled={library.isPending || !supported}
              onClick={() => library.mutate('start')}
            >
              {job.state === 'idle' && job.cursor
                ? tr('Go on', 'Riprendi')
                : job.state === 'done'
                  ? tr('Do the new pictures', 'Alleggerisci le nuove immagini')
                  : tr('Make the library lighter', 'Alleggerisci la libreria')}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

export default defineAdminPlugin({
  pages: [
    {
      path: '',
      title: { en: 'Lighter pictures', it: 'Immagini leggere' },
      parent: '/media',
      capability: 'manage_settings',
      component: PiumaPage,
    },
  ],
});
