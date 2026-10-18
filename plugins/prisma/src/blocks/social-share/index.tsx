import type { Device, Sheet } from '@cleitext/design';
import { mediaUrl } from '../../lib/background';
import { blockClass } from '../../lib/css';
import { DEVICES, emit, numeric, px, suffix, type Declarations } from '../../lib/emit';
import { Icon } from '../../lib/icons';
import type { Attrs, PrismaBlock, ViewProps } from '../../lib/types';

/**
 * Share links of the page on social networks: a group (`social-share`)
 * holding one item per network (`social-share-item`). The links are plain
 * addresses of each network's share page, written on the server; a small
 * script only completes them with the page's full address (no tracking).
 */

/** Each network's share address, followed by the page's address. */
export const NETWORKS: Record<string, { label: string; url: string; icon: string }> = {
  facebook: { label: 'Facebook', url: 'https://www.facebook.com/sharer.php?u=', icon: 'facebook' },
  twitter: { label: 'X (Twitter)', url: 'https://x.com/intent/tweet?url=', icon: 'x-twitter' },
  linkedin: {
    label: 'LinkedIn',
    url: 'https://www.linkedin.com/sharing/share-offsite/?url=',
    icon: 'linkedin',
  },
  pinterest: {
    label: 'Pinterest',
    url: 'https://pinterest.com/pin/create/link/?url=',
    icon: 'pinterest',
  },
  whatsapp: { label: 'WhatsApp', url: 'https://api.whatsapp.com/send?text=', icon: 'whatsapp' },
  telegram: { label: 'Telegram', url: 'https://telegram.me/share/url?url=', icon: 'telegram' },
  email: { label: 'Email', url: 'mailto:?body=', icon: 'envelope' },
  reddit: { label: 'Reddit', url: 'https://reddit.com/submit?url=', icon: 'reddit' },
  tumblr: {
    label: 'Tumblr',
    url: 'https://www.tumblr.com/widgets/share/tool?canonicalUrl=',
    icon: 'tumblr',
  },
  pocket: { label: 'Pocket', url: 'https://getpocket.com/edit?url=', icon: 'get-pocket' },
  vk: { label: 'VK', url: 'https://vk.com/share.php?url=', icon: 'vk' },
  odnoklassniki: {
    label: 'Odnoklassniki',
    url: 'https://connect.ok.ru/offer?url=',
    icon: 'odnoklassniki',
  },
  xing: { label: 'Xing', url: 'https://www.xing.com/app/user?op=share&url=', icon: 'xing' },
  buffer: { label: 'Buffer', url: 'https://buffer.com/add?url=', icon: 'buffer' },
  digg: { label: 'Digg', url: 'https://digg.com/submit?url=', icon: 'digg' },
  blogger: {
    label: 'Blogger',
    url: 'https://www.blogger.com/blog_this.pyra?t&u=',
    icon: 'blogger',
  },
  skype: { label: 'Skype', url: 'https://web.skype.com/share?url=', icon: 'skype' },
  myspace: { label: 'Myspace', url: 'https://myspace.com/post?u=', icon: 'share-nodes' },
  stumbleupon: {
    label: 'StumbleUpon',
    url: 'https://www.stumbleupon.com/submit?url=',
    icon: 'stumbleupon',
  },
  google: { label: 'Google', url: 'https://plus.google.com/share?url=', icon: 'google' },
};

// ---- Social share (the group) ------------------------------------------------------------

const GROUP_DEFAULTS: Attrs = {
  classMigrate: false,
  childMigrate: false,
  align: 'center',
  alignTablet: 'center',
  alignMobile: 'center',
  social_count: '1',
  socials: [
    {
      type: 'facebook',
      image_icon: 'icon',
      icon: 'facebook',
      image: '',
      icon_color: '#3a3a3a',
      icon_hover_color: '#3a3a3a',
      icon_bg_color: '',
      icon_bg_hover_color: '',
    },
  ],
  gap: 10,
  gapTablet: '',
  gapMobile: '',
  size: 30,
  sizeType: 'px',
  sizeTablet: '',
  sizeMobile: '',
  bgSize: 10,
  bgSizeType: 'px',
  bgSizeTablet: 10,
  bgSizeMobile: 10,
  borderRadius: 0,
  borderRadiusTablet: '',
  borderRadiusMobile: '',
  social_layout: 'horizontal',
  stack: 'none',
  iconColor: '#3a3a3a',
  iconHoverColor: '',
  iconBgColor: '',
  iconBgHoverColor: '',
};

const FLEX = (v: unknown) => (v === 'left' ? 'flex-start' : v === 'right' ? 'flex-end' : 'center');

/** Gap of a device, else the larger device's. */
function gapOf(a: Attrs, device: Device): number {
  const d = numeric(a.gap) ?? 0;
  const t = numeric(a.gapTablet) ?? d;
  return device === 'desktop' ? d : device === 'tablet' ? t : (numeric(a.gapMobile) ?? t);
}

function groupCss(a: Attrs, B: string, sheet: Sheet): void {
  const I = `${B} .pr-social-share-item`;
  const L = `${I} .pr-social-share-item__link`;
  emit(sheet, 'desktop', L, { color: a.iconColor });
  emit(sheet, 'desktop', `${L} svg`, { fill: a.iconColor });
  emit(sheet, 'desktop', `${I}:hover .pr-social-share-item__link`, { color: a.iconHoverColor });
  emit(sheet, 'desktop', `${I}:hover .pr-social-share-item__link svg`, {
    fill: a.iconHoverColor,
  });
  emit(sheet, 'desktop', I, { background: a.iconBgColor });
  emit(sheet, 'desktop', `${I}:hover`, { background: a.iconBgHoverColor });
  const V = `${B}.pr-social-share--layout-vertical`;
  const H = `${B}.pr-social-share--layout-horizontal`;
  emit(sheet, 'desktop', `${V} .pr-social-share-item__link, ${H} .pr-social-share-item__link`, {
    padding: px(a.bgSize),
  });
  const horizontal = a.social_layout === 'horizontal';
  const order: Device[] = ['desktop', 'tablet', 'mobile'];
  for (const device of DEVICES) {
    const s = suffix(device);
    const half = gapOf(a, device) / 2;
    emit(sheet, device, `${V} .pr-social-share-item`, {
      'margin-left': 0,
      'margin-right': 0,
      'margin-top': px(half),
      'margin-bottom': px(half),
    });
    emit(sheet, device, `${H} .pr-social-share-item`, {
      'margin-left': px(half),
      'margin-right': px(half),
    });
    emit(sheet, device, I, { 'border-radius': px(a[`borderRadius${s}`]) });
    const size = px(a[`size${s}`], a.sizeType);
    const desktop = device === 'desktop';
    emit(sheet, device, `${B} .pr-social-share-item__source-wrap`, {
      width: size,
      ...(desktop ? {} : { height: size, 'line-height': size }),
    });
    emit(sheet, device, `${B} .pr-social-share-item__source-wrap svg`, {
      width: size,
      height: size,
    });
    emit(sheet, device, `${B} .pr-social-share-item__source-image`, { width: size });
    emit(sheet, device, `${B} .pr-social-share-item__source-icon`, {
      width: size,
      height: size,
      'font-size': size,
      ...(desktop ? {} : { 'line-height': size }),
    });
    // Horizontal links stacked from a device down: in a column, the gap below each.
    const stack = String(a.stack);
    const stacked =
      horizontal && stack !== 'none' && order.indexOf(device) >= order.indexOf(stack as Device);
    // As Spectra: stacked from the desktop, each device keeps its own column; from
    // tablets or phones, only that device is written (phones follow the tablet rules).
    const writes = stacked && (stack === 'desktop' || stack === device);
    const align = FLEX(a[`align${s}`]);
    const outer: Declarations = writes ? { 'flex-direction': 'column' } : {};
    emit(sheet, device, `${B}.pr-social-share`, {
      ...outer,
      'justify-content': align,
      'align-items': align,
    });
    if (writes) {
      emit(sheet, device, `${B} .pr-social-share-item`, {
        'margin-left': 0,
        'margin-right': 0,
        'margin-bottom': px(a[`gap${s}`]),
      });
    }
  }
}

function GroupView({ attrs: a, id, root }: ViewProps) {
  const layout = a.social_layout === 'vertical' ? 'vertical' : 'horizontal';
  return root(
    'div',
    {
      className: `wp-block-prisma-social-share pr-social-share pr-social-share--layout-${layout} ${blockClass(id)}`,
    },
    null,
    true,
  );
}

export const socialShare: PrismaBlock = {
  name: 'social-share',
  title: 'Social Share',
  description: 'Links that share the page on social networks, by email or on WhatsApp.',
  keywords: ['social', 'share', 'facebook', 'linkedin', 'whatsapp', 'icons'],
  container: true,
  allowedBlocks: ['prisma/social-share-item'],
  defaults: GROUP_DEFAULTS,
  css: groupCss,
  View: GroupView,
  spectra: {
    'uagb/social-share': (a, src) => {
      let children = src.children;
      // Older saves keep the networks in the group's own list.
      if (!children.length && Array.isArray(a.socials)) {
        const count = numeric(a.social_count) ?? a.socials.length;
        children = (a.socials as Attrs[])
          .slice(0, Math.max(0, count))
          .filter((s) => s && typeof s === 'object')
          .map((s) =>
            src.block('social-share-item', {
              type: s.type,
              image_icon: s.image_icon,
              icon: s.icon,
              image: s.image || '',
              icon_color: s.icon_color ?? '',
              icon_hover_color: s.icon_hover_color ?? '',
              icon_bg_color: s.icon_bg_color ?? '',
              icon_bg_hover_color: s.icon_bg_hover_color ?? '',
            }),
          );
      }
      // The networks are the group's items from now on.
      const rest: Attrs = { ...a, childMigrate: true };
      delete rest.socials;
      return [src.block('social-share', rest, children)];
    },
  },
};

// ---- Social share item -------------------------------------------------------------------

const ITEM_DEFAULTS: Attrs = {
  type: 'facebook',
  image_icon: 'icon',
  icon: 'facebook',
  image: '',
  icon_color: '',
  icon_hover_color: '',
  icon_bg_color: '',
  icon_bg_hover_color: '',
  parentSize: 30,
  parentSizeTablet: '',
  parentSizeMobile: '',
  imgTagHeight: 0,
  imgTagWidth: 0,
};

function itemCss(a: Attrs, scope: string, sheet: Sheet): void {
  // Inside the group, so that the item's own colors win over the group's.
  const I = `.pr-social-share ${scope}.pr-social-share-item`;
  const L = `${I} .pr-social-share-item__link`;
  emit(sheet, 'desktop', L, { color: a.icon_color });
  emit(sheet, 'desktop', `${L} svg`, { fill: a.icon_color });
  emit(sheet, 'desktop', `${I}:hover .pr-social-share-item__link`, {
    color: a.icon_hover_color,
  });
  emit(sheet, 'desktop', `${I}:hover .pr-social-share-item__link svg`, {
    fill: a.icon_hover_color,
  });
  emit(sheet, 'desktop', I, { background: a.icon_bg_color });
  emit(sheet, 'desktop', `${I}:hover`, { background: a.icon_bg_hover_color });
}

/** What the item shares: the page's address and its picture (site only). */
export interface ShareData {
  url: string;
  image: string;
}

/** The share address of a network for a page. */
export function shareHref(type: unknown, data: ShareData | undefined): string {
  const network = NETWORKS[String(type)] ?? NETWORKS.facebook!;
  if (!data?.url) return network.url;
  let href = network.url + encodeURIComponent(data.url);
  if (String(type) === 'pinterest' && data.image)
    href += `&media=${encodeURIComponent(data.image)}`;
  return href;
}

function ItemView({ attrs: a, id, root, editing, data }: ViewProps) {
  const type = NETWORKS[String(a.type)] ? String(a.type) : 'facebook';
  const network = NETWORKS[type]!;
  const share = data as ShareData | undefined;
  const image = mediaUrl(a.image);
  const alt =
    a.image && typeof a.image === 'object' && typeof (a.image as { alt?: unknown }).alt === 'string'
      ? String((a.image as { alt: string }).alt)
      : '';
  const width = numeric(a.parentSize);
  const height = numeric(a.imgTagHeight);
  const source =
    a.image_icon === 'image' ? (
      image ? (
        <img
          className="pr-social-share-item__source-image"
          src={image}
          alt={alt}
          {...(width ? { width } : {})}
          {...(height ? { height } : {})}
          loading="lazy"
        />
      ) : null
    ) : a.icon ? (
      <span className="pr-social-share-item__source-icon">
        <Icon name={a.icon} />
      </span>
    ) : null;
  const content = <span className="pr-social-share-item__source-wrap">{source}</span>;
  const label = `Share on ${network.label}`;
  return root(
    'div',
    { className: `wp-block-prisma-social-share-item pr-social-share-item ${blockClass(id)}` },
    editing ? (
      <span className="pr-social-share-item__link" aria-label={label}>
        {content}
      </span>
    ) : (
      <a
        className="pr-social-share-item__link"
        href={shareHref(type, share)}
        aria-label={label}
        rel="noopener noreferrer nofollow"
        {...(type === 'email' ? {} : { target: '_blank' })}
        data-pr-share={network.url}
        {...(type === 'pinterest' && share?.image ? { 'data-pr-media': share.image } : {})}
      >
        {content}
      </a>
    ),
  );
}

export const socialShareItem: PrismaBlock = {
  name: 'social-share-item',
  title: 'Social Share Item',
  description: 'Shares the page on one social network.',
  keywords: ['social', 'share', 'network'],
  parent: ['social-share'],
  script: { file: 'social-share.js', marker: 'data-pr-share' },
  defaults: ITEM_DEFAULTS,
  css: itemCss,
  View: ItemView,
  load: async (_attrs, context) => {
    // The page's address and picture; the script makes them absolute on the page.
    const entry = context.page.entry;
    const image = entry?.featuredImage?.url ?? entry?.image?.url ?? '';
    return { url: entry?.url ?? context.page.site.home, image } satisfies ShareData;
  },
  spectra: {
    'uagb/social-share-child': (a, src) => [src.block('social-share-item', { ...a })],
  },
};
