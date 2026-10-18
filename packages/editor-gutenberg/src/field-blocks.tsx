import type { BlockRegistry } from '@cleitext/blocks';
import type { FieldBlockDefinition } from '@cleitext/editor-core';
import { fieldsValidator, labelText, type FieldDefinition } from '@cleitext/shared';
import { MediaUpload, MediaUploadCheck, useBlockProps } from '@wordpress/block-editor';
import { getBlockType, registerBlockType } from '@wordpress/blocks';
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

function jsonType(field: FieldDefinition): 'string' | 'number' | 'boolean' {
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
        icon={(definition.icon ?? 'admin-plugins') as never}
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
  }
}
