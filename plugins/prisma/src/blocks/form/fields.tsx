import { Fragment, type ReactNode } from 'react';
import { blockClass } from '../../lib/css';
import type {
  Attrs,
  PrismaBlock,
  SpectraImporter,
  SpectraSource,
  ViewProps,
} from '../../lib/types';
import { COUNTRIES } from './countries';
import { dateBound, FIELDS, optionsOf, plainText, type FieldKind } from './schema';

/**
 * The fields of a form (inside `prisma/form` only): each draws its label and
 * its input; the input's name is the block's id, which the server matches
 * with the saved page to know the field's label and rules.
 */

const rich = (text: string) => [{ text }];
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** The root of a field. */
function shell(
  kind: FieldKind,
  { id, root }: ViewProps,
  content: ReactNode,
  fieldSet = true,
): ReactNode {
  return root(
    'div',
    {
      className: [
        `wp-block-prisma-form-${kind}`,
        `pr-form-${kind}`,
        fieldSet ? 'pr-form__field' : '',
        blockClass(id),
      ]
        .filter(Boolean)
        .join(' '),
    },
    content,
  );
}

function required(kind: FieldKind, a: Attrs): boolean {
  const key = FIELDS[kind].required;
  return key ? Boolean(a[key]) : false;
}

/** The field's label above the input (rich text). */
function label(kind: FieldKind, { attrs: a, text }: ViewProps, placeholder: string): ReactNode {
  return text(FIELDS[kind].label, {
    tagName: 'div',
    className: `pr-form__label pr-form-${kind}__label${required(kind, a) ? ' is-required' : ''}`,
    placeholder,
  });
}

/** The label as plain text, for screen readers on inputs without a `<label>`. */
const ariaLabel = (kind: FieldKind, a: Attrs) =>
  plainText(a[FIELDS[kind].label]) || FIELDS[kind].fallback;

/** A field type: its block, with what is common to all of them. */
function field(
  kind: FieldKind,
  def: {
    title: string;
    description: string;
    keywords?: string[];
    defaults: Attrs;
    /** Italian texts of the defaults (labels, placeholders, phone code). */
    italian?: Attrs;
    View: (props: ViewProps) => ReactNode;
    spectra: SpectraImporter;
    rich?: boolean;
  },
): PrismaBlock {
  return {
    name: `form-${kind}`,
    title: def.title,
    description: def.description,
    keywords: ['form', 'field', ...(def.keywords ?? [])],
    parent: ['form'],
    ...(def.rich === false ? {} : { richAttributes: [FIELDS[kind].label] }),
    defaults: def.defaults,
    ...(def.italian ? { localized: (lang: string) => (lang === 'it' ? def.italian! : {}) } : {}),
    css: () => {},
    View: def.View,
    spectra: { [`uagb/forms-${kind}`]: def.spectra },
  };
}

/** A Spectra field whose label is kept in the saved HTML (`<div class="…-label">`). */
function importer(kind: FieldKind): SpectraImporter {
  return (a: Attrs, src: SpectraSource) => {
    const html = src.innerAny(`uagb-forms-${kind}-label`);
    const key = FIELDS[kind].label;
    return [src.block(`form-${kind}`, { ...a, ...(html ? { [key]: html } : {}) })];
  };
}

// ---- Text inputs -----------------------------------------------------------------------------

function textInput(kind: 'name' | 'email' | 'url', type: string): (props: ViewProps) => ReactNode {
  return function TextField(props) {
    const a = props.attrs;
    return shell(
      kind,
      props,
      <>
        {label(kind, props, FIELDS[kind].fallback)}
        <input
          type={type}
          placeholder={str(a.placeholder)}
          required={required(kind, a)}
          className={`pr-form__input pr-form-${kind}__input`}
          name={props.id}
          autoComplete={str(a.autocomplete) || 'off'}
          aria-label={ariaLabel(kind, a)}
        />
      </>,
    );
  };
}

export const formName = field('name', {
  title: 'Name',
  description: 'A name field of a form.',
  keywords: ['name'],
  defaults: {
    name: rich('Name'),
    nameRequired: false,
    placeholder: 'John Doe',
    autocomplete: 'name',
  },
  italian: { name: rich('Nome'), placeholder: 'Mario Rossi' },
  View: textInput('name', 'text'),
  spectra: importer('name'),
});

export const formEmail = field('email', {
  title: 'Email',
  description: 'An email address field of a form.',
  keywords: ['email', 'mail'],
  defaults: {
    name: rich('Email'),
    required: false,
    placeholder: 'example@mail.com',
    autocomplete: 'email',
  },
  italian: { placeholder: 'nome@esempio.it' },
  View: textInput('email', 'email'),
  spectra: importer('email'),
});

export const formUrl = field('url', {
  title: 'URL',
  description: 'A web address field of a form.',
  keywords: ['url', 'link', 'website'],
  defaults: {
    name: rich('URL'),
    required: false,
    placeholder: 'https://example.com',
    autocomplete: 'url',
  },
  italian: { name: rich('Sito web'), placeholder: 'https://esempio.it' },
  View: textInput('url', 'url'),
  spectra: importer('url'),
});

// ---- Phone -----------------------------------------------------------------------------------

/** The sample number shown for each pattern of the settings. */
const PHONE_SAMPLES: Record<string, string> = {
  '[0-9]{3}-?[0-9]{2}-?[0-9]{3}': '123-45-678',
  '[0-9]{3}-?[0-9]{3}-?[0-9]{4}': '123-456-7890',
  '[0-9]{3}s?[0-9]{3}s?[0-9]{4}': '123 456 7890',
};

/**
 * The pattern checked by the browser. The spaced one was saved with `s?`
 * (a letter s) where a space is meant: read as `\s?`, so that the number
 * shown as example is accepted.
 */
export function phonePattern(pattern: string): string {
  return pattern === '[0-9]{3}s?[0-9]{3}s?[0-9]{4}' ? '[0-9]{3}\\s?[0-9]{3}\\s?[0-9]{4}' : pattern;
}

function PhoneView(props: ViewProps) {
  const a = props.attrs;
  const pattern = str(a.pattern);
  const code = str(a.selectPhoneCode);
  const selected = COUNTRIES.find((c) => c.code === code)?.iso ?? COUNTRIES[0]!.iso;
  return shell(
    'phone',
    props,
    <>
      {label('phone', props, 'Phone')}
      <div className="pr-form-phone__flex">
        <select
          className="pr-form__input pr-form-phone__country"
          name={props.id}
          defaultValue={selected}
          aria-label="Country code"
        >
          {COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso} data-code={c.code}>
              {`${c.name} (${c.code})`}
            </option>
          ))}
        </select>
        <input
          type="tel"
          {...(pattern
            ? { placeholder: PHONE_SAMPLES[pattern] ?? '', pattern: phonePattern(pattern) }
            : {})}
          required={required('phone', a)}
          className="pr-form__input pr-form-phone__input"
          name={props.id}
          autoComplete={str(a.autocomplete) || 'off'}
          aria-label={ariaLabel('phone', a)}
        />
      </div>
    </>,
  );
}

export const formPhone = field('phone', {
  title: 'Phone',
  description: 'A phone number field of a form, with the country code.',
  keywords: ['phone', 'telephone', 'number'],
  defaults: {
    phoneName: rich('Phone'),
    phoneRequired: false,
    pattern: '[0-9]{3}s?[0-9]{3}s?[0-9]{4}',
    selectPhoneCode: '+44',
    autocomplete: 'tel-national',
  },
  // Italian numbers have no fixed shape: no pattern.
  italian: { phoneName: rich('Telefono'), pattern: '', selectPhoneCode: '+39' },
  View: PhoneView,
  spectra: importer('phone'),
});

// ---- Textarea --------------------------------------------------------------------------------

function TextareaView(props: ViewProps) {
  const a = props.attrs;
  const rows = Math.min(Math.max(Math.round(Number(a.rows)) || 4, 1), 100);
  return shell(
    'textarea',
    props,
    <>
      {label('textarea', props, 'Message')}
      <textarea
        required={required('textarea', a)}
        className="pr-form__input pr-form-textarea__input"
        rows={rows}
        placeholder={str(a.placeholder)}
        name={props.id}
        autoComplete={str(a.autocomplete) || 'off'}
        aria-label={ariaLabel('textarea', a)}
      />
    </>,
  );
}

export const formTextarea = field('textarea', {
  title: 'Textarea',
  description: 'A field of a form for a longer message.',
  keywords: ['textarea', 'message', 'text'],
  defaults: {
    textareaName: rich('Message'),
    textareaRequired: false,
    rows: 4,
    placeholder: 'Enter your message',
    autocomplete: 'off',
  },
  italian: { textareaName: rich('Messaggio'), placeholder: 'Scrivi il tuo messaggio' },
  View: TextareaView,
  spectra: importer('textarea'),
});

// ---- Choices ---------------------------------------------------------------------------------

const OPTIONS = [{ optiontitle: 'Option Name 1', optionvalue: 'Option Value 1' }];

function SelectView(props: ViewProps) {
  const a = props.attrs;
  return shell(
    'select',
    props,
    <>
      {label('select', props, 'Select Title')}
      <select
        className="pr-form__input pr-form-select__box"
        required={required('select', a)}
        name={props.id}
        defaultValue=""
        aria-label={ariaLabel('select', a)}
      >
        <option value="" disabled>
          Select your option
        </option>
        {optionsOf(a).map((o, i) => (
          <option key={i} value={o.optionvalue}>
            {o.optiontitle}
          </option>
        ))}
      </select>
    </>,
  );
}

export const formSelect = field('select', {
  title: 'Select',
  description: 'A dropdown of choices in a form.',
  keywords: ['select', 'dropdown', 'choice'],
  defaults: { selectName: rich('Select Title'), selectRequired: false, options: OPTIONS },
  View: SelectView,
  spectra: importer('select'),
});

function RadioView(props: ViewProps) {
  const a = props.attrs;
  return shell(
    'radio',
    props,
    <>
      {label('radio', props, 'RadioBox Title')}
      {optionsOf(a).map((o, i) => (
        <Fragment key={i}>
          <input
            type="radio"
            id={`pr-radio-${props.id}-${i}`}
            name={props.id}
            value={o.optionvalue}
            required={required('radio', a)}
            {...(a.layout === 'round' ? { className: 'is-round' } : {})}
          />
          <label htmlFor={`pr-radio-${props.id}-${i}`}>{o.optiontitle}</label>
          <br />
        </Fragment>
      ))}
    </>,
  );
}

export const formRadio = field('radio', {
  title: 'Radio',
  description: 'A single choice among options in a form.',
  keywords: ['radio', 'choice', 'option'],
  defaults: {
    radioName: rich('RadioBox Title'),
    radioRequired: false,
    options: OPTIONS,
    layout: 'round',
  },
  View: RadioView,
  spectra: importer('radio'),
});

function CheckboxView(props: ViewProps) {
  const a = props.attrs;
  return shell(
    'checkbox',
    props,
    <>
      {label('checkbox', props, 'Checkbox Title')}
      {optionsOf(a).map((o, i) => (
        <Fragment key={i}>
          <input
            type="checkbox"
            className="pr-form__checkbox"
            id={`pr-checkbox-${props.id}-${i}`}
            name={props.id}
            value={o.optionvalue}
            required={required('checkbox', a)}
          />
          <label htmlFor={`pr-checkbox-${props.id}-${i}`}>{o.optiontitle}</label>
          <br />
        </Fragment>
      ))}
    </>,
  );
}

export const formCheckbox = field('checkbox', {
  title: 'Checkbox',
  description: 'Several choices among options in a form.',
  keywords: ['checkbox', 'choices', 'options'],
  defaults: { checkboxName: rich('Checkbox Title'), checkboxRequired: false, options: OPTIONS },
  View: CheckboxView,
  spectra: importer('checkbox'),
});

// ---- Toggle ----------------------------------------------------------------------------------

function ToggleView(props: ViewProps) {
  const a = props.attrs;
  return shell(
    'toggle',
    props,
    <>
      {label('toggle', props, 'Toggle')}
      <label className="pr-form__switch">
        {/* Sent when the switch is off; when on, the checkbox's value follows it. */}
        <input type="hidden" name={props.id} defaultValue={str(a.falseValue)} />
        <input
          type="checkbox"
          className="pr-form-toggle__input"
          name={props.id}
          value={str(a.trueValue)}
          defaultChecked={Boolean(a.toggleStatus)}
          required={required('toggle', a)}
          aria-label={ariaLabel('toggle', a)}
        />
        <span className={`pr-form__slider${a.layout === 'round' ? ' is-round' : ''}`} />
      </label>
    </>,
  );
}

export const formToggle = field('toggle', {
  title: 'Toggle',
  description: 'An on/off switch in a form.',
  keywords: ['toggle', 'switch'],
  defaults: {
    name: rich('Toggle'),
    toggleRequired: false,
    toggleStatus: false,
    layout: 'round',
    trueValue: 'on',
    falseValue: 'off',
  },
  View: ToggleView,
  spectra: importer('toggle'),
});

// ---- Date ------------------------------------------------------------------------------------

function DateView(props: ViewProps) {
  const a = props.attrs;
  const min = dateBound(a, 'min');
  const max = dateBound(a, 'max');
  return shell(
    'date',
    props,
    <>
      {label('date', props, 'Date')}
      <input
        type="date"
        className="pr-form__input pr-form-date__input"
        required={required('date', a)}
        {...(min ? { min } : {})}
        {...(max ? { max } : {})}
        name={props.id}
        autoComplete={str(a.autocomplete) || 'off'}
        aria-label={ariaLabel('date', a)}
      />
    </>,
  );
}

export const formDate = field('date', {
  title: 'Datepicker',
  description: 'A date field of a form, with an optional range.',
  keywords: ['date', 'calendar', 'datepicker'],
  defaults: {
    name: rich('Date'),
    dateRequired: false,
    additonalVal: false,
    minYear: '',
    minMonth: '',
    minDay: '',
    maxYear: '',
    maxMonth: '',
    maxDay: '',
    autocomplete: 'bday',
  },
  View: DateView,
  spectra: importer('date'),
});

// ---- Hidden ----------------------------------------------------------------------------------

function HiddenView(props: ViewProps) {
  const a = props.attrs;
  return shell(
    'hidden',
    props,
    props.editing ? (
      <div className="pr-form-hidden__preview">
        <span>{str(a.hidden_field_name) || 'Hidden Field Name'}</span>
        <span>{str(a.hidden_field_value)}</span>
      </div>
    ) : (
      <input
        type="hidden"
        className="pr-form-hidden__input"
        name={props.id}
        defaultValue={str(a.hidden_field_value)}
      />
    ),
    false,
  );
}

export const formHidden = field('hidden', {
  title: 'Hidden',
  description: 'A value sent with the form that visitors do not see.',
  keywords: ['hidden', 'value'],
  defaults: { hidden_field_name: 'Hidden Field Name', hidden_field_value: '' },
  View: HiddenView,
  spectra: (a, src) => [src.block('form-hidden', a)],
  rich: false,
});

// ---- Upload ----------------------------------------------------------------------------------

/** `.pdf, .jpg` or `image/*` as given, else nothing (any file). */
function acceptList(value: unknown): string {
  return str(value)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^(\.[\w-]{1,10}|[\w-]+\/[\w.+*-]+)$/.test(s))
    .join(',');
}

function UploadView(props: ViewProps) {
  const a = props.attrs;
  const accept = acceptList(a.formats);
  return shell(
    'upload',
    props,
    <>
      {label('upload', props, 'Upload')}
      <input
        type="file"
        className="pr-form__input pr-form-upload__input"
        name={props.id}
        required={required('upload', a)}
        {...(accept ? { accept } : {})}
        aria-label={ariaLabel('upload', a)}
      />
    </>,
  );
}

export const formUpload = field('upload', {
  title: 'Upload',
  description: 'A file field of a form (the message gives the names of the files chosen).',
  keywords: ['upload', 'file', 'attachment'],
  defaults: { name: rich('Upload'), required: false, formats: '' },
  View: UploadView,
  spectra: importer('upload'),
});

// ---- Accept ----------------------------------------------------------------------------------

function linkHref(value: unknown): string {
  const href = str(value).trim();
  return /^(https?:\/\/|\/|#|mailto:)/i.test(href) ? href : '#';
}

function AcceptView(props: ViewProps) {
  const a = props.attrs;
  const req = required('accept', a);
  return shell(
    'accept',
    props,
    <>
      {Boolean(a.showLink) && (
        <div className="pr-form-accept__link">
          <a
            href={linkHref(a.link)}
            target={a.linkInNewTab ? '_blank' : '_self'}
            rel="noopener noreferrer"
          >
            {str(a.linkLabel)}
          </a>
        </div>
      )}
      <input
        type="checkbox"
        name={props.id}
        required={req}
        value="Agree"
        className="pr-form__checkbox"
        id={`pr-form-accept-${props.id}`}
      />
      <label
        htmlFor={`pr-form-accept-${props.id}`}
        className={`pr-form-accept__label${req ? ' is-required' : ''}`}
      >
        {str(a.acceptText)}
      </label>
      <br />
    </>,
  );
}

export const formAccept = field('accept', {
  title: 'Accept',
  description: 'A checkbox to accept terms, with a link to the privacy policy.',
  keywords: ['accept', 'privacy', 'consent', 'gdpr'],
  defaults: {
    acceptRequired: false,
    acceptText: 'I have read and agree to the Privacy Policy.',
    showLink: false,
    linkLabel: 'Privacy Policy',
    link: '#',
    linkInNewTab: true,
  },
  View: AcceptView,
  spectra: (a, src) => {
    const text = plainText(src.innerAny('uagb-forms-accept-label'));
    const link = plainText(src.innerAny('uagb-forms-accept-privacy-link'));
    return [
      src.block('form-accept', {
        ...a,
        ...(text ? { acceptText: text } : {}),
        ...(link ? { linkLabel: link } : {}),
      }),
    ];
  },
  rich: false,
});

/** Every field, in the inserter's order. */
export const FORM_FIELDS: PrismaBlock[] = [
  formName,
  formEmail,
  formPhone,
  formTextarea,
  formUrl,
  formSelect,
  formRadio,
  formCheckbox,
  formToggle,
  formDate,
  formHidden,
  formUpload,
  formAccept,
];
