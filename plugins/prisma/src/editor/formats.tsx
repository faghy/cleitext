import { RichTextToolbarButton } from '@wordpress/block-editor';
import { registerFormatType, toggleFormat } from '@wordpress/rich-text';
import { pencil } from '@wordpress/icons';

/** Highlight (`<mark>`) in Prisma's rich texts, as in Spectra's headings. */
export function registerFormats(): void {
  registerFormatType('prisma/highlight', {
    title: 'Highlight',
    tagName: 'mark',
    className: null,
    edit({
      isActive,
      value,
      onChange,
    }: {
      isActive: boolean;
      value: unknown;
      onChange: (v: unknown) => void;
    }) {
      return (
        <RichTextToolbarButton
          icon={pencil}
          title="Highlight"
          isActive={isActive}
          onClick={() => onChange(toggleFormat(value as never, { type: 'prisma/highlight' }))}
        />
      );
    },
  } as never);
}
