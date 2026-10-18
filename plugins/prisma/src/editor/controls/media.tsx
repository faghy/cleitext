import { MediaUpload } from '@wordpress/block-editor';
import { BaseControl, Button } from '@wordpress/components';
import { value, type Bind } from './bind';

/** An image of the media library, kept as `{ id, url, alt }` (Spectra's media object). */
export interface MediaObject {
  id?: string | number;
  url?: string;
  alt?: string;
  width?: number;
  height?: number;
}

export function Media({
  bind,
  name,
  label,
  allowed = ['image'],
}: {
  bind: Bind;
  name: string;
  label: string;
  allowed?: string[];
}) {
  const current = value(bind, name) as MediaObject | '' | undefined;
  const url = current && typeof current === 'object' ? current.url : '';
  return (
    <BaseControl __nextHasNoMarginBottom label={label} className="pr-media">
      <MediaUpload
        allowedTypes={allowed}
        onSelect={(media: {
          id: string;
          url: string;
          alt?: string;
          width?: number;
          height?: number;
        }) =>
          bind.setAttributes({
            [name]: {
              id: media.id,
              url: media.url,
              alt: media.alt ?? '',
              ...(media.width ? { width: media.width } : {}),
              ...(media.height ? { height: media.height } : {}),
            },
          })
        }
        render={({ open }: { open: () => void }) => (
          <div className="pr-media__box">
            {url ? (
              <button
                type="button"
                className="pr-media__preview"
                onClick={open}
                aria-label={`Replace ${label}`}
              >
                <img src={url} alt="" />
              </button>
            ) : (
              <Button variant="secondary" onClick={open}>
                Select image
              </Button>
            )}
            {url && (
              <Button
                variant="link"
                isDestructive
                onClick={() => bind.setAttributes({ [name]: '' })}
              >
                Remove
              </Button>
            )}
          </div>
        )}
      />
    </BaseControl>
  );
}
