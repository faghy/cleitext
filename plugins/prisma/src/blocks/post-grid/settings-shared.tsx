import { useEffect, useState } from 'react';
import { value, type Bind } from '../../editor/controls/bind';
import { Border } from '../../editor/controls/border';
import { Color, States } from '../../editor/controls/color';
import {
  Choice,
  Panel,
  Range,
  Select,
  Spacing,
  Text,
  Toggle,
  type Option,
} from '../../editor/controls/fields';
import { BoxShadow } from '../../editor/controls/shadow';
import { Typography } from '../../editor/controls/typography';
import type { Attrs } from '../../lib/types';
import { apiGet, postTypeOf, taxonomyOf } from './posts';

/** The settings the post blocks share: the query, the parts shown and their style. */

type Label = Record<string, string>;
const label = (name: Label | string | undefined, fallback: string) =>
  typeof name === 'string' ? name : (name?.en ?? Object.values(name ?? {})[0] ?? fallback);

/** Options read once from the admin API. */
function useOptions<T>(path: string | null, map: (data: T) => Option[]): Option[] {
  const [options, setOptions] = useState<Option[]>([]);
  useEffect(() => {
    if (!path) return setOptions([]);
    let live = true;
    apiGet<T>(path)
      .then((data) => live && setOptions(map(data)))
      .catch(() => live && setOptions([]));
    return () => {
      live = false;
    };
    // `map` is a pure function of the data.
  }, [path]);
  return options;
}

export const byDevice = (base: string) => (d: 'desktop' | 'tablet' | 'mobile') =>
  `${base}${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}`;

/** Post type, taxonomy and its terms. */
export function QueryFields({ bind, a, terms = true }: { bind: Bind; a: Attrs; terms?: boolean }) {
  const type = postTypeOf(a.postType);
  const taxonomy = taxonomyOf(a.taxonomyType);
  const types = useOptions<{ slug: string; name: Label }[]>('/content-types', (list) =>
    list.map((t) => ({ value: t.slug, label: label(t.name, t.slug) })),
  );
  // The custom fields of the chosen type, offered for `customFields`.
  const fields = useOptions<{ slug: string; fields?: { name: string; label: Label }[] }[]>(
    '/content-types',
    (list) =>
      (list.find((t) => t.slug === type)?.fields ?? []).map((f) => ({
        value: f.name,
        label: label(f.label, f.name),
      })),
  );
  const taxonomies = useOptions<{ slug: string; name: Label; contentTypes: string[] }[]>(
    '/taxonomies',
    (list) =>
      list
        .filter((t) => !t.contentTypes || t.contentTypes.includes(type))
        .map((t) => ({ value: t.slug, label: label(t.name, t.slug) })),
  );
  const termOptions = useOptions<{ slug: string; name: string }[]>(
    terms ? `/taxonomies/${encodeURIComponent(taxonomy)}/terms` : null,
    (list) => list.map((t) => ({ value: t.slug, label: t.name })),
  );
  const withCurrent = (options: Option[], current: string) =>
    options.some((o) => o.value === current)
      ? options
      : [{ value: current, label: current }, ...options];
  return (
    <>
      <Select bind={bind} name="postType" label="Post Type" options={withCurrent(types, type)} />
      <Select
        bind={bind}
        name="taxonomyType"
        label="Taxonomy"
        options={withCurrent(taxonomies, taxonomy)}
      />
      {terms && (
        <Select
          bind={bind}
          name="categories"
          label="Terms"
          options={[{ value: '', label: 'All' }, ...termOptions]}
        />
      )}
      <Text
        bind={bind}
        name="customFields"
        label="Custom fields to show"
        placeholder="dimensions: Size, technique"
        help={
          fields.length
            ? `Under the title, separated by commas, with an optional label after a colon. Fields of this type: ${fields.map((f) => `${f.value} (${f.label})`).join(', ')}.`
            : 'Under the title, separated by commas, with an optional label after a colon.'
        }
      />
    </>
  );
}

const ORDER_BY: Option[] = [
  { value: 'date', label: 'Date' },
  { value: 'title', label: 'Title' },
  { value: 'rand', label: 'Random' },
  { value: 'modified', label: 'Last Modified' },
  { value: 'menu_order', label: 'Manual order' },
];

/** Exclude current post, how many, offset and order. */
export function QueryOrder({ bind, a, count = true }: { bind: Bind; a: Attrs; count?: boolean }) {
  return (
    <>
      <Toggle bind={bind} name="excludeCurrentPost" label="Exclude Current Post" />
      {count && <Range bind={bind} name="postsToShow" label="Posts Per Page" min={1} max={100} />}
      <Toggle bind={bind} name="enableOffset" label="Offset Starting Post" />
      {Boolean(a.enableOffset) && (
        <Range bind={bind} name="postsOffset" label="Offset By" min={0} max={100} />
      )}
      <Select bind={bind} name="orderBy" label="Order By" options={ORDER_BY} />
      <Select
        bind={bind}
        name="order"
        label="Order"
        options={[
          { value: 'desc', label: 'Descending' },
          { value: 'asc', label: 'Ascending' },
        ]}
      />
    </>
  );
}

/** Columns by device (`columns`, `tcolumns`, `mcolumns`). */
export function Columns({ bind }: { bind: Bind }) {
  return (
    <Range
      bind={bind}
      label="Columns"
      keys={(d) => (d === 'desktop' ? 'columns' : d === 'tablet' ? 'tcolumns' : 'mcolumns')}
      min={1}
      max={8}
    />
  );
}

const SIZES: Option[] = [
  { value: 'thumbnail', label: 'Thumbnail' },
  { value: 'medium', label: 'Medium' },
  { value: 'medium_large', label: 'Medium Large' },
  { value: 'large', label: 'Large' },
  { value: 'full', label: 'Full' },
];
export { SIZES as IMAGE_SIZES };

const TITLE_TAGS: Option[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'p'].map((t) => ({
  value: t,
  label: t === 'span' ? 'Span' : t.toUpperCase(),
}));
export { TITLE_TAGS };

/** The Image panel of the General tab. */
export function ImagePanel({ bind, a, ratio }: { bind: Bind; a: Attrs; ratio?: boolean }) {
  return (
    <Panel title="Image">
      <Toggle bind={bind} name="displayPostImage" label="Show Featured Image" />
      {Boolean(a.displayPostImage) && (
        <>
          {ratio && a.imgPosition !== 'background' && (
            <Select
              bind={bind}
              name="imageRatio"
              label="Image Ratio"
              options={[
                { value: 'inherit', label: 'Inherit' },
                { value: '1-1', label: '1:1' },
                { value: '2-3', label: '3:2' },
                { value: '9-16', label: '16:9' },
                { value: '1-2', label: '2:1' },
              ]}
            />
          )}
          <Select bind={bind} name="imgSize" label="Sizes" options={SIZES} />
          <Choice
            bind={bind}
            name="imgPosition"
            label="Position"
            options={[
              { value: 'top', label: 'Top' },
              { value: 'background', label: 'Background' },
            ]}
          />
          {a.imgPosition === 'background' && (
            <Toggle bind={bind} name="linkBox" label="Link Complete Box" />
          )}
        </>
      )}
    </Panel>
  );
}

/** The Content panel of the General tab. */
export function ContentPanel({ bind, a }: { bind: Bind; a: Attrs }) {
  return (
    <Panel title="Content">
      <Toggle bind={bind} name="displayPostTitle" label="Show Title" />
      {Boolean(a.displayPostTitle) && (
        <Select bind={bind} name="titleTag" label="HTML Tag" options={TITLE_TAGS} />
      )}
      <Toggle bind={bind} name="displayPostAuthor" label="Show Author" />
      <Toggle bind={bind} name="displayPostDate" label="Show Date" />
      <Toggle bind={bind} name="displayPostComment" label="Show Comment" />
      <Toggle bind={bind} name="displayPostTaxonomy" label="Show Taxonomy" />
      {Boolean(a.displayPostTaxonomy) && (
        <>
          <Choice
            bind={bind}
            name="displayPostTaxonomyAboveTitle"
            label="Taxonomy Position"
            options={[
              { value: 'withMeta', label: 'With Meta' },
              { value: 'aboveTitle', label: 'Above Title' },
            ]}
          />
          {a.displayPostTaxonomyAboveTitle === 'aboveTitle' && (
            <>
              <Choice
                bind={bind}
                name="taxStyle"
                label="Taxonomy Style"
                options={[
                  { value: 'default', label: 'Normal' },
                  { value: 'highlighted', label: 'Highlighted' },
                ]}
              />
              {a.taxStyle !== 'highlighted' && (
                <Text bind={bind} name="taxDivider" label="Taxonomy Divider" />
              )}
            </>
          )}
        </>
      )}
      <Toggle bind={bind} name="hideTaxonomyIcon" label="Show Meta Icon" />
      <Toggle bind={bind} name="displayPostExcerpt" label="Show Excerpt" />
      {Boolean(a.displayPostExcerpt) && (
        <>
          <Choice
            bind={bind}
            name="displayPostContentRadio"
            label="Show:"
            options={[
              { value: 'excerpt', label: 'Excerpt' },
              { value: 'full_post', label: 'Full post' },
            ]}
          />
          {a.displayPostContentRadio !== 'full_post' && (
            <Range
              bind={bind}
              name="excerptLength"
              label="Max number of words in excerpt"
              min={1}
              max={500}
            />
          )}
        </>
      )}
    </Panel>
  );
}

/** The Read More Link panel of the General tab. */
export function ReadMorePanel({ bind, a, inline }: { bind: Bind; a: Attrs; inline?: boolean }) {
  return (
    <Panel title="Read More Link">
      <Toggle bind={bind} name="displayPostLink" label="Show Read More Link" />
      {Boolean(a.displayPostLink) && (
        <>
          <Toggle bind={bind} name="inheritFromThemeBtn" label="Inherit From Theme" />
          {Boolean(a.inheritFromThemeBtn) && (
            <Choice
              bind={bind}
              name="buttonType"
              label="Button Type"
              options={[
                { value: 'primary', label: 'Primary' },
                { value: 'secondary', label: 'Secondary' },
              ]}
            />
          )}
          {inline && (
            <Toggle bind={bind} name="equalHeightInlineButtons" label="Buttons on Equal Height" />
          )}
          <Toggle bind={bind} name="newTab" label="Open Links in New Tab" />
          <Text bind={bind} name="ctaText" label="Text" />
        </>
      )}
    </Panel>
  );
}

const side = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Layout of the Style tab: background, gaps, content padding, alignment. */
export function LayoutStyle({
  bind,
  a,
  rowGap = true,
}: {
  bind: Bind;
  a: Attrs;
  rowGap?: boolean;
}) {
  return (
    <Panel title="Layout" initialOpen>
      <Choice
        bind={bind}
        name="align"
        label="Text Alignment"
        options={[
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ]}
      />
      <Color bind={bind} name="bgColor" label="Background Color" />
      <Range
        bind={bind}
        label="Column Gap"
        keys={byDevice('columnGap')}
        unitName="columnGapUnit"
        max={100}
      />
      {rowGap && (
        <Range
          bind={bind}
          label="Row Gap"
          keys={byDevice('rowGap')}
          unitName="rowGapUnit"
          max={100}
        />
      )}
      <Spacing
        bind={bind}
        label="Content Padding"
        keys={(s, d) =>
          `padding${side(s)}${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}`
        }
        unitKeys={(d) => (d === 'desktop' ? 'contentPaddingUnit' : `${d}PaddingUnit`)}
        linkName="spacingLink"
        min={0}
      />
      {a.imgPosition === 'background' && (
        <>
          <Color bind={bind} name="bgOverlayColor" label="Background Overlay Color" />
          <Range bind={bind} name="overlayOpacity" label="Overlay Opacity" max={100} />
        </>
      )}
    </Panel>
  );
}

/** Taxonomy, title, meta, excerpt and read more of the Style tab. */
export function PartsStyle({ bind, a }: { bind: Bind; a: Attrs }) {
  const space = (name: string) => (
    <Range
      bind={bind}
      label="Bottom Spacing"
      keys={byDevice(name)}
      unitName={`${name}Unit`}
      max={100}
    />
  );
  return (
    <>
      {Boolean(a.displayPostTaxonomy) && a.displayPostTaxonomyAboveTitle === 'aboveTitle' && (
        <Panel title="Taxonomy">
          <Color bind={bind} name="metaColor" label="Taxonomy Text Color" />
          {a.taxStyle === 'highlighted' && (
            <>
              <Color bind={bind} name="highlightedTextColor" label="Highlighted Text Color" />
              <Color bind={bind} name="highlightedTextBgColor" label="Highlighted Color" />
            </>
          )}
          {space('taxonomyBottomSpace')}
        </Panel>
      )}
      {Boolean(a.displayPostTitle) && (
        <Panel title="Title">
          <Typography bind={bind} prefix="title" />
          <Color bind={bind} name="titleColor" label="Color" />
          {space('titleBottomSpace')}
        </Panel>
      )}
      <Panel title="Meta">
        <Typography bind={bind} prefix="meta" />
        <Color bind={bind} name="metaColor" label="Meta Color" />
        {space('metaBottomSpace')}
      </Panel>
      {Boolean(a.displayPostExcerpt) && (
        <Panel title="Excerpt">
          <Typography bind={bind} prefix="excerpt" />
          <Color bind={bind} name="excerptColor" label="Color" />
          {space('excerptBottomSpace')}
        </Panel>
      )}
      {Boolean(a.displayPostLink) && (
        <Panel title="Read More Link">
          {!a.inheritFromThemeBtn && (
            <>
              <Typography bind={bind} prefix="cta" />
              <States
                normal={
                  <>
                    <Color bind={bind} name="ctaColor" label="Text Color" />
                    <Select
                      bind={bind}
                      name="ctaBgType"
                      label="Background Type"
                      options={[
                        { value: 'transparent', label: 'Transparent' },
                        { value: 'color', label: 'Color' },
                      ]}
                    />
                    {a.ctaBgType === 'color' && (
                      <Color bind={bind} name="ctaBgColor" label="Background Color" />
                    )}
                  </>
                }
                hover={
                  <>
                    <Color bind={bind} name="ctaHColor" label="Text Color" />
                    <Select
                      bind={bind}
                      name="ctaBgHType"
                      label="Background Type"
                      options={[
                        { value: 'transparent', label: 'Transparent' },
                        { value: 'color', label: 'Color' },
                      ]}
                    />
                    {a.ctaBgHType === 'color' && (
                      <Color bind={bind} name="ctaBgHColor" label="Background Color" />
                    )}
                  </>
                }
              />
              <Spacing
                bind={bind}
                label="Button Padding"
                keys={(s, d) =>
                  `paddingBtn${side(s)}${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}`
                }
                unitKeys={(d) => (d === 'desktop' ? 'paddingBtnUnit' : `${d}PaddingBtnUnit`)}
                linkName="spacingLinkPadding"
                min={0}
              />
              <Border bind={bind} prefix="btn" />
            </>
          )}
          {space('ctaBottomSpace')}
        </Panel>
      )}
      {Boolean(a.displayPostImage) && a.imgPosition !== 'background' && (
        <Panel title="Image">{space('imageBottomSpace')}</Panel>
      )}
    </>
  );
}

/** Border and box shadow of the posts. */
export function BoxStyle({ bind }: { bind: Bind }) {
  return (
    <>
      <Panel title="Border">
        <Border bind={bind} prefix="overall" />
      </Panel>
      <Panel title="Box Shadow">
        <Toggle bind={bind} name="useSeparateBoxShadows" label="Separate Hover Shadow" />
        <BoxShadow bind={bind} hover={Boolean(value(bind, 'useSeparateBoxShadows'))} />
      </Panel>
    </>
  );
}
