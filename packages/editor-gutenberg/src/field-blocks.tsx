import type { BlockRegistry } from '@cleitext/blocks';
import type { FieldBlockDefinition } from '@cleitext/editor-core';
import {
  fieldsValidator,
  labelText,
  type FieldDefinition,
  type FieldValues,
  type ListField,
} from '@cleitext/shared';
import { MediaUpload, MediaUploadCheck, useBlockProps } from '@wordpress/block-editor';
import { getBlockType, registerBlockType } from '@wordpress/blocks';
import { useState } from 'react';
import { chevronDown, chevronUp, trash } from '@wordpress/icons';
import { dashiconSvg } from './dashicons';
import {
  Button,
  Placeholder,
  SelectControl,
  TextareaControl,
  TextControl,
  ToggleControl,
} from '@wordpress/components';

type Attributes = Record<string, unknown>;

/**
 * Registers blocks described by their attributes (plugin blocks): their
 * editing form is generated from the field definitions, and the public HTML
 * is rendered by the server, so nothing is saved as markup.
 */
export function registerFieldBlocks(
  blocks: FieldBlockDefinition[],
  registry: BlockRegistry,
  locale: string,
): void {
  for (const definition of blocks) {
    if (!registry.has(definition.type)) {
      registry.register({
        type: definition.type,
        version: definition.version,
        title: definition.title,
        category: definition.category,
        // Blocks with their own editor: any attributes (the server bounds them).
        attrs: fieldsValidator(definition.native ? [] : definition.attributes),
        ...(definition.richAttributes?.length ? { richAttributes: definition.richAttributes } : {}),
        ...(definition.container ? { container: true } : {}),
      });
    }
    // The plugin's editor entry registered it in Gutenberg, with its own edit.
    if (definition.native || getBlockType(definition.type)) continue;
    registerBlockType(definition.type, {
      apiVersion: 3,
      title: definition.title,
      description: definition.description ?? '',
      icon: definition.icon ?? 'admin-plugins',
      category: definition.category,
      attributes: Object.fromEntries(
        definition.attributes.map((field) => [
          field.name,
          {
            type: jsonType(field),
            ...('default' in field && field.default !== undefined
              ? { default: field.default }
              : {}),
          },
        ]),
      ),
      supports: { html: false, reusable: false },
      edit: (props: { attributes: Attributes; setAttributes: (a: Attributes) => void }) => (
        <FieldBlockEdit definition={definition} locale={locale} {...props} />
      ),
      save: () => null,
    } as never);
  }
}

function jsonType(field: FieldDefinition): 'string' | 'number' | 'boolean' | 'array' {
  if (field.type === 'list') return 'array';
  if (field.type === 'number') return 'number';
  if (field.type === 'boolean') return 'boolean';
  return 'string';
}

function FieldBlockEdit({
  definition,
  locale,
  attributes,
  setAttributes,
}: {
  definition: FieldBlockDefinition;
  locale: string;
  attributes: Attributes;
  setAttributes: (attributes: Attributes) => void;
}) {
  const blockProps = useBlockProps();
  return (
    <div {...blockProps}>
      <Placeholder
        icon={dashiconSvg(definition.icon ?? 'admin-plugins')}
        label={definition.title}
        instructions={definition.description ?? 'Shown on the site with the theme styles.'}
        className="cleitext-field-block"
      >
        <div style={{ display: 'grid', gap: 12, width: '100%' }}>
          {definition.attributes.map((field) => (
            <FieldControl
              key={field.name}
              field={field}
              locale={locale}
              value={attributes[field.name]}
              onChange={(value) => setAttributes({ [field.name]: value })}
            />
          ))}
        </div>
      </Placeholder>
    </div>
  );
}

function FieldControl({
  field,
  locale,
  value,
  onChange,
}: {
  field: FieldDefinition;
  locale: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = labelText(field.label, locale);
  const help = labelText(field.help, locale) || undefined;
  const text = typeof value === 'string' ? value : '';
  const common = { label, help, __next40pxDefaultSize: true, __nextHasNoMarginBottom: true };
  switch (field.type) {
    case 'text':
      return field.multiline ? (
        <TextareaControl
          {...common}
          value={text}
          onChange={(v: string) => onChange(v || undefined)}
        />
      ) : (
        <TextControl {...common} value={text} onChange={(v: string) => onChange(v || undefined)} />
      );
    case 'url':
    case 'date':
    case 'datetime':
      return (
        <TextControl
          {...common}
          type={field.type === 'url' ? 'url' : field.type === 'date' ? 'date' : 'datetime-local'}
          value={field.type === 'datetime' && text ? text.slice(0, 16) : text}
          onChange={(v: string) =>
            onChange(!v ? undefined : field.type === 'datetime' ? new Date(v).toISOString() : v)
          }
        />
      );
    case 'number':
      return (
        <TextControl
          {...common}
          type="number"
          min={field.min}
          max={field.max}
          step={field.step ?? 'any'}
          value={typeof value === 'number' ? String(value) : ''}
          onChange={(v: string) => onChange(v === '' ? undefined : Number(v))}
        />
      );
    case 'boolean':
      return (
        <ToggleControl
          label={label}
          help={help}
          checked={value === true}
          onChange={(v: boolean) => onChange(v)}
          __nextHasNoMarginBottom
        />
      );
    case 'select':
      return (
        <SelectControl
          {...common}
          value={text}
          options={[
            { value: '', label: '—' },
            ...field.options.map((o) => ({ value: o.value, label: labelText(o.label, locale) })),
          ]}
          onChange={(v: string) => onChange(v || undefined)}
        />
      );
    case 'media':
      return (
        <MediaUploadCheck>
          <MediaUpload
            allowedTypes={['image']}
            value={text || undefined}
            onSelect={(media: { id: string | number }) => onChange(String(media.id))}
            render={({ open }: { open: () => void }) => (
              <div>
                <p style={{ margin: '0 0 4px', fontSize: 13 }}>{label}</p>
                <Button variant="secondary" onClick={open}>
                  {text ? 'Change image' : 'Choose image'}
                </Button>
                {text && (
                  <Button variant="link" isDestructive onClick={() => onChange(undefined)}>
                    Remove
                  </Button>
                )}
              </div>
            )}
          />
        </MediaUploadCheck>
      );
    case 'list':
      return (
        <ListControl
          field={field}
          locale={locale}
          value={Array.isArray(value) ? (value as FieldValues[]) : []}
          onChange={onChange}
        />
      );
  }
}

/**
 * A list attribute (plugin API 1.43): items added, removed and moved up or
 * down, each one a small form of the list's fields, opened one at a time.
 */
function ListControl({
  field,
  locale,
  value,
  onChange,
}: {
  field: ListField;
  locale: string;
  value: FieldValues[];
  onChange: (value: unknown) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const label = labelText(field.label, locale);
  const help = labelText(field.help, locale);
  const it = locale.startsWith('it');
  const change = (items: FieldValues[]) => onChange(items.length > 0 ? items : undefined);
  const move = (from: number, to: number) => {
    const items = [...value];
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item!);
    change(items);
    setOpen(open === from ? to : open === to ? from : open);
  };
  const defaults = () =>
    Object.fromEntries(
      field.fields.flatMap((f) =>
        'default' in f && f.default !== undefined ? [[f.name, f.default]] : [],
      ),
    );
  const itemTitle = (item: FieldValues, index: number) => {
    const named = field.itemLabel ? item[field.itemLabel] : undefined;
    const text = typeof named === 'string' ? named.replace(/<[^>]*>|\]\([^)]*\)|\[/g, '') : '';
    return text.trim() || `${it ? 'Elemento' : 'Item'} ${index + 1}`;
  };
  return (
    <fieldset className="cleitext-field-list" style={{ border: 0, margin: 0, padding: 0 }}>
      <legend style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', padding: 0 }}>
        {label}
      </legend>
      {help && <p style={{ margin: '4px 0 8px', fontSize: 12, color: '#757575' }}>{help}</p>}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {value.map((item, index) => (
          <li key={index} style={{ border: '1px solid #ddd', borderRadius: 2, padding: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Button
                variant="tertiary"
                aria-expanded={open === index}
                onClick={() => setOpen(open === index ? null : index)}
                style={{ flex: 1, justifyContent: 'flex-start', minWidth: 0 }}
              >
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {itemTitle(item, index)}
                </span>
              </Button>
              <Button
                icon={chevronUp}
                label={it ? 'Sposta su' : 'Move up'}
                size="small"
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              />
              <Button
                icon={chevronDown}
                label={it ? 'Sposta giù' : 'Move down'}
                size="small"
                disabled={index === value.length - 1}
                onClick={() => move(index, index + 1)}
              />
              <Button
                icon={trash}
                label={it ? 'Rimuovi' : 'Remove'}
                size="small"
                isDestructive
                onClick={() => {
                  change(value.filter((_, i) => i !== index));
                  setOpen(null);
                }}
              />
            </div>
            {open === index && (
              <div style={{ display: 'grid', gap: 12, padding: '8px 4px 4px' }}>
                {field.fields.map((sub) => (
                  <FieldControl
                    key={sub.name}
                    field={sub}
                    locale={locale}
                    value={item[sub.name]}
                    onChange={(v) =>
                      change(value.map((x, i) => (i === index ? { ...x, [sub.name]: v } : x)))
                    }
                  />
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      {(field.max === undefined || value.length < field.max) && (
        <Button
          variant="secondary"
          style={{ marginTop: 8 }}
          onClick={() => {
            change([...value, defaults()]);
            setOpen(value.length);
          }}
        >
          {it ? 'Aggiungi' : 'Add'}
        </Button>
      )}
    </fieldset>
  );
}
