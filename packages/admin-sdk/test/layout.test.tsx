import type { CustomField, FieldDefinition, FieldValues } from '@cleitext/shared';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  adminFieldType,
  registerAdminFieldType,
  type AdminFieldTypeDefinition,
  type FieldControlProps,
} from '../src/field-types.js';
import { FieldsForm } from '../src/fields-form.js';
import { planLayout } from '../src/layout-fields.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A tab: groups the fields up to the next tab, shows them when open. */
function Tab({ field, layout }: FieldControlProps) {
  const [open, setOpen] = useState(true);
  return (
    <div data-tab={field.name}>
      <button type="button" onClick={() => setOpen(!open)}>
        {String(field.label)}
      </button>
      <span data-index={layout?.index} data-siblings={layout?.siblings.length} />
      {open && layout?.render(layout.fields)}
    </div>
  );
}

const tabType: AdminFieldTypeDefinition = {
  type: 'test/tab',
  component: Tab,
  layout: true,
  groups: (_field, following) => {
    const next = following.findIndex((f) => f.type === 'test/tab');
    return next === -1 ? following.length : next;
  },
};

const text = (name: string, extra: Partial<FieldDefinition> = {}): FieldDefinition =>
  ({ name, type: 'text', label: name.toUpperCase(), ...extra }) as FieldDefinition;
const tab = (name: string): FieldDefinition =>
  ({ name, type: 'test/tab', label: `Tab ${name}` }) as CustomField;

let root: Root | null = null;
let container: HTMLDivElement;

function mount(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(node));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
});

beforeAll(() => {
  registerAdminFieldType(tabType);
  registerAdminFieldType({
    type: 'test/broken',
    component: () => null,
    layout: true,
    groups: () => {
      throw new Error('broken');
    },
  });
  registerAdminFieldType({
    type: 'test/odd',
    component: () => null,
    layout: true,
    groups: () => -3,
  });
  registerAdminFieldType({ type: 'test/plain', component: () => <i>plain</i> });
});

describe('planLayout', () => {
  it('gives layout fields the fields they group, and skips them', () => {
    const fields = [text('a'), tab('t1'), text('b'), text('c'), tab('t2'), text('d')];
    const slots = planLayout(fields, adminFieldType);
    expect(
      slots.map((s) => [s.field.name, s.index, s.layout, s.grouped.map((g) => g.name)]),
    ).toEqual([
      ['a', 0, false, []],
      ['t1', 1, true, ['b', 'c']],
      ['t2', 4, true, ['d']],
    ]);
  });

  it('groups nothing when groups() is missing, fails or is not a count', () => {
    const fields = [
      { name: 'x', type: 'test/broken', label: 'X' } as CustomField,
      { name: 'y', type: 'test/odd', label: 'Y' } as CustomField,
      { name: 'p', type: 'test/plain', label: 'P' } as CustomField,
      { name: 'u', type: 'test/unknown', label: 'U' } as CustomField,
      text('z'),
    ];
    const slots = planLayout(fields, adminFieldType);
    expect(slots.map((s) => [s.field.name, s.layout, s.grouped.length])).toEqual([
      ['x', true, 0],
      ['y', true, 0],
      ['p', false, 0],
      ['u', false, 0],
      ['z', false, 0],
    ]);
  });
});

describe('FieldsForm with layout fields', () => {
  function Form({ fields, start = {} }: { fields: FieldDefinition[]; start?: FieldValues }) {
    const [values, setValues] = useState<FieldValues>(start);
    return (
      <>
        <FieldsForm fields={fields} values={values} onChange={setValues} />
        <output>{JSON.stringify(values)}</output>
      </>
    );
  }

  it('draws grouped fields once, inside the layout field, without its label line', () => {
    const fields = [
      text('a'),
      tab('t1'),
      text('b', { group: 'Heading' }),
      text('c'),
      tab('t2'),
      text('d'),
    ];
    mount(<Form fields={fields} />);
    // One input per value field, none for the tabs.
    expect(container.querySelectorAll('input')).toHaveLength(4);
    const first = container.querySelector('[data-tab="t1"]')!;
    expect(first.querySelectorAll('input')).toHaveLength(2);
    expect(first.textContent).toContain('Heading');
    expect(container.querySelector('[data-tab="t2"]')!.querySelectorAll('input')).toHaveLength(1);
    // No <label> for the tabs: their label is only their own button.
    const labels = [...container.querySelectorAll('label')].map((l) => l.textContent);
    expect(labels).toEqual(['A', 'B', 'C', 'D']);
    const marker = first.querySelector('[data-index]')!;
    expect(marker.getAttribute('data-index')).toBe('1');
    expect(marker.getAttribute('data-siblings')).toBe('6');
  });

  it('changes values of grouped fields, and hides them with the tab', () => {
    mount(<Form fields={[tab('t1'), text('b')]} start={{ b: 'x' }} />);
    const input = container.querySelector('input')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'hello');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(JSON.parse(container.querySelector('output')!.textContent!)).toEqual({ b: 'hello' });
    act(() => container.querySelector('button')!.click());
    expect(container.querySelectorAll('input')).toHaveLength(0);
  });

  it('draws a layout field that groups nothing on its own, and keeps the others', () => {
    mount(
      <Form fields={[text('a'), { name: 'g', type: 'test/odd', label: 'G' } as CustomField]} />,
    );
    expect(container.querySelectorAll('input')).toHaveLength(1);
  });
});
