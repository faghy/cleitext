// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient module declarations, also needed by apps that type-check this source
/// <reference path="./wordpress-modules.d.ts" />
import * as buttonBlock from '@wordpress/block-library/build-module/button/index.mjs';
import * as buttonsBlock from '@wordpress/block-library/build-module/buttons/index.mjs';
import * as codeBlock from '@wordpress/block-library/build-module/code/index.mjs';
import * as columnBlock from '@wordpress/block-library/build-module/column/index.mjs';
import * as columnsBlock from '@wordpress/block-library/build-module/columns/index.mjs';
import * as groupBlock from '@wordpress/block-library/build-module/group/index.mjs';
import * as headingBlock from '@wordpress/block-library/build-module/heading/index.mjs';
import * as imageBlock from '@wordpress/block-library/build-module/image/index.mjs';
import * as listBlock from '@wordpress/block-library/build-module/list/index.mjs';
import * as listItemBlock from '@wordpress/block-library/build-module/list-item/index.mjs';
import * as paragraphBlock from '@wordpress/block-library/build-module/paragraph/index.mjs';
import * as quoteBlock from '@wordpress/block-library/build-module/quote/index.mjs';
import * as separatorBlock from '@wordpress/block-library/build-module/separator/index.mjs';
import * as spacerBlock from '@wordpress/block-library/build-module/spacer/index.mjs';
import { setDefaultBlockName } from '@wordpress/blocks';
import '@wordpress/format-library';

/** Core blocks available in the MVP editor (docs/ARCHITECTURE.md §10.5). */
const CORE_BLOCKS = [
  paragraphBlock,
  headingBlock,
  listBlock,
  listItemBlock,
  quoteBlock,
  imageBlock,
  buttonsBlock,
  buttonBlock,
  columnsBlock,
  columnBlock,
  groupBlock,
  separatorBlock,
  spacerBlock,
  codeBlock,
];

let registered = false;

export function registerCoreBlocks(): void {
  if (registered) return;
  registered = true;
  for (const block of CORE_BLOCKS) (block as { init: () => unknown }).init();
  setDefaultBlockName('core/paragraph');
}
