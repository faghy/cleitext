import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { errorMessage, uploadFile } from '../api';
import { useMe } from '../auth';
import { Alert, Button, Card, useT } from './ui';

/**
 * Upload Plugin / Upload Theme (RF-PLG-10): a built .zip or .tgz package,
 * for super admins.
 */
export function PackageUpload({
  title,
  path,
  onInstalled,
}: {
  title: string;
  path: '/plugins/upload' | '/themes/upload';
  onInstalled: () => void;
}) {
  const { t } = useT();
  const me = useMe();
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: (file: File) => uploadFile<{ slug: string; version: string }>(file, { path }),
    onSuccess: onInstalled,
  });
  if (!me.user.isSuperAdmin) return null;
  return (
    <Card title={title}>
      <div className="space-y-3 text-sm">
        <Alert>
          {t(
            'Packages uploaded here are not verified by a registry: install only code you trust. It runs on the server with access to every site.',
          )}
        </Alert>
        <input
          ref={input}
          type="file"
          accept=".zip,.tgz,.tar.gz,application/zip,application/gzip"
          aria-label={t('Package file (.zip or .tgz)')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = '';
          }}
        />
        {upload.isPending && <p>{t('Installing…')}</p>}
        {upload.error && <Alert>{errorMessage(upload.error)}</Alert>}
        {upload.data && (
          <Alert kind="success">
            {t('Installed {slug} {version}.', {
              slug: upload.data.slug,
              version: upload.data.version,
            })}
          </Alert>
        )}
        <Button variant="secondary" onClick={() => input.current?.click()}>
          {t('Choose a package')}
        </Button>
      </div>
    </Card>
  );
}
