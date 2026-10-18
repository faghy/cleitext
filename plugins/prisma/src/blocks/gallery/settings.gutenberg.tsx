import { MediaUpload } from '@wordpress/block-editor';
import { Button } from '@wordpress/components';
import type { Bind } from '../../editor/controls/bind';
import { Border } from '../../editor/controls/border';
import { Color, States } from '../../editor/controls/color';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Select,
  Text,
  Toggle,
} from '../../editor/controls/fields';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import { images } from '.';

/** `columnsDesk`, `columnsTab`, `columnsMob`: the gallery's own names by device. */
const byDevice = (base: string) => (d: 'desktop' | 'tablet' | 'mobile') =>
  `${base}${d === 'desktop' ? 'Desk' : d === 'tablet' ? 'Tab' : 'Mob'}`;
const byDeviceShort = (base: string) => (d: 'desktop' | 'tablet' | 'mobile') =>
  `${base}${d === 'desktop' ? '' : d === 'tablet' ? 'Tab' : 'Mob'}`;

export const GallerySettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const list = images(a);
  const layout = String(a.feedLayout);
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="Images" initialOpen>
            <MediaUpload
              allowedTypes={['image']}
              multiple
              gallery
              value={list.map((m) => m.id)}
              onSelect={(
                media: {
                  id: string;
                  url: string;
                  alt?: string;
                  caption?: string;
                  sizes?: Record<string, { url: string; width?: number; height?: number }>;
                }[],
              ) =>
                setAttributes({
                  mediaGallery: media.map((m) => ({
                    id: m.id,
                    url: m.url,
                    alt: m.alt ?? '',
                    caption: m.caption ?? '',
                    ...(m.sizes ? { sizes: m.sizes } : {}),
                  })),
                  mediaIDs: media.map((m) => m.id),
                  readyToRender: true,
                })
              }
              render={({ open }: { open: () => void }) => (
                <Button variant="secondary" onClick={open}>
                  {list.length ? `Edit gallery (${list.length})` : 'Add images'}
                </Button>
              )}
            />
          </Panel>
          <Panel title="Layout">
            <Select
              bind={bind}
              name="feedLayout"
              label="Layout"
              options={[
                { value: 'grid', label: 'Grid' },
                { value: 'masonry', label: 'Masonry' },
                { value: 'carousel', label: 'Carousel' },
                { value: 'tiled', label: 'Tiled' },
              ]}
            />
            <Range bind={bind} label="Columns" keys={byDevice('columns')} min={1} max={8} />
            <Range bind={bind} label="Gap" keys={byDeviceShort('gridImageGap')} max={100} />
            <Select
              bind={bind}
              name="imageClickEvent"
              label="On click"
              options={[
                { value: 'none', label: 'Nothing' },
                { value: 'lightbox', label: 'Open the lightbox' },
                { value: 'image', label: 'Open the image' },
              ]}
            />
            <Toggle bind={bind} name="disableLazyLoad" label="Load at once (no lazy loading)" />
          </Panel>
          <Panel title="Captions">
            <Toggle bind={bind} name="imageDisplayCaption" label="Show captions" />
            {Boolean(a.imageDisplayCaption) && (
              <>
                <Select
                  bind={bind}
                  name="captionDisplayType"
                  label="Display"
                  options={[
                    { value: 'overlay', label: 'Overlay' },
                    { value: 'bar-inside', label: 'Bar inside' },
                    ...(layout === 'masonry' || layout === 'carousel'
                      ? [{ value: 'bar-outside', label: 'Bar outside' }]
                      : []),
                  ]}
                />
                <Select
                  bind={bind}
                  name="captionVisibility"
                  label="Visibility"
                  options={[
                    { value: 'hover', label: 'Show on hover' },
                    { value: 'antiHover', label: 'Hide on hover' },
                    { value: 'always', label: 'Always' },
                  ]}
                />
                <Select
                  bind={bind}
                  name="imageCaptionAlignment"
                  label="Position"
                  options={['top', 'center', 'bottom'].flatMap((v) =>
                    ['left', 'center', 'right'].map((h) => ({
                      value: `${v} ${h}`,
                      label: `${v} ${h}`,
                    })),
                  )}
                />
                <Text
                  bind={bind}
                  name="imageDefaultCaption"
                  label="Text when there is no caption"
                />
              </>
            )}
          </Panel>
          {a.imageClickEvent === 'lightbox' && (
            <Panel title="Lightbox">
              <Toggle bind={bind} name="lightboxDisplayCaptions" label="Captions" />
              <Toggle bind={bind} name="lightboxThumbnails" label="Thumbnails" />
              <Toggle bind={bind} name="lightboxDisplayCount" label="Image count" />
            </Panel>
          )}
          {layout === 'carousel' && (
            <Panel title="Carousel">
              <Toggle bind={bind} name="carouselAutoplay" label="Autoplay" />
              <Range
                bind={bind}
                label="Autoplay speed (ms)"
                name="carouselAutoplaySpeed"
                min={500}
                max={10000}
                step={100}
              />
              <Toggle bind={bind} name="carouselPauseOnHover" label="Pause on hover" />
              <Toggle bind={bind} name="carouselLoop" label="Loop" />
              <Range
                bind={bind}
                label="Transition speed (ms)"
                name="carouselTransitionSpeed"
                min={100}
                max={3000}
                step={50}
              />
              <Toggle bind={bind} name="carouselSquares" label="Square images" />
              <Toggle bind={bind} name="paginateUseArrows" label="Arrows" />
              <Toggle bind={bind} name="paginateUseDots" label="Dots" />
            </Panel>
          )}
          {(layout === 'grid' || layout === 'masonry') && (
            <Panel title="Pagination">
              <Toggle bind={bind} name="feedPagination" label="Pages" />
              {Boolean(a.feedPagination) && (
                <>
                  <Range
                    bind={bind}
                    label="Images per page"
                    name="paginateLimit"
                    min={1}
                    max={50}
                  />
                  {layout === 'masonry' && (
                    <>
                      <Toggle bind={bind} name="paginateUseLoader" label="Load on scroll" />
                      {!a.paginateUseLoader && (
                        <Text bind={bind} name="paginateButtonText" label="Button text" />
                      )}
                    </>
                  )}
                </>
              )}
            </Panel>
          )}
        </>
      }
      style={
        <>
          <Panel title="Image" initialOpen>
            <Toggle bind={bind} name="imageEnableZoom" label="Zoom on hover" />
            {Boolean(a.imageEnableZoom) && (
              <Choice
                bind={bind}
                name="imageZoomType"
                label="Zoom"
                options={[
                  { value: 'zoom-in', label: 'In' },
                  { value: 'zoom-out', label: 'Out' },
                ]}
              />
            )}
            <Border bind={bind} prefix="image" />
          </Panel>
          {a.imageDisplayCaption ? (
            <Panel title="Caption">
              <States
                normal={
                  <>
                    <Color bind={bind} name="captionColor" label="Text" />
                    <Color bind={bind} name="captionBackgroundColor" label="Background" />
                  </>
                }
                hover={
                  <>
                    <Color bind={bind} name="captionColorHover" label="Text" />
                    <Color bind={bind} name="captionBackgroundColorHover" label="Background" />
                  </>
                }
              />
              <Toggle bind={bind} name="captionSeparateColors" label="Other colors on hover" />
              <Typography bind={bind} prefix="caption" />
            </Panel>
          ) : (
            <Panel title="Overlay">
              <States
                normal={<Color bind={bind} name="overlayColor" label="Color" />}
                hover={<Color bind={bind} name="overlayColorHover" label="Color" />}
              />
            </Panel>
          )}
          {(layout === 'carousel' || Boolean(a.feedPagination)) && (
            <Panel title="Arrows and dots">
              <States
                normal={<Color bind={bind} name="paginateColor" label="Color" />}
                hover={<Color bind={bind} name="paginateColorHover" label="Color" />}
              />
              <Range bind={bind} label="Arrow size" name="paginateArrowSize" max={80} />
              <Range
                bind={bind}
                label="Arrow distance"
                name="paginateArrowDistance"
                min={-100}
                max={100}
              />
              <Range bind={bind} label="Dots distance" name="paginateDotDistance" max={100} />
              {layout === 'carousel' && <Border bind={bind} prefix="arrow" />}
            </Panel>
          )}
          {a.imageClickEvent === 'lightbox' && (
            <Panel title="Lightbox">
              <Color bind={bind} name="lightboxBackgroundColor" label="Background" />
              <Color bind={bind} name="lightboxIconColor" label="Icons" />
              <Color bind={bind} name="lightboxCaptionColor" label="Caption" />
              <Range bind={bind} label="Icon size" name="lightboxIconSize" max={80} />
              <Range
                bind={bind}
                label="Distance from the edge"
                name="lightboxEdgeDistance"
                max={100}
              />
              <Toggle
                bind={bind}
                name="lightboxBackgroundEnableBlur"
                label="Blur the page behind"
              />
            </Panel>
          )}
        </>
      }
      advanced={null}
    />
  );
};
