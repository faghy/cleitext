/**
 * Languages → Language switcher (Multilingual 1.6.0): how the switcher looks
 * everywhere, where it shows in menus and at the bottom of the page.
 */
import {
  addMessages,
  type AdminPageProps,
  Alert,
  api as coreApi,
  Button,
  Card,
  errorMessage,
  useT,
} from '@cleitext/admin-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { SWITCHER_LINK } from './menus';
import type { SwitcherSettings } from './options';

addMessages('it', {
  'Language switcher': 'Selettore di lingua',
  'One switcher for the whole site: these settings apply to the Language switcher block, to menus, to the bottom of the page and to the header and footer of themes that place it.':
    'Un solo selettore per tutto il sito: queste impostazioni valgono per il blocco Selettore di lingua, per i menu, per il fondo della pagina e per l’intestazione e il piè di pagina dei temi che lo collocano.',
  Look: 'Aspetto',
  Layout: 'Disposizione',
  Dropdown: 'Menu a tendina',
  'Side by side': 'Affiancate',
  'One under the other': 'Una sotto l’altra',
  'Language names': 'Nomi delle lingue',
  'In their own language (Deutsch)': 'Nella loro lingua (Deutsch)',
  'In the page’s language (German)': 'Nella lingua della pagina (Tedesco)',
  'Codes (DE)': 'Codici (DE)',
  'Show flags': 'Mostra le bandiere',
  'List the page’s language too': 'Elenca anche la lingua della pagina',
  'Languages the page is not translated into': 'Lingue in cui la pagina non è tradotta',
  'Link to their home page': 'Collegale alla loro home',
  'Hide them': 'Nascondile',
  'In the theme’s header and footer': 'Nell’intestazione e nel piè di pagina del tema',
  'As the theme suggests (layout, names, flags)':
    'Come suggerisce il tema (disposizione, nomi, bandiere)',
  'With these settings': 'Con queste impostazioni',
  Menus: 'Menu',
  'Add the languages to the menu in': 'Aggiungi le lingue al menu in',
  'No menu': 'Nessun menu',
  Position: 'Posizione',
  'At the end': 'In fondo',
  'At the start': 'All’inizio',
  'In menus': 'Nei menu',
  'The page’s language, the others under it': 'La lingua della pagina, le altre sotto',
  'One item per language': 'Una voce per lingua',
  'Or put it exactly where you want: a custom link with the address {link} in Appearance → Menus becomes the languages.':
    'Oppure mettilo esattamente dove vuoi: un collegamento personalizzato con indirizzo {link} in Aspetto → Menu diventa le lingue.',
  'Add to {menu}': 'Aggiungi a {menu}',
  'In {menu}': 'In {menu}',
  'Bottom of the page': 'Fondo della pagina',
  'Show a switcher on every page': 'Mostra un selettore in ogni pagina',
  Off: 'No',
  'Below the footer': 'Sotto il piè di pagina',
  'Floating in a corner': 'Fluttuante in un angolo',
  Corner: 'Angolo',
  'Bottom right': 'In basso a destra',
  'Bottom left': 'In basso a sinistra',
  Save: 'Salva',
  'Saved.': 'Salvato.',
});

const select = 'w-full rounded border border-slate-300 px-3 py-2 text-sm';

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <select id={id} className={select} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

interface MenuNode {
  id: string;
  kind: 'entry' | 'term' | 'url' | 'custom';
  entryId: string | null;
  termId: string | null;
  url: string | null;
  label: string | null;
  target: '_blank' | null;
  data: Record<string, unknown>;
  children: MenuNode[];
}
interface MenuView {
  id: string;
  name: string;
  locale: string;
  location: string | null;
  items: MenuNode[];
}

/** A menu's items as the menus API takes them back. */
function asInput(items: MenuNode[]): unknown[] {
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    ...(item.entryId ? { entryId: item.entryId } : {}),
    ...(item.termId ? { termId: item.termId } : {}),
    ...(item.url ? { url: item.url } : {}),
    label: item.label,
    target: item.target,
    data: item.data,
    children: asInput(item.children),
  }));
}

const hasSwitcher = (items: MenuNode[]): boolean =>
  items.some(
    (i) => /^#(language-switcher|pll_switcher)/.test(i.url ?? '') || hasSwitcher(i.children),
  );

/** The site's menus, each with a button that adds the switcher link (for those who manage menus). */
function MenuLinks({ canManage }: { canManage: boolean }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const menus = useQuery({
    queryKey: ['multilingual', 'menus'],
    queryFn: () => coreApi<MenuView[]>('GET', '/menus'),
    enabled: canManage,
  });
  const add = useMutation({
    mutationFn: async (id: string) => {
      const menu = await coreApi<MenuView>('GET', `/menus/${id}`);
      await coreApi('PUT', `/menus/${id}/items`, {
        items: [
          ...asInput(menu.items),
          { kind: 'url', url: SWITCHER_LINK, label: t('Language switcher'), children: [] },
        ],
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['multilingual', 'menus'] }),
  });
  if (!canManage || !menus.data?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {add.error && <Alert>{errorMessage(add.error)}</Alert>}
      {menus.data.map((menu) =>
        hasSwitcher(menu.items) ? (
          <span key={menu.id} className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
            ✓ {t('In {menu}', { menu: `${menu.name} (${menu.locale})` })}
          </span>
        ) : (
          <Button
            key={menu.id}
            variant="secondary"
            disabled={add.isPending}
            onClick={() => add.mutate(menu.id)}
          >
            {t('Add to {menu}', { menu: `${menu.name} (${menu.locale})` })}
          </Button>
        ),
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card title={title}>
      <div className="grid max-w-xl gap-4">{children}</div>
    </Card>
  );
}

export function SwitcherPage({ api, user }: AdminPageProps) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const canMenus = user.capabilities.includes('manage_menus');
  const stored = useQuery({
    queryKey: ['multilingual', 'switcher'],
    queryFn: () => api<SwitcherSettings>('GET', '/switcher'),
  });
  const theme = useQuery({
    queryKey: ['multilingual', 'theme'],
    queryFn: () => coreApi<{ menuLocations: Record<string, string> }>('GET', '/themes/current'),
    enabled: canMenus,
  });
  const [draft, setDraft] = useState<SwitcherSettings | null>(null);
  const save = useMutation({
    mutationFn: (settings: SwitcherSettings) => api<SwitcherSettings>('PUT', '/switcher', settings),
    onSuccess: (settings) => {
      queryClient.setQueryData(['multilingual', 'switcher'], settings);
      setDraft(null);
    },
  });
  const value = draft ?? stored.data;
  if (!value) return stored.error ? <Alert>{errorMessage(stored.error)}</Alert> : null;
  const set = <K extends keyof SwitcherSettings>(key: K, v: SwitcherSettings[K]) =>
    setDraft({ ...value, [key]: v });
  const locations = Object.entries(theme.data?.menuLocations ?? {});
  if (value.menuLocation && !locations.some(([k]) => k === value.menuLocation)) {
    locations.push([value.menuLocation, value.menuLocation]);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(value);
      }}
    >
      <h1 className="text-2xl font-semibold">{t('Language switcher')}</h1>
      <p className="max-w-3xl text-sm text-slate-600">
        {t(
          'One switcher for the whole site: these settings apply to the Language switcher block, to menus, to the bottom of the page and to the header and footer of themes that place it.',
        )}
      </p>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && !draft && <Alert kind="success">{t('Saved.')}</Alert>}

      <Section title={t('Look')}>
        <Select
          label={t('Layout')}
          value={value.style}
          onChange={(v) => set('style', v as SwitcherSettings['style'])}
          options={[
            ['dropdown', t('Dropdown')],
            ['inline', t('Side by side')],
            ['list', t('One under the other')],
          ]}
        />
        <Select
          label={t('Language names')}
          value={value.names}
          onChange={(v) => set('names', v as SwitcherSettings['names'])}
          options={[
            ['native', t('In their own language (Deutsch)')],
            ['translated', t('In the page’s language (German)')],
            ['code', t('Codes (DE)')],
          ]}
        />
        <Check label={t('Show flags')} checked={value.flags} onChange={(v) => set('flags', v)} />
        <Check
          label={t('List the page’s language too')}
          checked={value.showCurrent}
          onChange={(v) => set('showCurrent', v)}
        />
        <Select
          label={t('Languages the page is not translated into')}
          value={value.untranslated}
          onChange={(v) => set('untranslated', v as SwitcherSettings['untranslated'])}
          options={[
            ['home', t('Link to their home page')],
            ['hide', t('Hide them')],
          ]}
        />
        <Select
          label={t('In the theme’s header and footer')}
          value={value.themeLook}
          onChange={(v) => set('themeLook', v as SwitcherSettings['themeLook'])}
          options={[
            ['theme', t('As the theme suggests (layout, names, flags)')],
            ['site', t('With these settings')],
          ]}
        />
      </Section>

      <Section title={t('Menus')}>
        <Select
          label={t('Add the languages to the menu in')}
          value={value.menuLocation}
          onChange={(v) => set('menuLocation', v)}
          options={[['', t('No menu')], ...locations]}
        />
        {value.menuLocation && (
          <Select
            label={t('Position')}
            value={value.menuPosition}
            onChange={(v) => set('menuPosition', v as SwitcherSettings['menuPosition'])}
            options={[
              ['end', t('At the end')],
              ['start', t('At the start')],
            ]}
          />
        )}
        <Select
          label={t('In menus')}
          value={value.menuStyle}
          onChange={(v) => set('menuStyle', v as SwitcherSettings['menuStyle'])}
          options={[
            ['dropdown', t('The page’s language, the others under it')],
            ['inline', t('One item per language')],
          ]}
        />
        <p className="text-sm text-slate-600">
          {t(
            'Or put it exactly where you want: a custom link with the address {link} in Appearance → Menus becomes the languages.',
            { link: SWITCHER_LINK },
          )}
        </p>
        <MenuLinks canManage={canMenus} />
      </Section>

      <Section title={t('Bottom of the page')}>
        <Select
          label={t('Show a switcher on every page')}
          value={value.footer}
          onChange={(v) => set('footer', v as SwitcherSettings['footer'])}
          options={[
            ['off', t('Off')],
            ['footer', t('Below the footer')],
            ['floating', t('Floating in a corner')],
          ]}
        />
        {value.footer === 'floating' && (
          <Select
            label={t('Corner')}
            value={value.floatingSide}
            onChange={(v) => set('floatingSide', v as SwitcherSettings['floatingSide'])}
            options={[
              ['right', t('Bottom right')],
              ['left', t('Bottom left')],
            ]}
          />
        )}
      </Section>

      <div>
        <Button type="submit" disabled={save.isPending || !draft}>
          {t('Save')}
        </Button>
      </div>
    </form>
  );
}
