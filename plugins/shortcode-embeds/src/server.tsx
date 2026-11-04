import { defineBlock, definePlugin } from '@cleitext/plugin-sdk';
import {
  SPREAKER_BLOCK,
  blockFromSpreaker,
  embedFromFve,
  spreakerAttrs,
  spreakerSrc,
  type SpreakerAttrs,
} from './shortcodes';

/**
 * Shortcode Embeds: the `[fve]` and `[spreaker]` shortcodes of WordPress sites become embeds when the site is
 * imported (plugin API 1.36, `import.shortcode`), and a Spreaker player block is offered in the block editor and
 * in Fresco. The player is a plain iframe of widget.spreaker.com: with the Privacy plugin it is held until the
 * visitor accepts the category of embedded content, with a notice in its place, like every iframe of another site.
 */
export default definePlugin({
  setup(ctx) {
    ctx.blocks.register(
      defineBlock<SpreakerAttrs>({
        type: SPREAKER_BLOCK,
        title: { en: 'Spreaker player', it: 'Player Spreaker' },
        description: {
          en: 'A podcast episode, show or playlist of Spreaker.',
          it: 'Un episodio, uno show o una playlist di Spreaker.',
        },
        icon: 'microphone',
        category: 'embed',
        attributes: [
          {
            name: 'resource',
            type: 'text',
            maxLength: 40,
            label: { en: 'What to play', it: 'Cosa riprodurre' },
            help: {
              en: 'episode_id=…, show_id=… or playlist_id=…, as in the share code of Spreaker.',
              it: 'episode_id=…, show_id=… o playlist_id=…, come nel codice di condivisione di Spreaker.',
            },
          },
          { name: 'height', type: 'number', min: 80, max: 1000, default: 200, label: { en: 'Height (px)', it: 'Altezza (px)' } },
          {
            name: 'theme',
            type: 'select',
            default: 'light',
            label: { en: 'Theme', it: 'Tema' },
            options: [
              { value: 'light', label: { en: 'Light', it: 'Chiaro' } },
              { value: 'dark', label: { en: 'Dark', it: 'Scuro' } },
            ],
          },
          {
            name: 'playlist',
            type: 'select',
            default: 'false',
            label: { en: 'Playlist', it: 'Playlist' },
            options: [
              { value: 'false', label: { en: 'None', it: 'Nessuna' } },
              { value: 'show', label: { en: 'The show’s episodes', it: 'Gli episodi dello show' } },
              { value: 'user', label: { en: 'The author’s episodes', it: 'Gli episodi dell’autore' } },
            ],
          },
        ],
        render({ attrs }) {
          const value = spreakerAttrs(attrs as unknown as Record<string, unknown>);
          if (!value.resource) return null;
          return (
            <iframe
              className="shortcode-embeds-spreaker"
              src={spreakerSrc(value)}
              title="Spreaker"
              width="100%"
              height={value.height}
              loading="lazy"
              style={{ border: 0, display: 'block', width: '100%', height: `${value.height}px` }}
            />
          );
        },
      }),
    );

    ctx.hooks.filter('import.shortcode', (blocks, { tag, attrs, content }) => {
      if (blocks) return blocks; // another plugin answered
      if (tag === 'fve') {
        const embed = embedFromFve(content ?? undefined);
        return embed ? [embed] : null;
      }
      if (tag === 'spreaker') {
        const block = blockFromSpreaker((attrs ?? {}) as Record<string, string>);
        return block ? [block] : null;
      }
      return null;
    });
  },
});
