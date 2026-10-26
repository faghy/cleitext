// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient module declarations, also needed by apps that type-check this source
/// <reference path="./wordpress-modules.d.ts" />
import * as buttonBlock from '@wordpress/block-library/build-module/button/index.mjs';
import * as buttonsBlock from '@wordpress/block-library/build-module/buttons/index.mjs';
import * as codeBlock from '@wordpress/block-library/build-module/code/index.mjs';
import * as embedBlock from '@wordpress/block-library/build-module/embed/index.mjs';
import * as htmlBlock from '@wordpress/block-library/build-module/html/index.mjs';
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
import * as tableBlock from '@wordpress/block-library/build-module/table/index.mjs';
import * as galleryBlock from '@wordpress/block-library/build-module/gallery/index.mjs';
import apiFetch from '@wordpress/api-fetch';
import {
  getBlockVariations,
  registerBlockVariation,
  setDefaultBlockName,
  unregisterBlockVariation,
} from '@wordpress/blocks';
import '@wordpress/format-library';
import { currentServices } from './media-upload';
import { registerUnavailableBlock } from './unavailable-block';
import { registerPatternBlock } from './patterns';
import { registerBindings } from './bindings';
import { installDashiconIcons } from './dashicons';

/** Core blocks available in the MVP editor (docs/ARCHITECTURE.md §10.5). */
const CORE_BLOCKS = [
  paragraphBlock,
  headingBlock,
  listBlock,
  listItemBlock,
  quoteBlock,
  imageBlock,
  galleryBlock,
  tableBlock,
  buttonsBlock,
  buttonBlock,
  columnsBlock,
  columnBlock,
  groupBlock,
  separatorBlock,
  spacerBlock,
  codeBlock,
  embedBlock,
  htmlBlock,
];

let registered = false;

export function registerCoreBlocks(): void {
  if (registered) return;
  registered = true;
  installDashiconIcons();
  // Some Gutenberg internals (core-data) query the WordPress REST API. Cleitext
  // has none: embed previews go to the editor services, everything else gets
  // empty data locally instead of hitting the network.
  apiFetch.setFetchHandler(async ({ path = '' }: { path?: string }) => {
    if (path.startsWith('/oembed/1.0/proxy')) {
      const url = new URLSearchParams(path.split('?')[1] ?? '').get('url') ?? '';
      const preview = await currentServices().oembed?.(url);
      // Gutenberg shows "cannot be embedded" when the request fails.
      if (!preview)
        throw { code: 'oembed_invalid_url', message: 'Not Found', data: { status: 404 } };
      return preview;
    }
    return /\/types(\?|$)/.test(path) ? {} : [];
  });
  for (const block of CORE_BLOCKS) (block as { init: () => unknown }).init();
  registerSocialEmbeds();
  registerUnavailableBlock();
  registerPatternBlock();
  // Block bindings, Field and Field rows (plugin API 1.48).
  registerBindings();
  setDefaultBlockName('core/paragraph');
}

/**
 * The social networks Cleitext embeds (since 0.84.0): Gutenberg hides
 * Facebook and Instagram (WordPress lost their oEmbed) and knows X only as
 * twitter.com. Their variations recognize the addresses again, in the
 * inserter, with a preview from the editor services.
 */
const SOCIAL_EMBEDS: Record<string, { patterns: RegExp[]; description: string }> = {
  twitter: {
    patterns: [/^https?:\/\/((www|mobile)\.)?(twitter|x)\.com\/.+/i],
    description: 'Embed an X post.',
  },
  facebook: {
    patterns: [/^https?:\/\/((www|m|web)\.)?facebook\.com\/.+/i, /^https?:\/\/fb\.watch\/.+/i],
    description: 'Embed a Facebook post, video or page.',
  },
  instagram: {
    patterns: [/^https?:\/\/(www\.)?(instagram\.com|instagr\.am)\/.+/i],
    description: 'Embed an Instagram post or reel.',
  },
  tiktok: {
    patterns: [/^https?:\/\/((www|m|vm|vt)\.)?tiktok\.com\/.+/i],
    description: 'Embed a TikTok video or profile.',
  },
};

function registerSocialEmbeds(): void {
  for (const [name, { patterns, description }] of Object.entries(SOCIAL_EMBEDS)) {
    const variation = getBlockVariations('core/embed')?.find((v) => v.name === name);
    if (!variation) continue;
    unregisterBlockVariation('core/embed', name);
    registerBlockVariation('core/embed', {
      ...variation,
      description,
      patterns,
      scope: ['block', 'inserter', 'transform'],
      attributes: { ...variation.attributes, previewable: true },
    } as Parameters<typeof registerBlockVariation>[1]);
  }
}
