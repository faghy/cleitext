import {
  defineBlock,
  definePlugin,
  type FieldDefinition,
  type PluginContext,
} from '@cleitext/plugin-sdk';
import { DEFAULT_FEDIVERSE, DEFAULT_SOCIAL, NETWORKS } from './networks';
import { DEFAULT_CONFIG, ShareButtons, type ShareConfig } from './render';

/**
 * Share Buttons: buttons to share a page on social networks and on the
 * fediverse (Disbigle, Diaspora, Mastodon and the other servers), by email or
 * by copying its link, each with its icon. Under the posts (or above, or
 * both) and as a block to place anywhere. Each site chooses its networks and
 * their order in Settings → Share Buttons. No tracking: the buttons are plain
 * links to each service's share page.
 */

const SLUG = 'share-buttons';
const BLOCK = `${SLUG}/buttons`;

const option = (id: string) => {
  const network = NETWORKS.find((n) => n.id === id)!;
  return {
    value: id,
    label:
      id === 'fediverse'
        ? { en: 'Others (any server)', it: 'Altri (qualsiasi server)' }
        : network.label,
  };
};

const FIELDS: FieldDefinition[] = [
  {
    name: 'social',
    type: 'list',
    label: { en: 'Social networks', it: 'Social network' },
    help: {
      en: 'In the order shown. Instagram cannot take a link: its button copies the link and opens Instagram.',
      it: 'Nell’ordine in cui compaiono. Instagram non accetta link: il suo pulsante copia il link e apre Instagram.',
    },
    itemLabel: 'network',
    max: 20,
    fields: [
      {
        name: 'network',
        type: 'select',
        label: { en: 'Network', it: 'Rete' },
        options: NETWORKS.filter((n) => n.group === 'social').map((n) => option(n.id)),
      },
    ],
    default: DEFAULT_SOCIAL.map((network) => ({ network })),
  },
  {
    name: 'fediverse',
    type: 'list',
    label: { en: 'Fediverse', it: 'Fediverso' },
    help: {
      en: 'Diaspora asks for the pod; Mastodon and “Others” ask for the server (Share₂Fedi: Mastodon, Misskey, Friendica, GoToSocial…).',
      it: 'Diaspora chiede il pod; Mastodon e «Altri» chiedono il server (Share₂Fedi: Mastodon, Misskey, Friendica, GoToSocial…).',
    },
    itemLabel: 'network',
    max: 10,
    fields: [
      {
        name: 'network',
        type: 'select',
        label: { en: 'Network', it: 'Rete' },
        options: NETWORKS.filter((n) => n.group === 'fediverse').map((n) => option(n.id)),
      },
    ],
    default: DEFAULT_FEDIVERSE.map((network) => ({ network })),
  },
  { name: 'email', type: 'boolean', label: { en: 'Email', it: 'Email' }, default: true },
  { name: 'copy', type: 'boolean', label: { en: 'Copy link', it: 'Copia il link' }, default: true },
  {
    name: 'look',
    type: 'select',
    label: { en: 'Look', it: 'Aspetto' },
    default: 'labels',
    options: [
      { value: 'labels', label: { en: 'Icons and names', it: 'Icone e nomi' } },
      { value: 'icons', label: { en: 'Icons only', it: 'Solo icone' } },
    ],
  },
  {
    name: 'place',
    type: 'select',
    label: { en: 'On posts', it: 'Negli articoli' },
    help: {
      en: 'Where the buttons go by themselves. The Share buttons block puts them anywhere else.',
      it: 'Dove compaiono da soli. Il blocco Pulsanti di condivisione li mette in qualsiasi altro punto.',
    },
    default: 'after',
    options: [
      { value: 'after', label: { en: 'After the content', it: 'Dopo il contenuto' } },
      { value: 'before', label: { en: 'Before the content', it: 'Prima del contenuto' } },
      { value: 'both', label: { en: 'Before and after', it: 'Prima e dopo' } },
      {
        value: 'none',
        label: { en: 'Only where the block is placed', it: 'Solo dove metti il blocco' },
      },
    ],
  },
  {
    name: 'pages',
    type: 'boolean',
    label: { en: 'Also on pages', it: 'Anche nelle pagine' },
    default: false,
  },
  {
    name: 'hide_core',
    type: 'boolean',
    label: {
      en: 'Hide the basic share links of the site',
      it: 'Nascondi i link di condivisione di base del sito',
    },
    help: {
      en: 'The plain links under the posts (Settings → Discussion), so that they are not shown twice. The like button stays.',
      it: 'I link semplici sotto gli articoli (Impostazioni → Discussione), per non mostrarli due volte. Il pulsante Mi piace resta.',
    },
    default: true,
  },
];

const ids = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((row) =>
          row && typeof row === 'object' ? (row as { network?: unknown }).network : null,
        )
        .filter((id): id is string => typeof id === 'string')
    : [];

interface Settings extends ShareConfig {
  place: 'after' | 'before' | 'both' | 'none';
  pages: boolean;
  hideCore: boolean;
}

export async function settingsOf(ctx: PluginContext, siteId: string): Promise<Settings> {
  const s = await ctx.settings.get(siteId);
  const place = ['after', 'before', 'both', 'none'].includes(s.place as string)
    ? (s.place as Settings['place'])
    : 'after';
  return {
    social: Array.isArray(s.social) ? [...new Set(ids(s.social))] : DEFAULT_CONFIG.social,
    fediverse: Array.isArray(s.fediverse)
      ? [...new Set(ids(s.fediverse))]
      : DEFAULT_CONFIG.fediverse,
    email: s.email !== false,
    copy: s.copy !== false,
    look: s.look === 'icons' ? 'icons' : 'labels',
    place,
    pages: s.pages === true,
    hideCore: s.hide_core !== false,
  };
}

const POSTS = ['article', 'post'];

export default definePlugin({
  setup(ctx) {
    ctx.settings.define(FIELDS, { title: { en: 'Share Buttons', it: 'Pulsanti di condivisione' } });

    ctx.blocks.register(
      defineBlock<Record<string, never>, ShareConfig>({
        type: BLOCK,
        title: { en: 'Share buttons', it: 'Pulsanti di condivisione' },
        description: {
          en: 'Share this page on social networks, the fediverse, by email or by copying the link.',
          it: 'Condividi questa pagina sui social, sul fediverso, via email o copiando il link.',
        },
        icon: 'share',
        category: 'widgets',
        attributes: [],
        load: async (_attrs, context) => settingsOf(ctx, context.siteId),
        render({ data, block, context }) {
          const entry = context.page.entry;
          return (
            <ShareButtons
              config={data ?? DEFAULT_CONFIG}
              url={entry?.url ?? context.page.site.home}
              title={entry?.title ?? context.page.site.title}
              locale={context.locale}
              uid={block.id.replace(/[^\w-]/g, '')}
            />
          );
        },
      }),
    );

    // By themselves, before or after the content of posts (and pages, when chosen).
    ctx.hooks.filter('render.blocks', async (blocks, context) => {
      const s = await settingsOf(ctx, context.siteId);
      if (s.place === 'none') return blocks;
      const types = s.pages ? [...POSTS, 'page'] : POSTS;
      if (!types.includes(context.entry.type) || context.isFrontPage) return blocks;
      const block = (where: string) => ({ id: `sb-${where}`, type: BLOCK, v: 1, attrs: {} });
      return [
        ...(s.place === 'before' || s.place === 'both' ? [block('before')] : []),
        ...blocks,
        ...(s.place === 'after' || s.place === 'both' ? [block('after')] : []),
      ];
    });

    // The site's basic share links, when these buttons take their place.
    ctx.hooks.filter('render.html', async (html, context) => {
      if (context.route !== 'entry') return html;
      const s = await settingsOf(ctx, context.siteId);
      if (!s.hideCore || s.place === 'none' || !html.includes('cx-share')) return html;
      const types = s.pages ? [...POSTS, 'page'] : POSTS;
      if (!context.entry || !types.includes(context.entry.type) || context.isFrontPage) return html;
      const end = html.search(/<\/head>/i);
      return end >= 0
        ? `${html.slice(0, end)}<style>.cx-share{display:none}</style>${html.slice(end)}`
        : html;
    });
  },
});
