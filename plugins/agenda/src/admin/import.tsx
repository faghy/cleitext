/**
 * Import from WordPress: Simply Schedule Appointments (its export, Settings
 * → Import/Export, or a dump of its tables) and Booking Calendar (a dump or
 * CSVs of its tables). Files are uploaded, checked (a preview of what will
 * be made) and then imported; importing again updates instead of adding.
 */
import { uploadFile, useT } from '@cleitext/admin-sdk';
import { useEffect, useState } from 'react';
import { SLUG } from '../config';
import { agenda, messageOf, type ImportPreview, type ImportResult } from './api';

export function ImportTab({ onImported }: { onImported: () => void }) {
  const { t } = useT();
  const [kind, setKind] = useState<'ssa' | 'wpbc'>('ssa');
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    agenda
      .importFiles()
      .then((r) => setFiles(r.files))
      .catch(() => undefined);
  }, []);

  async function upload(list: FileList | null) {
    if (!list) return;
    setError('');
    setPreview(null);
    setResult(null);
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        const r = await uploadFile<{ files: { name: string; size: number }[] }>(file, {
          path: `/ext/${SLUG}/import/files`,
        });
        setFiles(r.files);
      }
      setPreview((await agenda.runImport(kind, true)).preview);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function run(dryRun: boolean) {
    setBusy(true);
    setError('');
    try {
      const r = await agenda.runImport(kind, dryRun);
      setPreview(r.preview);
      if (r.result) {
        setResult(r.result);
        setFiles([]);
        onImported();
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="agx-grid" style={{ maxWidth: '52rem' }}>
      <div className="agx-card agx-grid">
        <h2>{t('Import from WordPress')}</h2>
        <div className="agx-chips">
          <button
            type="button"
            className="agx-chip"
            aria-pressed={kind === 'ssa'}
            onClick={() => {
              setKind('ssa');
              setPreview(null);
            }}
          >
            Simply Schedule Appointments
          </button>
          <button
            type="button"
            className="agx-chip"
            aria-pressed={kind === 'wpbc'}
            onClick={() => {
              setKind('wpbc');
              setPreview(null);
            }}
          >
            Booking Calendar
          </button>
        </div>
        {kind === 'ssa' ? (
          <p className="agx-help">
            {t(
              'In WordPress: Appointments → Settings → Import/Export → Export, with appointment types and appointments; save the code in a .json file and upload it here. A dump of the wp_ssa_ tables (.sql) works too.',
            )}
          </p>
        ) : (
          <p className="agx-help">
            {t(
              'Booking Calendar keeps its data in its own tables: upload a dump (.sql) of wp_booking, wp_bookingdates and wp_bookingtypes (phpMyAdmin → Export, or your host’s backup), or a CSV of each table.',
            )}
          </p>
        )}
        <p className="agx-help">
          {t(
            'Imported bookings do not count toward the limit of the free version. Importing again updates what was imported and adds only what is new.',
          )}
        </p>
        <label className="agx-btn" style={{ justifySelf: 'start' }}>
          {t('Choose files')}
          <input
            type="file"
            accept=".json,.sql,.csv,.txt"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => void upload(e.target.files)}
          />
        </label>
        {files.length ? (
          <p className="agx-help">
            {t('Uploaded')}: {files.map((f) => f.name).join(', ')}{' '}
            <button
              type="button"
              className="agx-link"
              onClick={() =>
                void agenda.clearImport().then(() => {
                  setFiles([]);
                  setPreview(null);
                })
              }
            >
              {t('Clear')}
            </button>
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="agx-alert" role="alert">
          {error}
        </p>
      ) : null}
      {preview ? (
        <div className="agx-card agx-grid">
          <h3>{result ? t('Imported') : t('What will be imported')}</h3>
          <ul style={{ margin: 0 }}>
            <li>
              {t('{n} services', { n: preview.services.length })}:{' '}
              {preview.services.map((s) => `${s.name} (${s.duration}′)`).join(', ')}
            </li>
            <li>
              {t('{n} appointments, {f} of them still to come', {
                n: preview.appointments,
                f: preview.future,
              })}
            </li>
            {preview.exceptions ? <li>{t('{n} closed days', { n: preview.exceptions })}</li> : null}
          </ul>
          {preview.timezone && preview.timezone !== preview.siteTimeZone ? (
            <p className="agx-warn">
              {t(
                'The other plugin used {zone}, Agenda uses {site}: check the time zone in Settings.',
                { zone: preview.timezone, site: preview.siteTimeZone },
              )}
            </p>
          ) : null}
          {preview.warnings.map((w) => (
            <p key={w} className="agx-help">
              {t(w)}
            </p>
          ))}
          {result ? (
            <p className="agx-ok" role="status">
              {t(
                'Done: {s} services added, {u} updated, {a} appointments added, {e} already there.',
                {
                  s: result.services,
                  u: result.servicesUpdated,
                  a: result.appointments,
                  e: result.existing,
                },
              )}
            </p>
          ) : (
            <div>
              <button
                type="button"
                className="agx-btn agx-primary"
                disabled={busy}
                onClick={() => void run(false)}
              >
                {busy ? t('Importing…') : t('Import')}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
