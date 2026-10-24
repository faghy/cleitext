/**
 * The latest posts as slides: the slider's first slide is the template, and
 * each post gets a copy with its tags filled in, `{{title}}`, `{{excerpt}}`,
 * `{{date}}`, `{{category}}` and `{{author}}`, links "to the post" pointing
 * to it and, when asked, its featured image as the background.
 */
import type { RenderMedia } from '../render/render';
import type { Layer, Link, Slide, SliderData } from './types';

export interface PostItem {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  publishedAt: string | null;
  author: string;
  category: string;
  image: RenderMedia | null;
}

export const POST_TAGS = ['title', 'excerpt', 'date', 'category', 'author'] as const;

export function shorten(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (max <= 0) return '';
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

export function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/** A text with its tags filled in. */
export function fillTags(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    name in values ? values[name]! : match,
  );
}

function fillLink(link: Link, post: PostItem): Link {
  return link.kind === 'post' ? { ...link, value: post.url } : link;
}

function fillLayer(layer: Layer, post: PostItem, values: Record<string, string>, n: number): Layer {
  return {
    ...layer,
    id: `${layer.id}p${n}`,
    content: {
      ...layer.content,
      text: fillTags(layer.content.text, values),
      alt: fillTags(layer.content.alt, values),
      link: fillLink(layer.content.link, post),
    },
    children: layer.children.map((child) => fillLayer(child, post, values, n)),
  };
}

/** The slider with one slide per post (the template's layers, filled in). */
export function expandPosts(
  slider: SliderData,
  posts: PostItem[],
  locale: string,
): { slider: SliderData; media: RenderMedia[] } {
  if (slider.source.kind !== 'posts') return { slider, media: [] };
  return fillTemplate(slider, posts, locale, slider.source.excerptLength);
}

/** The slider's template slide (its first shown one) once per item: posts, or a plugin's items. */
export function fillTemplate(
  slider: SliderData,
  posts: PostItem[],
  locale: string,
  excerptLength = 140,
): { slider: SliderData; media: RenderMedia[] } {
  const template = slider.slides.find((s) => !s.hidden) ?? slider.slides[0];
  if (!template) return { slider: { ...slider, slides: [] }, media: [] };
  const media: RenderMedia[] = [];
  const slides: Slide[] = posts.map((post, n) => {
    const values = {
      title: post.title,
      excerpt: shorten(post.excerpt, excerptLength),
      date: formatDate(post.publishedAt, locale),
      category: post.category,
      author: post.author,
    };
    let background = template.background;
    if (template.background.featured && post.image) {
      media.push(post.image);
      background = {
        ...background,
        kind: 'image',
        image: { id: post.image.id, url: post.image.url },
        alt: '',
      };
    }
    return {
      ...template,
      id: `${template.id}p${n}`,
      name: post.title,
      background,
      link: fillLink(template.link, post),
      layers: template.layers.map((layer) => fillLayer(layer, post, values, n)),
    };
  });
  return { slider: { ...slider, slides }, media };
}
