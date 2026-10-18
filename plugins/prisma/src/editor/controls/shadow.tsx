import { Color, States } from './color';
import { Range, Select } from './fields';
import type { Bind } from './bind';

/** `boxShadowColor`, or `imageBoxShadowColor` with a prefix. */
const key = (prefix: string, name: string) =>
  prefix ? `${prefix}${name}` : name[0]!.toLowerCase() + name.slice(1);

function Shadow({ bind, prefix, hover }: { bind: Bind; prefix: string; hover: boolean }) {
  const h = hover ? 'Hover' : '';
  return (
    <>
      <Color bind={bind} name={key(prefix, `BoxShadowColor${h}`)} label="Color" />
      <Range
        bind={bind}
        label="Horizontal"
        name={key(prefix, `BoxShadowHOffset${h}`)}
        min={-100}
        max={100}
      />
      <Range
        bind={bind}
        label="Vertical"
        name={key(prefix, `BoxShadowVOffset${h}`)}
        min={-100}
        max={100}
      />
      <Range bind={bind} label="Blur" name={key(prefix, `BoxShadowBlur${h}`)} min={0} max={100} />
      <Range
        bind={bind}
        label="Spread"
        name={key(prefix, `BoxShadowSpread${h}`)}
        min={-100}
        max={100}
      />
      <Select
        bind={bind}
        name={key(prefix, `BoxShadowPosition${h}`)}
        label="Position"
        options={[
          { value: 'outset', label: 'Outset' },
          { value: 'inset', label: 'Inset' },
        ]}
      />
    </>
  );
}

/** Box shadow, normal and hover (Spectra's names: `<prefix>BoxShadow…[Hover]`). */
export function BoxShadow({
  bind,
  prefix = '',
  hover = true,
}: {
  bind: Bind;
  prefix?: string;
  hover?: boolean;
}) {
  return hover ? (
    <States
      normal={<Shadow bind={bind} prefix={prefix} hover={false} />}
      hover={<Shadow bind={bind} prefix={prefix} hover />}
    />
  ) : (
    <Shadow bind={bind} prefix={prefix} hover={false} />
  );
}
