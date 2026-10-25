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

const NOTE_GROUPS = [
  ['info', 'Read from the file'],
  ['skipped', 'Left out'],
  ['review', 'To check after importing'],
] as const;

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
              'In WordPress: Appointments → Settings → Import/Export → Export, with settings, appointment types and appointments; save the code in a .json file and upload it here. The wp_ssa_ tables work too: a dump (.sql) or their rows as JSON.',
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
              {t('{n} services', { n: preview.services.length })}:
              <ul>
                {preview.services.map((s, i) => (
                  <li key={i}>
                    {s.name} ({s.duration}′
                    {s.bufferBefore || s.bufferAfter
                      ? `, ${t('buffers {b}′ / {a}′', { b: s.bufferBefore, a: s.bufferAfter })}`
                      : ''}
                    ) — {s.status === 'active' ? t('bookable') : t('hidden')}
                  </li>
                ))}
              </ul>
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
          {NOTE_GROUPS.map(([kind, title]) => {
            const notes = preview.notes.filter((n) => n.kind === kind);
            return notes.length ? (
              <div key={kind}>
                <h4 style={{ margin: '0 0 .25rem' }}>{t(title)}</h4>
                <ul style={{ margin: 0 }} className={kind === 'review' ? 'agx-warn' : 'agx-help'}>
                  {notes.map((n, i) => (
                    <li key={i}>{t(n.text, n.values)}</li>
                  ))}
                </ul>
              </div>
            ) : null;
          })}
          {result ? (
            <div className="agx-ok" role="status">
              <p style={{ margin: 0 }}>
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
              {result.orphans ? (
                <p style={{ margin: 0 }}>
                  {t('{n} appointments left out: their appointment type is not in the file.', {
                    n: result.orphans,
                  })}
                </p>
              ) : null}
              {result.settings.notify.length ? (
                <p style={{ margin: 0 }}>
                  {t('Bookings are now notified to {list} too.', {
                    list: result.settings.notify.join(', '),
                  })}
                </p>
              ) : null}
              {result.settings.emails.length ? (
                <p style={{ margin: 0 }}>
                  {t('Email texts set: {list}.', { list: result.settings.emails.join(', ') })}
                </p>
              ) : null}
            </div>
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
