import { registerBlockType } from '@wordpress/blocks';
import { UNAVAILABLE_BLOCK } from './convert';

/**
 * Placeholder for CXD blocks the editor does not know, e.g. from a disabled
 * plugin. The original block is kept untouched in the `cxd` attribute and
 * written back as it is on save (docs/SPECIFICATIONS.md §9.2).
 */
export function registerUnavailableBlock(): void {
  registerBlockType(UNAVAILABLE_BLOCK, {
    apiVersion: 3,
    title: 'Unavailable block',
    category: 'text',
    attributes: { cxd: { type: 'object' } },
    supports: { html: false, inserter: false, reusable: false },
    edit: ({ attributes }: { attributes: { cxd?: { type?: string } } }) => (
      <div
        className="cleitext-unavailable-block"
        style={{ padding: 12, border: '1px dashed #999', color: '#555', fontSize: 13 }}
      >
        This block ({attributes.cxd?.type ?? 'unknown'}) is not available: it is kept unchanged.
      </div>
    ),
    save: () => null,
  } as never);
}
