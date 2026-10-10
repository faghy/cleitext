import type { HostShortcut } from '@cleitext/editor-core';
import { useSelect } from '@wordpress/data';
import { store as keyboardShortcutsStore } from '@wordpress/keyboard-shortcuts';
import { displayShortcutList } from '@wordpress/keycodes';

type Modifier = NonNullable<HostShortcut['modifier']>;

interface KeyCombination {
  modifier?: Modifier;
  character: string;
}

/** Shortcuts of the editor shell, registered next to Gutenberg's own. */
export const EDITOR_SHORTCUTS = [
  {
    name: 'cleitext/undo',
    category: 'global',
    description: 'Undo your last changes.',
    keyCombination: { modifier: 'primary', character: 'z' },
  },
  {
    name: 'cleitext/redo',
    category: 'global',
    description: 'Redo your last undo.',
    keyCombination: { modifier: 'primaryShift', character: 'z' },
    aliases: [{ modifier: 'primary', character: 'y' }],
  },
  {
    name: 'cleitext/keyboard-shortcuts',
    category: 'global',
    description: 'Display these keyboard shortcuts.',
    keyCombination: { modifier: 'access', character: 'h' },
  },
];

/** Rich text formats (format-library), which are not in the shortcuts store. */
const TEXT_SHORTCUTS: { description: string; keyCombination: KeyCombination }[] = [
  {
    description: 'Make the selected text bold.',
    keyCombination: { modifier: 'primary', character: 'b' },
  },
  {
    description: 'Make the selected text italic.',
    keyCombination: { modifier: 'primary', character: 'i' },
  },
  {
    description: 'Convert the selected text into a link.',
    keyCombination: { modifier: 'primary', character: 'k' },
  },
  { description: 'Remove a link.', keyCombination: { modifier: 'primaryShift', character: 'k' } },
  {
    description: 'Insert a line break.',
    keyCombination: { modifier: undefined, character: 'Shift+Enter' },
  },
  {
    description: 'Choose a block: type / at the start of an empty paragraph.',
    keyCombination: { character: '/' },
  },
];

function keys(combination: KeyCombination): string[] {
  if (!combination.modifier) return [combination.character];
  return displayShortcutList[combination.modifier](combination.character);
}

function Keys({ combination }: { combination: KeyCombination }) {
  return (
    <span className="cleitext-shortcuts__keys">
      {keys(combination).map((key, index) => (
        <kbd key={index}>{key}</kbd>
      ))}
    </span>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: { description: string; keyCombination: KeyCombination | null }[];
}) {
  const shown = items.filter((item) => item.keyCombination);
  if (shown.length === 0) return null;
  return (
    <section className="cleitext-shortcuts__section">
      <h2>{title}</h2>
      <ul>
        {shown.map((item) => (
          <li key={item.description}>
            <span>{item.description}</span>
            <Keys combination={item.keyCombination!} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Content of the keyboard shortcuts dialog (RF-EDT-06). */
export function ShortcutsHelp({ hostShortcuts }: { hostShortcuts: HostShortcut[] }) {
  const fromStore = useSelect((select) => {
    const store = select(keyboardShortcutsStore) as unknown as {
      getCategoryShortcuts(category: string): string[];
      getShortcutDescription(name: string): string;
      getShortcutKeyCombination(name: string): KeyCombination | null;
    };
    const list = (category: string) =>
      store.getCategoryShortcuts(category).map((name) => ({
        description: store.getShortcutDescription(name),
        keyCombination: store.getShortcutKeyCombination(name),
      }));
    return { global: list('global'), selection: list('selection'), block: list('block') };
  }, []);

  return (
    <div className="cleitext-shortcuts">
      <Section
        title="Global shortcuts"
        items={[
          ...hostShortcuts.map(({ description, modifier, character }) => ({
            description,
            keyCombination: { modifier, character },
          })),
          ...fromStore.global,
        ]}
      />
      <Section title="Selection shortcuts" items={fromStore.selection} />
      <Section title="Block shortcuts" items={fromStore.block} />
      <Section title="Text formatting" items={TEXT_SHORTCUTS} />
    </div>
  );
}
