import { InnerBlocks, RichText, useBlockProps } from '@wordpress/block-editor';
import { registerBlockType } from '@wordpress/blocks';

/** The Box's own editor: rich text heading and nested blocks. */
registerBlockType('native/box', {
  apiVersion: 3,
  title: 'Box',
  category: 'design',
  attributes: {
    heading: { type: 'string', default: '' },
    padding: { type: 'object', default: { desktop: 24 } },
  },
  edit: ({ attributes, setAttributes }) => (
    <section {...useBlockProps({ className: 'nb-box' })}>
      <RichText
        tagName="h2"
        aria-label="Box heading"
        value={attributes.heading as string}
        onChange={(heading: string) => setAttributes({ heading })}
      />
      <InnerBlocks />
    </section>
  ),
  save: () => <InnerBlocks.Content />,
} as never);
