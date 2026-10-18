import { BaseControl, Button, TextareaControl, TextControl } from '@wordpress/components';
import { useState, type ReactNode } from 'react';
import { plain, value, type Bind } from '../../editor/controls/bind';
import { Border } from '../../editor/controls/border';
import { Color, Gradient, States } from '../../editor/controls/color';
import {
  Choice,
  InspectorTabs,
  Panel,
  Range,
  Select,
  Spacing,
  Text,
  Toggle,
  type Option,
  type Side,
} from '../../editor/controls/fields';
import { Typography } from '../../editor/controls/typography';
import type { Inspector } from '../../editor/register';
import { COUNTRIES } from './countries';
import { optionsOf } from './schema';

const S = (s: Side) => s[0]!.toUpperCase() + s.slice(1);
const ALIGN: Option[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

/** A longer text (messages). */
function LongText({
  bind,
  name,
  label,
  help,
}: {
  bind: Bind;
  name: string;
  label: string;
  help?: string;
}) {
  return (
    <TextareaControl
      __nextHasNoMarginBottom
      label={label}
      help={help}
      value={String(value(bind, name) ?? '')}
      onChange={(text: string) => bind.setAttributes({ [name]: text })}
    />
  );
}

/** Three states of the same settings: Normal, Hover, Active (the inputs' colors). */
function ThreeStates({
  normal,
  hover,
  active,
  labels = ['Normal', 'Hover', 'Active'],
}: {
  normal: ReactNode;
  hover: ReactNode;
  active: ReactNode;
  labels?: [string, string, string];
}) {
  const [state, setState] = useState(0);
  return (
    <div className="pr-states">
      <div className="pr-states__switch" role="group" aria-label="State">
        {labels.map((l, i) => (
          <Button key={l} size="small" isPressed={state === i} onClick={() => setState(i)}>
            {l}
          </Button>
        ))}
      </div>
      {[normal, hover, active][state]}
    </div>
  );
}

const BG_TYPES: Option[] = [
  { value: 'transparent', label: 'Transparent' },
  { value: 'color', label: 'Color' },
  { value: 'gradient', label: 'Gradient' },
];

export const FormSettings: Inspector = ({ attributes, setAttributes, block }) => {
  const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
  const a = { ...block.defaults, ...attributes };
  const captcha = Boolean(a.reCaptchaEnable);
  return (
    <InspectorTabs
      general={
        <>
          <Panel title="General" initialOpen>
            <Toggle bind={bind} name="displayLabels" label="Show Labels" />
            <Text bind={bind} name="formLabel" label="Hidden Field Label" />
            <Choice
              bind={bind}
              name="formStyle"
              label="Style"
              options={[
                { value: 'boxed', label: 'Boxed' },
                { value: 'underlined', label: 'Underlined' },
              ]}
            />
            <Choice
              bind={bind}
              keys={plain('labelAlignment')}
              label="Label Alignment"
              options={ALIGN}
            />
            <Choice
              bind={bind}
              keys={plain('overallAlignment')}
              label="Placeholder Alignment"
              options={ALIGN}
            />
            <Choice
              bind={bind}
              name="confirmationType"
              label="Confirmation Type"
              options={[
                { value: 'message', label: 'Message' },
                { value: 'url', label: 'URL Text' },
              ]}
            />
            {a.confirmationType === 'url' ? (
              <Text
                bind={bind}
                name="confirmationUrl"
                label="Success Redirect URL"
                help="The page to open after the form is sent: an https:// address or a path of the site."
              />
            ) : (
              <>
                <LongText
                  bind={bind}
                  name="confirmationMessage"
                  label="Success Message Text"
                  help="Shown after the form is sent."
                />
                <LongText
                  bind={bind}
                  name="failedMessage"
                  label="Error Message Text"
                  help="Shown when the form could not be sent."
                />
              </>
            )}
          </Panel>
          <Panel title="Submit Button">
            <Toggle bind={bind} name="inheritFromTheme" label="Inherit From Theme" />
            {Boolean(a.inheritFromTheme) && (
              <Choice
                bind={bind}
                name="submitButtonType"
                label="Button Type"
                options={[
                  { value: 'primary', label: 'Primary' },
                  { value: 'secondary', label: 'Secondary' },
                ]}
              />
            )}
            <Choice
              bind={bind}
              keys={plain('buttonAlign')}
              label="Button Alignment"
              options={[...ALIGN, { value: 'full', label: 'Full' }]}
            />
          </Panel>
          <Panel title="Actions">
            <p className="pr-help">
              Enter the e-mail addresses that receive the messages, separated by commas. Without
              one, the address in Settings → Prisma is used.
            </p>
            <Text bind={bind} name="afterSubmitToEmail" label="To" placeholder="Email" />
            <Text bind={bind} name="afterSubmitCcEmail" label="CC" placeholder="Email" />
            <Text bind={bind} name="afterSubmitBccEmail" label="BCC" placeholder="Email" />
            <Text
              bind={bind}
              name="afterSubmitEmailSubject"
              label="Subject"
              placeholder="Subject"
            />
          </Panel>
          <Panel title="Google reCAPTCHA">
            <Toggle bind={bind} name="reCaptchaEnable" label="Enable reCAPTCHA" />
            {captcha && (
              <>
                <p className="pr-help">
                  Set the site and secret keys of Google reCAPTCHA in Settings → Prisma. Do not use
                  forms with different versions on the same page.
                </p>
                <Choice
                  bind={bind}
                  name="reCaptchaType"
                  label="Select Version"
                  options={[
                    { value: 'v2', label: 'V2' },
                    { value: 'v3', label: 'V3' },
                  ]}
                />
                {a.reCaptchaType === 'v2' && (
                  <Text bind={bind} name="captchaMessage" label="Message when not checked" />
                )}
                {a.reCaptchaType === 'v3' && (
                  <Toggle bind={bind} name="hidereCaptchaBatch" label="Hide reCAPTCHA Badge" />
                )}
              </>
            )}
          </Panel>
        </>
      }
      style={
        <>
          <Panel title="Label" initialOpen>
            <States
              normal={<Color bind={bind} name="labelColor" label="Color" />}
              hover={<Color bind={bind} name="labelHoverColor" label="Color" />}
            />
            <Typography bind={bind} prefix="label" />
            <Range
              bind={bind}
              label="Row Spacing"
              keys={plain('fieldGap')}
              unitName="fieldGapType"
              units={['px', 'em']}
              max={100}
            />
            <Range
              bind={bind}
              label="Label Bottom Margin"
              keys={plain('labelGap')}
              unitName="labelGapUnit"
              units={['px', 'em']}
              max={100}
            />
          </Panel>
          <Panel title="Input">
            <Color bind={bind} name="inputColor" label="Color" />
            <ThreeStates
              normal={
                <>
                  <Color bind={bind} name="inputplaceholderColor" label="Placeholder Color" />
                  <Color bind={bind} name="bgColor" label="Background Color" />
                </>
              }
              hover={
                <>
                  <Color bind={bind} name="inputplaceholderHoverColor" label="Placeholder Color" />
                  <Color bind={bind} name="bgHoverColor" label="Background Color" />
                </>
              }
              active={
                <>
                  <Color bind={bind} name="inputplaceholderActiveColor" label="Placeholder Color" />
                  <Color bind={bind} name="bgActiveColor" label="Background Color" />
                </>
              }
            />
            <Spacing
              bind={bind}
              label="Input Padding"
              keys={(side, d) =>
                `paddingField${S(side)}${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}`
              }
              unitKeys={(d) =>
                d === 'desktop'
                  ? 'paddingFieldUnit'
                  : d === 'tablet'
                    ? 'paddingFieldUnitTablet'
                    : 'paddingFieldUnitmobile'
              }
              linkName="paddingFieldLink"
            />
            <Typography bind={bind} prefix="input" />
            {a.formStyle === 'underlined' ? (
              <>
                <Range bind={bind} label="Underline width" name="fieldBorderBottomWidth" max={20} />
                <Select
                  bind={bind}
                  name="fieldBorderStyle"
                  label="Underline style"
                  options={[
                    { value: 'solid', label: 'Solid' },
                    { value: 'dashed', label: 'Dashed' },
                    { value: 'dotted', label: 'Dotted' },
                    { value: 'double', label: 'Double' },
                  ]}
                />
                <States
                  normal={<Color bind={bind} name="fieldBorderColor" label="Underline color" />}
                  hover={<Color bind={bind} name="fieldBorderHColor" label="Underline color" />}
                />
              </>
            ) : (
              <Border bind={bind} prefix="field" />
            )}
          </Panel>
          <Panel title="Checkbox/Toggle/Radio">
            <Range
              bind={bind}
              label="Checkbox/Radio Size"
              keys={plain('toggleSize')}
              unitName="toggleSizeType"
              units={['px', 'em']}
              max={50}
            />
            <Range bind={bind} label="Toggle Size" keys={plain('toggleWidthSize')} max={50} />
            <States
              labels={['Normal', 'Active']}
              normal={
                <>
                  <Color bind={bind} name="toggleColor" label="Background Color" />
                  <Color bind={bind} name="toggleDotColor" label="Element Color" />
                </>
              }
              hover={
                <>
                  <Color bind={bind} name="toggleActiveColor" label="Background Color" />
                  <Color bind={bind} name="toggleDotActiveColor" label="Element Color" />
                </>
              }
            />
            <Border bind={bind} prefix="checkBoxToggle" />
          </Panel>
          {!a.inheritFromTheme && (
            <Panel title="Submit Button">
              <Select
                bind={bind}
                name="buttonSize"
                label="Button Size"
                options={[
                  { value: 'default', label: 'Default' },
                  { value: 'small', label: 'Small' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'large', label: 'Large' },
                  { value: 'extralarge', label: 'Extra Large' },
                  { value: 'full', label: 'Full' },
                ]}
              />
              <States
                normal={
                  <>
                    <Color bind={bind} name="submitColor" label="Color" />
                    <Choice
                      bind={bind}
                      name="submitBgType"
                      label="Background Type"
                      options={BG_TYPES}
                    />
                    {a.submitBgType === 'color' && (
                      <Color bind={bind} name="submitBgColor" label="Background Color" />
                    )}
                    {a.submitBgType === 'gradient' && (
                      <Gradient bind={bind} name="gradientValue" label="Gradient" />
                    )}
                  </>
                }
                hover={
                  <>
                    <Color bind={bind} name="submitColorHover" label="Color" />
                    <Choice
                      bind={{
                        ...bind,
                        // A hover gradient needs its preset switched on.
                        setAttributes: (attrs) =>
                          setAttributes(
                            attrs.submitBgHoverType === 'gradient' &&
                              a.selectHGradient !== 'advanced'
                              ? { ...attrs, selectHGradient: 'basic' }
                              : attrs,
                          ),
                      }}
                      name="submitBgHoverType"
                      label="Background Type"
                      options={BG_TYPES}
                    />
                    {a.submitBgHoverType === 'color' && (
                      <Color bind={bind} name="submitBgColorHover" label="Background Color" />
                    )}
                    {a.submitBgHoverType === 'gradient' && (
                      <Gradient bind={bind} name="gradientHValue" label="Gradient" />
                    )}
                  </>
                }
              />
              <Typography bind={bind} prefix="submitText" />
              <Spacing
                bind={bind}
                label="Button Padding"
                keys={(side, d) =>
                  `paddingBtn${S(side)}${d === 'desktop' ? '' : d === 'tablet' ? 'Tablet' : 'Mobile'}`
                }
                unitKeys={(d) => (d === 'desktop' ? 'paddingBtnUnit' : `${d}PaddingBtnUnit`)}
                linkName="paddingspacingLink"
              />
              <Border bind={bind} prefix="btn" />
            </Panel>
          )}
          <Panel title="Messages">
            <States
              labels={['Success', 'Error']}
              normal={
                <>
                  <Color bind={bind} name="successMessageTextColor" label="Text Color" />
                  <Color bind={bind} name="successMessageBGColor" label="Background Color" />
                  <Border bind={bind} prefix="successMsg" />
                </>
              }
              hover={
                <>
                  <Color bind={bind} name="failedMessageTextColor" label="Text Color" />
                  <Color bind={bind} name="failedMessageBGColor" label="Background Color" />
                  <Border bind={bind} prefix="errorMsg" />
                </>
              }
            />
          </Panel>
          <Panel title="Spacing">
            <Spacing
              bind={bind}
              label="Form Padding"
              keys={(side, d) =>
                `formPadding${S(side)}${d === 'desktop' ? '' : d === 'tablet' ? 'Tab' : 'Mob'}`
              }
              unitKeys={(d) =>
                d === 'desktop'
                  ? 'formPaddingUnit'
                  : d === 'tablet'
                    ? 'formPaddingUnitTab'
                    : 'formPaddingUnitMob'
              }
              linkName="formPaddingLink"
            />
          </Panel>
        </>
      }
    />
  );
};

// ---- Fields -------------------------------------------------------------------------------------

const OFF = { value: 'off', label: 'Off' };

/** The choices of a select, radio or checkbox field: title and value of each. */
function Choices({ bind }: { bind: Bind }) {
  const options = optionsOf({ options: value(bind, 'options') });
  const set = (next: typeof options) => bind.setAttributes({ options: next });
  return (
    <BaseControl __nextHasNoMarginBottom label="Options" className="pr-form-options">
      {options.map((o, i) => (
        <div key={i} className="pr-form-options__row">
          <TextControl
            __nextHasNoMarginBottom
            __next40pxDefaultSize
            label="Title"
            value={o.optiontitle}
            onChange={(t: string) =>
              set(
                options.map((x, j) =>
                  j === i
                    ? {
                        optiontitle: t,
                        optionvalue: x.optionvalue === x.optiontitle ? t : x.optionvalue,
                      }
                    : x,
                ),
              )
            }
          />
          <TextControl
            __nextHasNoMarginBottom
            __next40pxDefaultSize
            label="Value"
            value={o.optionvalue}
            onChange={(v: string) =>
              set(options.map((x, j) => (j === i ? { ...x, optionvalue: v } : x)))
            }
          />
          <Button
            size="small"
            isDestructive
            variant="link"
            onClick={() => set(options.filter((_, j) => j !== i))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() => {
          const label = `Option Name ${options.length + 1}`;
          set([
            ...options,
            { optiontitle: label, optionvalue: `Option Value ${options.length + 1}` },
          ]);
        }}
      >
        Add Option
      </Button>
    </BaseControl>
  );
}

/** One field's settings: a General panel only (and the common Advanced tab). */
function fieldSettings(body: (bind: Bind, a: Record<string, unknown>) => ReactNode): Inspector {
  return function FieldSettings({ attributes, setAttributes, block }) {
    const bind: Bind = { attributes, setAttributes, defaults: block.defaults };
    return (
      <InspectorTabs
        general={
          <Panel title="General" initialOpen>
            {body(bind, { ...block.defaults, ...attributes })}
          </Panel>
        }
      />
    );
  };
}

const NAME_AUTOCOMPLETE: Option[] = [
  OFF,
  { value: 'name', label: 'Full Name' },
  { value: 'honorific-prefix', label: 'Prefix' },
  { value: 'given-name', label: 'First Name' },
  { value: 'additional-name', label: 'Middle Name' },
  { value: 'family-name', label: 'Last Name' },
  { value: 'honorific-suffix', label: 'Suffix' },
  { value: 'username', label: 'Username' },
  { value: 'nickname', label: 'Nickname' },
  { value: 'organization', label: 'Company Name' },
  { value: 'organization-title', label: 'Job Title' },
  { value: 'address-line1', label: 'Address Line 1' },
  { value: 'address-line2', label: 'Address Line 2' },
  { value: 'address-line3', label: 'Address Line 3' },
  { value: 'country-name', label: 'Country' },
  { value: 'postal-code', label: 'Postal / ZIP Code' },
];

export const FormNameSettings = fieldSettings((bind) => (
  <>
    <Select bind={bind} name="autocomplete" label="Autocomplete" options={NAME_AUTOCOMPLETE} />
    <Text bind={bind} name="placeholder" label="Placeholder" />
    <Toggle bind={bind} name="nameRequired" label="Required" />
  </>
));

export const FormEmailSettings = fieldSettings((bind) => (
  <>
    <Select
      bind={bind}
      name="autocomplete"
      label="Autocomplete"
      options={[OFF, { value: 'email', label: 'Email' }]}
    />
    <Text bind={bind} name="placeholder" label="Placeholder" />
    <Toggle bind={bind} name="required" label="Required" />
  </>
));

export const FormUrlSettings = fieldSettings((bind) => (
  <>
    <Select
      bind={bind}
      name="autocomplete"
      label="Autocomplete"
      options={[OFF, { value: 'url', label: 'URL' }]}
    />
    <Text bind={bind} name="placeholder" label="Placeholder" />
    <Toggle bind={bind} name="required" label="Required" />
  </>
));

const CODES: Option[] = [...new Set(COUNTRIES.map((c) => c.code))].map((code) => ({
  value: code,
  label: `${COUNTRIES.find((c) => c.code === code)!.name} (${code})`,
}));

export const FormPhoneSettings = fieldSettings((bind) => (
  <>
    <Select
      bind={bind}
      name="autocomplete"
      label="Autocomplete"
      options={[OFF, { value: 'tel-national', label: 'Phone' }]}
    />
    <Select
      bind={bind}
      name="pattern"
      label="Pattern"
      options={[
        { value: '', label: 'None' },
        { value: '[0-9]{3}-?[0-9]{2}-?[0-9]{3}', label: '123-45-678' },
        { value: '[0-9]{3}-?[0-9]{3}-?[0-9]{4}', label: '123-456-7890' },
        { value: '[0-9]{3}s?[0-9]{3}s?[0-9]{4}', label: '123 456 7890' },
      ]}
    />
    <Select bind={bind} name="selectPhoneCode" label="Default country code" options={CODES} />
    <Toggle bind={bind} name="phoneRequired" label="Required" />
  </>
));

export const FormTextareaSettings = fieldSettings((bind) => (
  <>
    <Select
      bind={bind}
      name="autocomplete"
      label="Autocomplete"
      options={[OFF, { value: 'street-address', label: 'Address' }]}
    />
    <Text bind={bind} name="placeholder" label="Placeholder" />
    <Range bind={bind} name="rows" label="Number of lines" min={1} max={20} />
    <Toggle bind={bind} name="textareaRequired" label="Required" />
  </>
));

export const FormSelectSettings = fieldSettings((bind) => (
  <>
    <Toggle bind={bind} name="selectRequired" label="Required" />
    <Choices bind={bind} />
  </>
));

const LAYOUTS: Option[] = [
  { value: '', label: 'Square' },
  { value: 'round', label: 'Round' },
];

export const FormRadioSettings = fieldSettings((bind) => (
  <>
    <Toggle bind={bind} name="radioRequired" label="Required" />
    <Choice bind={bind} name="layout" label="Layout" options={LAYOUTS} />
    <Choices bind={bind} />
  </>
));

export const FormCheckboxSettings = fieldSettings((bind) => (
  <>
    <Toggle bind={bind} name="checkboxRequired" label="Required" />
    <Choices bind={bind} />
  </>
));

export const FormToggleSettings = fieldSettings((bind) => (
  <>
    <Toggle bind={bind} name="toggleRequired" label="Required" />
    <Toggle bind={bind} name="toggleStatus" label="Default state: on" />
    <Choice bind={bind} name="layout" label="Layout" options={LAYOUTS} />
    <Text bind={bind} name="trueValue" label="True State" />
    <Text bind={bind} name="falseValue" label="False State" />
  </>
));

const YEARS: Option[] = [{ value: '', label: 'YYYY' }];
for (let y = 1930; y <= 2050; y++) YEARS.push({ value: String(y), label: String(y) });
const two = (n: number) => String(n).padStart(2, '0');
const MONTHS: Option[] = [{ value: '', label: 'MM' }];
for (let m = 1; m <= 12; m++) MONTHS.push({ value: two(m), label: two(m) });
const DAYS: Option[] = [{ value: '', label: 'DD' }];
for (let d = 1; d <= 31; d++) DAYS.push({ value: two(d), label: two(d) });

function DateBound({ bind, which }: { bind: Bind; which: 'min' | 'max' }) {
  return (
    <div className="pr-form-date-range">
      <span className="pr-label">{which === 'min' ? 'From' : 'To'}</span>
      <Select bind={bind} name={`${which}Year`} label="Year" options={YEARS} />
      <Select bind={bind} name={`${which}Month`} label="Month" options={MONTHS} />
      <Select bind={bind} name={`${which}Day`} label="Date" options={DAYS} />
    </div>
  );
}

export const FormDateSettings = fieldSettings((bind, a) => {
  const from = [a.minYear, a.minMonth, a.minDay].join('-');
  const to = [a.maxYear, a.maxMonth, a.maxDay].join('-');
  const invalid =
    a.additonalVal && a.minYear && a.minMonth && a.minDay && a.maxYear && a.maxMonth && a.maxDay
      ? from > to
      : false;
  return (
    <>
      <Toggle bind={bind} name="dateRequired" label="Required" />
      <Toggle
        bind={bind}
        name="additonalVal"
        label="Additional Validation"
        help="Helps to set range of calender"
      />
      {Boolean(a.additonalVal) && (
        <>
          <DateBound bind={bind} which="min" />
          <DateBound bind={bind} which="max" />
          {invalid && <p className="pr-help is-error">Invalid date range selected</p>}
        </>
      )}
    </>
  );
});

export const FormHiddenSettings = fieldSettings((bind) => (
  <>
    <Text bind={bind} name="hidden_field_name" label="Name" />
    <Text bind={bind} name="hidden_field_value" label="Value" />
  </>
));

export const FormUploadSettings = fieldSettings((bind) => (
  <>
    <Toggle bind={bind} name="required" label="Required" />
    <Text
      bind={bind}
      name="formats"
      label="Allowed formats"
      help="e.g. .pdf, .jpg, image/* — empty for any file. Messages give the names of the files chosen; the files are not sent."
    />
  </>
));

export const FormAcceptSettings = fieldSettings((bind, a) => (
  <>
    <LongText
      bind={bind}
      name="acceptText"
      label="Acceptance Text"
      help="Label to display as acceptance message."
    />
    <Toggle bind={bind} name="acceptRequired" label="Required" />
    <Toggle bind={bind} name="showLink" label="Enable Privacy Link" />
    {Boolean(a.showLink) && (
      <>
        <Text bind={bind} name="linkLabel" label="Link Label" />
        <Text bind={bind} name="link" label="Link" />
        <Toggle bind={bind} name="linkInNewTab" label="Open in new tab" />
      </>
    )}
  </>
));

/** The settings of the form's blocks, by name (for src/blocks/settings.ts). */
export const FORM_SETTINGS_BY_NAME: Record<string, Inspector> = {
  form: FormSettings,
  'form-name': FormNameSettings,
  'form-email': FormEmailSettings,
  'form-phone': FormPhoneSettings,
  'form-textarea': FormTextareaSettings,
  'form-url': FormUrlSettings,
  'form-select': FormSelectSettings,
  'form-radio': FormRadioSettings,
  'form-checkbox': FormCheckboxSettings,
  'form-toggle': FormToggleSettings,
  'form-date': FormDateSettings,
  'form-hidden': FormHiddenSettings,
  'form-upload': FormUploadSettings,
  'form-accept': FormAcceptSettings,
};
