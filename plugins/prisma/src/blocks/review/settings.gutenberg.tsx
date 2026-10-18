import {
  BaseControl,
  Button,
  DateTimePicker,
  RangeControl,
  TextControl,
} from '@wordpress/components';
import { trash } from '@wordpress/icons';
import { type Bind } from '../../editor/controls/bind';
import { Color } from '../../editor/controls/color';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Select,
  Spacing,
  Text,
  Toggle,
} from '../../editor/controls/fields';
import { Media } from '../../editor/controls/media';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';

interface Part {
  label: string;
  value: number;
}

const SUBTYPES: Record<string, { value: string; label: string }[]> = {
  Book: [{ value: 'Audiobook', label: 'Audio book' }],
  Product: [
    { value: 'IndividualProduct', label: 'Individual product' },
    { value: 'ProductCollection', label: 'Product collection' },
    { value: 'ProductGroup', label: 'Product group' },
    { value: 'ProductModel', label: 'Product model' },
    { value: 'SomeProducts', label: 'Some products' },
    { value: 'Vehicle', label: 'Vehicle' },
  ],
  SoftwareApplication: [
    { value: 'MobileApplication', label: 'Mobile application' },
    { value: 'VideoGame', label: 'Video game' },
    { value: 'WebApplication', label: 'Web application' },
  ],
};

const STATUS = [
  ['', 'Not set'],
  ['Discontinued', 'Discontinued'],
  ['InStock', 'In stock'],
  ['InStoreOnly', 'In store only'],
  ['LimitedAvailability', 'Limited availability'],
  ['OnlineOnly', 'Online only'],
  ['OutOfStock', 'Out of stock'],
  ['PreOrder', 'Pre order'],
  ['PreSale', 'Pre sale'],
  ['SoldOut', 'Sold out'],
].map(([v, label]) => ({ value: v ? `https://schema.org/${v}` : '', label: label! }));

/** The rated features: a name and a rating each (Spectra edits them on the canvas). */
function Ratings({ bind, limit }: { bind: Bind; limit: number }) {
  const raw = bind.attributes.parts ?? bind.defaults.parts;
  const parts: Part[] = Array.isArray(raw)
    ? (raw as Partial<Part>[]).map((p) => ({
        label: String(p?.label ?? ''),
        value: Number(p?.value) || 0,
      }))
    : [];
  const set = (next: Part[]) => bind.setAttributes({ parts: next });
  return (
    <BaseControl __nextHasNoMarginBottom className="pr-review-ratings" label="Ratings">
      {parts.map((part, i) => (
        <div key={i} className="pr-review-ratings__item">
          <TextControl
            __nextHasNoMarginBottom
            __next40pxDefaultSize
            label={`Feature ${i + 1}`}
            value={part.label}
            onChange={(label: string) => set(parts.map((p, j) => (j === i ? { ...p, label } : p)))}
          />
          <RangeControl
            __nextHasNoMarginBottom
            __next40pxDefaultSize
            label="Rating"
            value={part.value}
            min={0}
            max={limit}
            step={0.5}
            withInputField
            onChange={(value?: number) =>
              set(parts.map((p, j) => (j === i ? { ...p, value: value ?? 0 } : p)))
            }
          />
          {parts.length > 1 && (
            <Button
              size="small"
              icon={trash}
              label="Remove this feature"
              isDestructive
              onClick={() => set(parts.filter((_, j) => j !== i))}
            />
          )}
        </div>
      ))}
      <Button variant="secondary" onClick={() => set([...parts, { label: '', value: 0 }])}>
        Add a feature
      </Button>
    </BaseControl>
  );
}

function DateField({ bind, name, label }: { bind: Bind; name: string; label: string }) {
  const current = String(bind.attributes[name] ?? bind.defaults[name] ?? '');
  return (
    <BaseControl __nextHasNoMarginBottom label={label} className="pr-date">
      <DateTimePicker
        currentDate={current && !Number.isNaN(Date.parse(current)) ? current : null}
        onChange={(date: string | null) => bind.setAttributes({ [name]: date ?? '' })}
        is12Hour={false}
      />
    </BaseControl>
  );
}

export const ReviewSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const type = String(a.itemType);
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="General" initialOpen>
            <Select
              bind={bind}
              name="headingTag"
              label="Review title tag"
              options={['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((t) => ({
                value: t,
                label: t.toUpperCase(),
              }))}
            />
            <Choice
              bind={bind}
              name="overallAlignment"
              label="Alignment"
              options={[
                { value: 'left', label: 'Left' },
                { value: 'center', label: 'Center' },
                { value: 'right', label: 'Right' },
              ]}
            />
            <Toggle bind={bind} name="enableSchema" label="Enable schema support" />
            <Toggle bind={bind} name="enableDescription" label="Show review description" />
            <Toggle bind={bind} name="showAuthor" label="Show review author" />
            <Toggle bind={bind} name="showFeature" label="Show ratings" />
            <Toggle bind={bind} name="enableImage" label="Show review image" />
            <Text bind={bind} name="ctaLink" label="Link" placeholder="https://" />
            <Toggle bind={bind} name="ctaTarget" label="Open in new window" />
          </Panel>
          {a.showFeature !== false && (
            <Panel title="Ratings" initialOpen>
              <Range bind={bind} label="Number of stars" name="starCount" min={1} max={10} />
              <Ratings bind={bind} limit={Number(a.starCount) || 5} />
            </Panel>
          )}
          {a.enableImage !== false && (
            <Panel title="Image">
              <Media bind={bind} name="mainimage" label="Image" />
            </Panel>
          )}
          {a.enableSchema !== false && (
            <Panel title="Schema">
              <Select
                bind={bind}
                name="itemType"
                label="Item type"
                options={[
                  { value: 'Book', label: 'Book' },
                  { value: 'Course', label: 'Course' },
                  { value: 'Movie', label: 'Movie' },
                  { value: 'Product', label: 'Product' },
                  { value: 'SoftwareApplication', label: 'Software application' },
                ]}
              />
              {SUBTYPES[type] && (
                <Select
                  bind={bind}
                  name="itemSubtype"
                  label="Item subtype"
                  options={[{ value: '', label: 'None' }, ...SUBTYPES[type]!]}
                />
              )}
              {type === 'Book' && (
                <>
                  <Text bind={bind} name="isbn" label="ISBN" />
                  <Text bind={bind} name="bookAuthorName" label="Book author name" />
                </>
              )}
              {type === 'Course' && (
                <>
                  <Text bind={bind} name="provider" label="Provider" />
                  <Select
                    bind={bind}
                    name="courseMode"
                    label="Mode"
                    options={['Online', 'Onsite', 'Blended'].map((v) => ({ value: v, label: v }))}
                  />
                  {a.courseMode !== 'Online' && (
                    <Text bind={bind} name="courseLocation" label="Location" />
                  )}
                  <Select
                    bind={bind}
                    name="repeatFrequency"
                    label="Frequency"
                    options={['Daily', 'Weekly', 'Monthly', 'Yearly'].map((v) => ({
                      value: v,
                      label: v,
                    }))}
                  />
                  <Range bind={bind} label="Duration" name="repeatCount" min={1} max={100} />
                  <Select
                    bind={bind}
                    name="categoryOfCourse"
                    label="Pricing category"
                    options={['Free', 'Partially Free', 'Subscription', 'Paid'].map((v) => ({
                      value: v,
                      label: v,
                    }))}
                  />
                </>
              )}
              {type === 'SoftwareApplication' && (
                <>
                  <Text bind={bind} name="appCategory" label="Application category" />
                  <Text bind={bind} name="operatingSystem" label="Operating system" />
                </>
              )}
              {type === 'Movie' && (
                <>
                  <Text bind={bind} name="directorname" label="Director name" />
                  <DateField bind={bind} name="datecreated" label="Release date" />
                </>
              )}
              <Text
                bind={bind}
                name="reviewPublisher"
                label="Review publisher"
                help="Required by the review structured data."
              />
              <DateField bind={bind} name="datepublish" label="Date of publish" />
              {type === 'Product' && (
                <>
                  <Text bind={bind} name="brand" label="Brand" />
                  <Text bind={bind} name="sku" label="SKU" />
                  <Text bind={bind} name="identifier" label="Identifier" />
                  <Select
                    bind={bind}
                    name="identifierType"
                    label="Identifier type"
                    options={['nsn', 'mpn', 'gtin8', 'gtin12', 'gtin13', 'gtin14', 'gtin'].map(
                      (v) => ({ value: v, label: v.toUpperCase() }),
                    )}
                  />
                </>
              )}
              {(type === 'Product' || type === 'SoftwareApplication') && (
                <>
                  <Text bind={bind} name="offerCurrency" label="Offer currency" />
                  <Text bind={bind} name="offerPrice" label="Offer price" />
                </>
              )}
              {type === 'Product' && (
                <>
                  <Select bind={bind} name="offerStatus" label="Offer status" options={STATUS} />
                  <DateField bind={bind} name="offerExpiry" label="Price valid until" />
                </>
              )}
            </Panel>
          )}
        </>
      }
      style={
        <>
          <Panel title="Title" initialOpen>
            <Color bind={bind} name="titleColor" label="Color" />
            <Typography bind={bind} prefix="head" />
          </Panel>
          <Panel title="Description">
            <Color bind={bind} name="descColor" label="Color" />
            <Typography bind={bind} prefix="subHead" />
          </Panel>
          <Panel title="Author">
            <Color bind={bind} name="authorColor" label="Color" />
          </Panel>
          <Panel title="Content">
            <Color bind={bind} name="contentColor" label="Color" />
          </Panel>
          <Panel title="Summary">
            <Color bind={bind} name="summaryColor" label="Color" />
            <Typography bind={bind} prefix="content" />
          </Panel>
          <Panel title="Star">
            <Color bind={bind} name="starColor" label="Active color" />
            <Color bind={bind} name="starActiveColor" label="Inactive color" />
            <Color bind={bind} name="starOutlineColor" label="Outline color" />
          </Panel>
          <Panel title="Spacing">
            <Spacing
              bind={bind}
              label="Padding"
              keys={(side, d) => {
                const S = side[0]!.toUpperCase() + side.slice(1);
                return d === 'desktop'
                  ? `${side}Padding`
                  : `padding${S}${d === 'tablet' ? 'Tablet' : 'Mobile'}`;
              }}
              unitKeys={(d) => (d === 'desktop' ? 'paddingUnit' : `${d}PaddingUnit`)}
              linkName="spacingLink"
            />
          </Panel>
        </>
      }
    />
  );
};
