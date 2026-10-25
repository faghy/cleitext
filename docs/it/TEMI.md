# Sviluppare temi per Cleitext

> 🇬🇧 Versione di riferimento in inglese: [docs/THEMES.md](../THEMES.md). Questa traduzione è secondaria e può essere meno aggiornata.

Un tema decide l'aspetto del sito pubblico. È un insieme di **componenti React resi sul server**: le pagine arrivano ai visitatori come HTML, senza JavaScript se il tema non ne aggiunge. Aurora, il tema predefinito, è in [`themes/aurora`](../../themes/aurora); un esempio più piccolo è in [`examples/theme-plain`](../../examples/theme-plain).

## 1. Struttura della cartella

```
mio-tema/
├─ theme.json        manifest
├─ src/index.tsx     il tema: defineTheme({ … }) come export predefinito
└─ dist/index.js     generato da `cleitext theme:build`
```

`theme.json` contiene `slug`, `name`, `version`, `description`, `license` ed `entry` (vedi la versione inglese per un esempio completo).

## 2. Build, installazione, attivazione

```bash
cleitext theme:build ./mio-tema         # compila src/index.tsx in dist/index.js
cleitext theme:install ./mio-tema       # lo copia in THEMES_PATH (--link in sviluppo)
cleitext theme:list
cleitext theme:uninstall mio-tema       # solo se nessun sito lo usa (né un tema child)
cleitext theme:child mio-tema mio-child # un suo tema child (§7)
```

I server in esecuzione caricano subito un tema nuovo o aggiornato, senza riavvio. Ogni sito sceglie il proprio tema in **Aspetto → Temi**, dove i super admin possono anche **eliminare** un tema installato che nessun sito usa (Aurora resta). L'**Anteprima dal vivo** mostra le pagine del sito con un tema installato prima di attivarlo. React e `@cleitext/theme-sdk` vengono dal server e non sono mai inclusi nel tema.

I **temi a pagamento** (RF-CAT-03) aggiungono a `theme.json` il loro server delle licenze:

```json
"paid": {
  "licenseServer": "https://cleitext.com/api/v1/ext/store/v1",
  "purchaseUrl": "https://cleitext.com/store/mio-tema"
}
```

Un tema così si può installare e provare con l'Anteprima dal vivo senza licenza (la demo), ma un sito può attivarlo solo dopo aver inserito una chiave di licenza per quel sito in **Aspetto → Temi**. La chiave viene verificata una volta con il server delle licenze e conservata cifrata; le pagine non interrogano mai il server, e il tema continua a funzionare se la licenza viene tolta o i suoi aggiornamenti finiscono. Gli aggiornamenti dal catalogo richiedono una licenza i cui aggiornamenti includano la nuova versione (altrimenti _Rinnova per aggiornare_). Il codice resta GPL: la licenza compra download, aggiornamenti e assistenza.

**Plugin che vengono con il tema** (API 1.25): un tema può portare i suoi plugin, per esempio un page builder, già compilati, nel suo pacchetto in `plugins/<slug>/`, e nominarli in `theme.json`:

```json
"plugins": ["mio-tema-builder"]
```

`theme:install` (e quindi Carica tema e il catalogo) li installa con il tema. Una copia già installata nella stessa versione o in una più recente resta com'è. Quando un sito attiva il tema, si attivano anche lì; quando sceglie un altro tema si disattivano quelli attivati dal tema, tenendo i loro dati (un plugin che il sito usava già prima del tema resta attivo). Un plugin che non può partire non ferma il tema: **Aspetto → Temi** dice perché.

## 3. La definizione del tema

`defineTheme({ … })` riceve:

| Proprietà          | A cosa serve                                                                                                                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Layout`           | La pagina attorno a ogni template: `<html>`, `<head>` (con `<HeadTags>` per `head.tags`), intestazione, piè di pagina.                                                                                                                                                |
| `templates`        | Componenti per nome; `index` è obbligatorio. I nomi più specifici hanno la precedenza (ARCHITETTURA §12.2).                                                                                                                                                           |
| `css`              | Foglio di stile incluso in ogni pagina. Tienilo piccolo.                                                                                                                                                                                                              |
| `menuLocations`    | Posizioni per i menu, assegnati in Aspetto → Menu; si leggono con `usePage().menus`.                                                                                                                                                                                  |
| `settings`         | Campi mostrati in Aspetto → Personalizza (§4).                                                                                                                                                                                                                        |
| `areas`            | Aree composte di blocchi (§5).                                                                                                                                                                                                                                        |
| `settingsSections` | Schede di Aspetto → Personalizza: `[{ id, label, description?, parent?, tabs? }]`; un campo ci va con `section` (§4).                                                                                                                                                 |
| `presets`          | Stili pronti: `[{ id, label, values }]`, applicati in Personalizza prima di pubblicare (§4).                                                                                                                                                                          |
| `entryFields`      | Opzioni per pagina, `{ types?, fields }`, mostrate nella scheda Documento dell'editor (§4).                                                                                                                                                                           |
| `pageTemplates`    | Modelli di pagina scelti nella barra laterale dell'editor, `[{ name, label, types? }]` (tipi predefiniti: `['page']`); la scelta della voce è `entry.template` e il componente `template-<name>` è provato per primo (§4, API dei plugin 1.47).                       |
| `optionsPages`     | Pagine di opzioni del tema, `[{ slug, title, parent?, icon?, position?, capability?, fields }]`: pagine di impostazioni per tutto il sito nel menu dell'admin, lette con `useOption` (§4, API dei plugin 1.48).                                                       |
| `menuItemFields`   | Opzioni di ogni voce di menu, `[{ field, levels? }]`, mostrate in Aspetto → Menu e lette da `MenuItemView.data` (§4, API dei plugin 1.34).                                                                                                                            |
| `relatedEntries`   | Quanti contenuti correlati mostrare sotto un contenuto (al massimo 12): `entry.related` li contiene, prima stesse categorie, poi stessi tag (core 0.37).                                                                                                              |
| `listTerms`        | `true`: gli elenchi (blog, archivi, ricerca) danno categorie e tag di ogni contenuto in `entries[].terms` (core 0.46).                                                                                                                                                |
| `adjacentEntries`  | `true`: i contenuti ricevono il precedente e il successivo dello stesso tipo in `entry.adjacent` (`prev`, `next`), per i link "Precedente / Successivo" (core 0.46).                                                                                                  |
| `importSettings`   | `(data) => values \| null`: trasforma le impostazioni esportate da un altro sistema (un file importato in Personalizza → ⋯ → Importa: il JSON già letto, oppure il testo del file se non è JSON) nei valori del tema; quelli non validi vengono scartati (core 0.46). |
| `editorCss`        | CSS per l'editor a blocchi, perché i contenuti abbiano lo stesso aspetto del sito mentre si scrive. Una stringa, o una funzione delle impostazioni.                                                                                                                   |
| `comments`         | `'auto'` (predefinito): commenti, mi piace e condivisione seguono `<EntryContent>` nelle voci che li hanno. `'manual'`: li posiziona il tema.                                                                                                                         |

I template ricevono la pagina come props (`kind`: `entry`, `archive`, `search`, `404`, `maintenance`) e leggono il resto con `usePage()`. Il Layout trova le stesse props in `usePage().view`, per cambiare classi del body o barre laterali secondo il tipo di pagina. Non interrogano mai il database.

Avvolgi in `<Location>` le parti che un theme builder può sostituire: `header`, `footer`, `single` (il contenuto della pagina di una voce; passa `entry`) e `archive` (archivi e risultati di ricerca). Se nessun plugin le riempie, si vede il markup del tema:

```tsx
<Location name="header"><header className="site-header">…</header></Location>
<Location name="single" entry={entry}><article>…</article></Location>
```

I punti di aggancio (API dei plugin 1.33) si chiamano `hook:<nome>`, con il prefisso del tema (`hook:miotema_header_before`, lettere, cifre, `_` e `-`). Senza figli non mostrano nulla finché un plugin non li riempie con `render.locations`: aggiungili liberamente dove un plugin può voler inserire contenuti (prima e dopo l'header, il contenuto, i commenti, il footer…). Una posizione riempita è avvolta in `<div class="cx-location cx-location-hook-<nome>">`:

```tsx
<Location name="hook:miotema_header_before" />
```

Il contenuto di una voce si mostra con `<EntryContent document={…} />`. Dentro un editor visuale (il page builder di un plugin) mostra invece un elemento vuoto `[data-cx-editor-canvas]` che l'editor riempie: così la pagina si modifica nel layout del tema. Quando l'editor nasconde il titolo (`entry.document.editor?.data?.hideTitle === true`, come fa l'impostazione di pagina di Fresco), non mostrare l'intestazione con il titolo della voce, così la pagina ha un solo `h1`. Non mostrare l'immagine in evidenza sopra il contenuto quando lo chiede (`hideFeatured === true`) e con i suoi layout `full` e `canvas` (`layout`): la pagina è disegnata nell'editor.

### Commenti, mi piace, account e autori

Il blog funziona come in WordPress senza codice nel tema: con `comments: 'auto'` (il predefinito) il box dell'autore (quando l'autore ha scritto una biografia), i pulsanti mi piace e condividi e i commenti con il loro modulo seguono `<EntryContent>` nelle voci il cui tipo ha i commenti, e le pagine dell'account (`/account`, `/account/login`, `/account/register`…) si mostrano dentro il layout del tema. Il markup usa classi `cx-` con un piccolo foglio di stile predefinito, aggiunto solo alle pagine che lo usano; il tema le ridefinisce nel suo CSS.

Per posizionarli da sé, imposta `comments: 'manual'` e usa i componenti:

| Componente                 | Cosa mostra                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `<EntryCommunity />`       | Tutto quanto segue, nell'ordine predefinito.                                                   |
| `<Comments />`             | I commenti (discussioni, pagine, avvisi) e il modulo; "i commenti sono chiusi" quando lo sono. |
| `<EntryActions />`         | Pulsante mi piace e link di condivisione.                                                      |
| `<AuthorBox />`            | Foto, nome, biografia e link dell'autore della voce; `variant="page"` negli archivi autore.    |
| `<CommentText text={…} />` | Un commento o una biografia in paragrafi con i link.                                           |

Leggono la voce da `usePage()`; passa `entry` per mostrarne un'altra. `usePage()` dà anche `viewer` (il visitatore che ha effettuato l'accesso, null nelle pagine in cache) e `urls` (`login`, `register`, `account`, `logout`). `entry.author` ha `displayName`, `url` (l'archivio dell'autore), `bio`, `website` e `avatarUrl`.

Gli archivi autore (`/author/<slug>`) sono archivi con `props.author`; i template `author-<slug>` e `author` vengono provati prima di `archive`. Elencano gli articoli pubblicati della persona ed esistono solo per chi ne ha.

## 4. Impostazioni

I campi usano gli stessi tipi dei campi personalizzati ([PLUGIN.md §14](PLUGIN.md#14-riferimento-tipi-di-campo)). Gli amministratori li modificano in **Aspetto → Personalizza** con l'anteprima dal vivo; i valori vengono controllati sullo schema. Si leggono con `useThemeSettings()`; i campi media contengono un id e il file è precaricato in `usePage().media`.

**L'icona del sito è obbligatoria** (RF-THM-12). Ogni tema costruito per Cleitext ha un'impostazione media che si chiama esattamente `favicon` e la scrive nell'head di ogni pagina (se è vuota: l'icona del tema o il marchio di Cleitext). Il core risponde a `/favicon.ico` con quella, per i browser, i preferiti e i lettori di feed che la chiedono lì.

```tsx
settings: [
  { name: 'favicon', type: 'media', label: { en: 'Site icon (favicon)', it: 'Icona del sito (favicon)' } },
],
// Nel Layout:
const favicon = settings.favicon ? page.media.get(settings.favicon) : undefined;
<link rel="icon" href={favicon?.url ?? ICON} />
{favicon && <link rel="apple-touch-icon" href={favicon.url} />}
```

Con molte impostazioni, raggruppale come un pannello del tema:

```tsx
settingsSections: [
  { id: 'header', label: 'Intestazione' },
  { id: 'colors', label: 'Colori', description: 'I colori di ogni area del sito.' },
],
settings: [
  { name: 'headerLayout', type: 'choice', section: 'header', label: 'Disposizione', display: 'buttons',
    options: [{ value: 'left', label: 'Logo a sinistra' }, { value: 'center', label: 'Centrato' }], default: 'left' },
  { name: 'sticky', type: 'boolean', section: 'header', label: 'Intestazione fissa', default: true },
  { name: 'shrink', type: 'boolean', section: 'header', label: 'Si riduce scorrendo', showIf: { field: 'sticky', equals: true } },
  { name: 'accent', type: 'color', section: 'colors', group: 'Area principale', label: 'Accento', default: '#0f766e' },
],
presets: [{ id: 'dark', label: 'Scuro', values: { accent: '#38bdf8' } }],
```

Personalizza mostra una scheda per sezione (i campi senza sezione vanno in "Altro"), una ricerca su tutte le opzioni, gli stili pronti, esportazione e importazione in JSON e "Ripristina questa sezione". Una sezione con `tabs: [{ id: 'general', label: 'Generale' }, { id: 'design', label: 'Design' }]` le mostra sopra i suoi campi; un campo va in una con `tab` (nella prima, senza). Niente arriva al sito finché non premi **Pubblica**. L'anteprima si può vedere a larghezza desktop, tablet e mobile.

### Costruttori di intestazione e piè di pagina

Un campo `zones` è un costruttore a trascinamento: righe divise in zone dove si mettono gli elementi, con un layout per desktop e uno per tablet/mobile. In Personalizza si apre sotto l'anteprima mentre è aperta la sua sezione, o quella di una sua riga o di un suo elemento.

```tsx
settingsSections: [
  { id: 'header', label: 'Costruttore intestazione' },
  { id: 'header-logo', label: 'Identità del sito', parent: 'header' },
  { id: 'header-main', label: 'Riga principale', parent: 'header' },
],
settings: [
  { name: 'headerLayout', type: 'zones', section: 'header', label: 'Intestazione',
    devices: ['desktop', 'mobile'],
    rows: [
      { name: 'main', label: 'Riga principale', section: 'header-main', zones: [
        { name: 'left' }, { name: 'left-center', whenUsed: 'center' }, { name: 'center' },
        { name: 'right-center', whenUsed: 'center' }, { name: 'right' }] },
      { name: 'offcanvas', label: 'Off-canvas', devices: ['mobile'], stacked: true, zones: [{ name: 'main' }] },
    ],
    items: [
      { name: 'logo', label: 'Logo', section: 'header-logo' },
      { name: 'menu', label: 'Menu' },
      { name: 'toggle', label: 'Pulsante menu', devices: ['mobile'] },
    ],
    default: { desktop: { main: { left: ['logo'], right: ['menu'] } },
               mobile: { main: { left: ['logo'], right: ['toggle'] }, offcanvas: { main: ['menu'] } } } },
],
```

- Un clic su un elemento, o sull'ingranaggio di una riga, apre la sua `section`. Le sezioni con `parent` sono elencate sotto di essa, solo mentre è aperta lei o una sorella.
- `whenUsed` nasconde una zona finché un'altra (o lei stessa) non contiene elementi, e `devices` limita una zona ad alcuni dispositivi. `columnsField` indica un campo numerico che dice quante zone della riga si usano (le colonne di una riga del piè di pagina). `devices` e `rows` limitano dove può andare una riga o un elemento. `stacked` dispone in colonna le zone di una riga.
- Ogni elemento si usa al massimo una volta per dispositivo; il valore è `{ desktop: { riga: { zona: ['logo'] } }, mobile: {…} }`, controllato sulla definizione. Si legge con `zoneItems(value, device, row, zone)` da `@cleitext/theme-sdk`.
- Metti `data-customize="<sezione>"` sulle parti della pagina disegnate da un elemento o da una riga: nell'anteprima una matita su di esse apre quella sezione. I link nell'anteprima cambiano la pagina mostrata.

I plugin possono aggiungere a un tema impostazioni, sezioni, elementi del costruttore, stili pronti e aree ([PLUGIN.md, Estendere le opzioni di un tema](PLUGIN.md#estendere-le-opzioni-di-un-tema-api-dei-plugin-132)): mentre un plugin del genere è attivo nel sito, `useThemeSettings()` contiene anche i valori dei suoi campi, controllati e con i predefiniti come quelli del tema. Si leggono per nome, e mancano quando il plugin non è attivo.

`entryFields` aggiunge opzioni alle singole pagine (per esempio una barra laterale o un'intestazione trasparente per pagina). Chi scrive le imposta nella scheda Documento dell'editor a blocchi; sono salvate con il contenuto in `document.editor.data` e il tema le legge da `entry.document.editor?.data`. `types` le limita ad alcuni tipi di contenuto (`['page']`). Dall'API dei plugin 1.47 sono un gruppo di campi del tema (id `theme`) come gli altri, elencato con i gruppi del sito e dei plugin; per il tema non cambia niente.

**Modelli di pagina** (API dei plugin 1.47), come quelli di WordPress: `pageTemplates: [{ name: 'landing', label: { en: 'Landing page', it: 'Pagina di atterraggio' } }]` li offre nella barra laterale dell'editor (**Modello**) per i `types` (predefinito `['page']`). La scelta della voce è `entry.template` (null per quello predefinito), e `template-<name>` è il primo componente provato per lei (`templates: { index, 'template-landing': Landing }`); senza, si provano i soliti, quindi un tema può anche solo leggere `entry.template` (per esempio una classe sul contenuto). I gruppi di campi possono comparire solo sulle voci con un modello (regola `template`), così il proprietario del sito aggiunge i campi che servono a una pagina di atterraggio.

<a id="campi-personalizzati"></a>**Campi personalizzati** (API dei plugin 1.47). Le voci tengono i loro campi in `entry.fields`, come sono salvati (i media come id). I lettori li danno formattati, calcolati sul server una volta per pagina, come `get_field`, `the_field` e `have_rows` di ACF:

```tsx
import { Field, Rows, useField } from '@cleitext/theme-sdk';

function Landing() {
  const photo = useField<{ url: string; alt: string; sizes: Record<string, { url: string }> }>(
    'photo',
  );
  return (
    <>
      <h2>
        <Field name="subtitle" fallback="Benvenuti" />
      </h2>
      {photo && <img src={photo.sizes.md?.url ?? photo.url} alt={photo.alt} />}
      <Rows name="team" empty={<p>Ancora nessuno.</p>}>
        {(row) => <h3>{String(row.name)}</h3>}
      </Rows>
    </>
  );
}
```

- `useField(name, { of, group, raw })`: per nome (i campi del tipo, poi quelli di ogni gruppo, il primo trovato) o `gruppo.nome`. `of: 'term'` legge il termine di un archivio di categoria o tag, `of: 'author'` la persona di un archivio d'autore (campi degli utenti), altrimenti la voce mostrata. `raw: true` dà il valore salvato.
- Valori formattati: un campo media è `{ id, url, alt, width, height, mime, sizes }` (le dimensioni per nome, per esempio `sizes.md.url`); le righe delle liste arrivano formattate, ognuna con il suo `_id` stabile; i tipi di campo dei plugin danno quello che dice il loro `format` (una voce `{ id, type, title, url }`…); gli altri valori come sono salvati.
- `<Field name>` mostra un valore: testi e numeri come testo (con escape), sì/no come ✓, un campo media come `<img>`, liste di testi separate da virgole; `fallback` quando è vuoto, `className` sull'elemento. `<Rows name>` passa ogni riga di una lista alla sua funzione, `empty` quando non ce ne sono.
- Leggono `entry.fieldValues`, `term.fieldValues` e `author.fieldValues` delle props, che un modello può anche usare direttamente; sui core più vecchi i lettori ripiegano sui valori salvati.
- Dall'API dei plugin 1.48 `<Field>` mostra anche i link, e le voci, i termini e le persone collegati, come link (più d'uno separati da virgole), e un campo `richtext` come testo formattato con `html` (`<Field name="story" html />`, ripulito di nuovo). Le relazioni danno `{ id, type, title, url }` (voci), `{ id, taxonomy, name, slug, url }` (termini), `{ id, name, avatarUrl, url }` (persone); un campo `link` `{ url, label, target }`; un campo `file` il media con il suo `filename`.

<a id="pagine-di-opzioni"></a>**Pagine di opzioni** (API dei plugin 1.48): impostazioni per tutto il sito, come le pagine di opzioni di ACF (il telefono nel piè di pagina, i profili social). Un tema dichiara le sue con `optionsPages` (compaiono nel menu dell'admin, sotto `parent` se indicato, per esempio `/appearance`); proprietari del sito e plugin ne aggiungono altre, e i gruppi di campi si collegano a ognuna con la regola `optionsPage`. I modelli leggono i valori di ogni pagina nella lingua della pagina, formattati come quelli di `useField`:

```tsx
import { Field, useOption } from '@cleitext/theme-sdk';

optionsPages: ([
  {
    slug: 'footer',
    title: { en: 'Footer', it: 'Piè di pagina' },
    parent: '/appearance',
    capability: 'edit_theme_settings',
    fields: [{ name: 'phone', type: 'text', label: 'Telefono' }],
  },
],
  function Footer() {
    const phone = useOption<string>('phone', { page: 'footer' });
    return (
      <footer>
        {phone} <Field of="option" page="contacts" name="team.lead" />
      </footer>
    );
  });
```

`useOption(name, { page, group })` equivale a `useField(name, { of: 'option', page })`; `usePage().options` ha i valori di ogni pagina per slug. I valori dei campi traducibili seguono la lingua della pagina (quelli della lingua predefinita finché non vengono tradotti).

**Blocchi collegati** (API dei plugin 1.48). Nell'editor a blocchi paragrafi, titoli, voci di elenco, pulsanti e immagini si possono collegare a un campo (**Collega a un campo** nelle impostazioni del blocco), e i blocchi **Campo** e **Righe di un campo** mostrano i campi e ripetono blocchi per ogni riga di una lista o per ogni voce collegata ([PLUGIN.md, Collegamenti dei blocchi](PLUGIN.md#block-bindings)). Il server li risolve prima di disegnare la pagina, quindi `EntryContent`, le aree e le posizioni del costruttore di temi mostrano i valori; i temi possono dare stile a `.wp-block-cleitext-field` (con `__label`, `is-<tipo>`, `is-empty`), `.wp-block-cleitext-field-rows` (`is-layout-grid`) e `.wp-block-cleitext-field-row`.

`menuItemFields` (API dei plugin 1.34) aggiunge opzioni a ogni voce di menu, per esempio le colonne di un mega menu o un'icona. Ogni elemento è `{ field, levels? }`: `field` è la definizione di un campo, `levels` è `'top'` (solo voci di primo livello), `'nested'` (solo sottovoci) o `'all'` (predefinito). In **Aspetto → Menu** il pulsante ⚙ di una voce apre le sue "Opzioni del tema"; i valori sono controllati come le impostazioni (le chiavi sconosciute sono scartate, i valori non validi rifiutati) e salvati con la voce. Il tema li legge in `usePage().menus[posizione][i].data`, con i predefiniti applicati, solo per le opzioni valide al livello della voce:

```tsx
menuItemFields: [
  { field: { name: 'mega', type: 'boolean', label: 'Mega menu', default: false }, levels: 'top' },
  { field: { name: 'columns', type: 'number', label: 'Colonne', min: 1, max: 6, default: 3 }, levels: 'top' },
  { field: { name: 'icon', type: 'text', label: 'Icona', maxLength: 40 } },
],
// Nell'intestazione: item.data?.mega ? <MegaMenu columns={item.data.columns as number} … /> : …
```

I plugin che estendono il tema possono aggiungerne altre (`menuItemFields` di `ctx.themes.extend`). I valori delle opzioni non più dichiarate (un altro tema, o un plugin disattivato) restano salvati con la voce e tornano con l'opzione, ma non arrivano mai al tema.

`editorCss` può essere una funzione, `(settings) => string`, così l'editor segue i colori e i caratteri scelti in Personalizza.

## 5. Aree di blocchi

Con `areas: { footer: 'Footer' }` e `<BlockArea name="footer" />` nel Layout, l'area si scrive con l'editor a blocchi in **Aspetto → Aree**, una per lingua. Finché è vuota `<BlockArea>` non mostra nulla.

`areaDefaults: { 'header-cart': { schema: 1, blocks: [...] } }` dà a un'area il suo contenuto finché nessuno la modifica: blocchi di qualsiasi plugin, che si vedono solo se quel plugin è attivo (per esempio il link al carrello del negozio in un'area dell'intestazione).

## 6. Regole

- Niente accessi al database né chiamate di rete: tutto arriva da props e `usePage()`.
- Web font: collega i fogli di stile di Google Fonts o Bunny Fonts come di consueto (`<link rel="stylesheet">` o `@import` in uno `<style>`, anche in `editorCss`). Con **Impostazioni → Generali → Privacy → Web font** sul predefinito, il core li trasforma in copie tenute sul sito (`/_fonts/…`) e toglie i `preconnect` verso quei servizi, così i browser dei visitatori non li raggiungono mai ([Privacy](./PRIVACY.md#web-font-ospitati-sul-sito)). Un `@import` dentro un file `.css` separato non viene visto: mettilo nella pagina o in `editorCss`.
- Larghezza del contenuto: imposta `--cx-container-width` su `:root` alla larghezza del contenitore dei contenuti (per esempio `--cx-container-width: 1200px`). La usano i blocchi che seguono la larghezza del tema, come i container a tutta larghezza di Prisma senza una larghezza propria (1140px se il tema non la indica).
- React esegue l'escape dell'output; usa `dangerouslySetInnerHTML` solo per il tuo CSS o JSON.
- Pagine accessibili (landmark, link per saltare al contenuto, etichette, contrasto) e leggere.
- **Ogni tema deve funzionare come genitore** (core 0.79, SPECIFICHE "Requisiti dei temi"): chi gestisce un sito può fare un tema child di qualsiasi tema (§7). Quindi un tema non scrive mai il proprio slug dove va quello del tema del sito (negli indirizzi, negli attributi `data-` letti dai suoi script, nelle chiavi di archiviazione), legge le sue impostazioni con `useThemeSettings()` (mai da un namespace suo) e porta ciò che gli serve dentro il suo bundle o lo legge con `useThemeSettings()`/`usePage()`: un child tiene il codice e le impostazioni del genitore sotto il proprio slug. Provalo una volta con `cleitext theme:child <tuo-tema> <tuo-tema>-child --install` e il child attivo: il sito deve restare uguale.

## 7. Temi child

Un **tema child** (core 0.79, API dei plugin 1.50) è costruito su un altro tema, il suo **genitore**, come in WordPress: eredita tutto dal genitore e contiene solo ciò che cambia chi gestisce il sito. Aggiornare il genitore non tocca mai il child, così quelle modifiche non si perdono. Ogni tema di Cleitext può fare da genitore.

### Crearne uno

- **Dall'amministrazione.** In **Aspetto → Temi**, **Crea tema child** sotto un tema (super admin, come per Carica tema) chiede un nome e uno slug e può attivarlo subito: le scelte di Personalizza del genitore vengono copiate, così il sito resta uguale. Il nuovo tema ha un `theme.json`, un `style.css` vuoto e un README su come sostituire i template.
- **Dalla CLI.** `cleitext theme:child <genitore> <slug> [--name <nome>]` scrive la cartella `./<slug>` da modificare; con `--install` va direttamente in `THEMES_PATH`.
- **A mano.** Una cartella con un `theme.json` che nomina il genitore:

```json
{
  "slug": "zenit-child",
  "name": "Zenit Child",
  "version": "1.0.0",
  "parent": "zenit",
  "parentVersion": "^1.0.0"
}
```

`parent` è lo slug del genitore; `parentVersion` (facoltativo) è un intervallo semver delle versioni del genitore con cui il child funziona. Un child senza codice non ha bisogno di `entry` né di build: basta il suo `style.css`.

### Cosa eredita e cosa sostituisce

Il sito vede un solo tema, con slug e nome del child, fatto dai due:

| Parte                                                                                                                                               | Regola                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout, template (anche `template-<nome>`), componenti, font, script, traduzioni                                                                    | Quelli del genitore, salvo un template (o un `Layout`) del child con lo stesso nome.                                                                |
| CSS                                                                                                                                                 | La pagina del genitore com'è, poi `css` e `style.css` del child (vedi "Ordine del CSS").                                                            |
| `editorCss`                                                                                                                                         | Quello del genitore, poi `editorCss` ed `editor.css` del child.                                                                                     |
| Impostazioni (`settings`)                                                                                                                           | Quelle del genitore; un campo del child con lo stesso nome lo sostituisce, gli altri si aggiungono. `settingsDefaults` cambia i valori predefiniti. |
| Sezioni, stili pronti, posizioni dei menu, opzioni delle voci di menu, aree, contenuti predefiniti delle aree, modelli di pagina, pagine di opzioni | Quelli del genitore più quelli del child (stesso id o nome: quello del child).                                                                      |
| `entryFields`                                                                                                                                       | I campi del genitore più quelli del child.                                                                                                          |
| `relatedEntries`, `listTerms`, `adjacentEntries`, `comments`, `importSettings`                                                                      | Quelli del child, se li dà.                                                                                                                         |
| `aiGuide`                                                                                                                                           | Quella del genitore, poi quella del child.                                                                                                          |
| Plugin che vengono con il genitore (`plugins`)                                                                                                      | Vengono anche con il child; un child può nominarne altri.                                                                                           |
| File letti dai plugin (`ctx.themes.readFile`, per esempio `campus-json/*.json`)                                                                     | Il file del child, altrimenti quello del genitore con lo stesso percorso.                                                                           |
| Plugin che estendono il genitore (`ctx.themes.extend('<genitore>')`)                                                                                | Estendono anche il child.                                                                                                                           |

Aree di blocchi, menu, valori delle pagine di opzioni e opzioni per pagina appartengono al sito, non al tema: il child mostra gli stessi.

### Sostituire e avvolgere i template

Un child con codice ha `src/index.tsx`, compilato con `cleitext theme:build` come ogni tema (React, l'SDK e il codice del genitore vengono dal server: il bundle del child contiene solo il suo codice). L'esportazione predefinita è `defineChildTheme({ … })`:

```tsx
import {
  defineChildTheme,
  ParentTemplate,
  useParentTemplate,
  useParentLayout,
  type LayoutProps,
  type TemplateProps,
} from '@cleitext/theme-sdk';

/** Sostituisce `entry-page` del genitore. */
function Page(props: TemplateProps) {
  if (props.kind !== 'entry') return null;
  return <main className="my-page">{props.entry.title}</main>;
}

/** Avvolge il template che il genitore userebbe per questa pagina. */
function Index(props: TemplateProps) {
  return (
    <>
      <div className="notice">Saldi estivi!</div>
      <ParentTemplate {...props} />
    </>
  );
}

/** Avvolge un template del genitore per nome. */
function Search(props: TemplateProps) {
  const Parent = useParentTemplate('search');
  return <section className="my-search">{Parent && <Parent {...props} />}</section>;
}

/** Un Layout intorno a quello del genitore. */
function Layout(props: LayoutProps) {
  const Parent = useParentLayout()!;
  return <Parent {...props} />;
}

export default defineChildTheme({
  templates: { 'entry-page': Page, index: Index, search: Search },
  Layout,
  css: '.notice { background: gold; }',
  settings: [{ name: 'ribbon', type: 'text', label: 'Testo del nastro' }],
  settingsDefaults: { accent: '#7c3aed' },
});
```

- Un template del child sostituisce solo quello del genitore **con lo stesso nome**. La gerarchia non cambia: con il solo `index` nel child, una pagina usa ancora `entry` del genitore se il genitore lo ha, come in WordPress.
- `<ParentTemplate {...props} />` mostra il template che il genitore userebbe per questa pagina (`name` ne sceglie uno); `useParentTemplate(nome)` lo dà come componente (null fuori da un tema child); `useParentLayout()` dà il Layout del genitore.
- L'esportazione predefinita può anche essere una funzione della definizione del genitore: `defineChildTheme((parent) => ({ templates: { index: (p) => <Wrap><parent.templates.index {...p} /></Wrap> } }))`.

### Ordine del CSS

Nell'`<head>` di ogni pagina:

1. il CSS del genitore, dove lo stampa il suo Layout (con il CSS delle sue impostazioni);
2. i fogli di stile dei plugin;
3. il CSS del child (`css`, poi `style.css`), in `<style id="cx-child-theme-css">`;
4. il CSS dei blocchi;
5. il **CSS aggiuntivo** del sito (§8), per ultimo.

`style.css` ed `editor.css` si leggono solo dalla cartella del child, al massimo 512 KB ciascuno.

### Impostazioni

Il child tiene i valori di Personalizza sotto il proprio slug. Finché non salva i suoi, mostra i valori salvati del genitore, e la sua **prima attivazione** su un sito li copia, così passare dal genitore al child non cambia nulla nelle pagine. Dopo, i due hanno valori separati (tornando al genitore si vedono quelli del genitore).

### Installare, aggiornare, eliminare

- Un child ha bisogno del genitore installato, in una versione dentro `parentVersion`: altrimenti `theme:install` (e quindi Carica tema) lo rifiuta e dice cosa manca. Il catalogo installa prima il genitore, se ce l'ha.
- Un solo livello: un genitore non può essere un child, un child non può avere child e un tema non può essere genitore di se stesso.
- Aggiornare il genitore non cambia mai la cartella del child. Un aggiornamento fuori dal `parentVersion` di un child installato viene rifiutato (`theme:install --force` lo installa comunque); un aggiornamento dal catalogo che rompe un child torna alla versione di prima.
- Il genitore non si può eliminare finché c'è un child installato: elimina prima il child.
- `theme:rollback` funziona per entrambi, ognuno sulla sua cartella.
- Un child che non si carica (genitore mancante, versione sbagliata) compare in **Aspetto → Temi** con il motivo.

### Scaricare e ricaricare

**Scarica** sotto un tema child (super admin) dà la sua cartella come zip, senza `node_modules` né collegamenti. Modificala in locale (`cleitext theme:build` se ha codice) e ricaricala con **Carica tema**: una `version` più alta è un aggiornamento, la precedente resta per il rollback. Un child caricato viene eseguito sul server come ogni tema caricato, quindi valgono le stesse regole: solo super admin, solo se il server permette di installare dall'amministrazione e pacchetti non firmati.

### Genitori a pagamento

Un child di un tema a pagamento (come Vitality) non è a pagamento e non sostituisce mai la licenza del genitore: un sito può attivarlo solo con una licenza del **genitore** per quel sito (si può provare con l'Anteprima dal vivo, come la demo del genitore). Il catalogo continua ad aggiornare il genitore con la sua licenza come sempre. Si possono scaricare solo i temi child, mai il genitore.

### Un esempio completo

```
mio-zenit/
├─ theme.json      { "slug": "mio-zenit", "name": "Mio Zenit", "version": "1.0.0", "parent": "zenit", "parentVersion": "^1.0.0" }
├─ style.css       .site-title { letter-spacing: .05em; }
├─ editor.css      .editor-styles-wrapper h2 { color: #7c3aed; }
├─ README.md
└─ src/index.tsx   export default defineChildTheme({ templates: { 404: NotFound }, settingsDefaults: { … } })
```

```bash
cleitext theme:build ./mio-zenit && cleitext theme:install ./mio-zenit
```

## 8. CSS aggiuntivo

**Aspetto → Personalizza → CSS aggiuntivo** (core 0.79) c'è nel Personalizza di ogni tema, come in WordPress. Ha due riquadri:

- **CSS per ogni tema**: appartiene al sito, quindi resta dopo gli aggiornamenti e i cambi di tema;
- **CSS solo per &lt;tema&gt;**: stampato solo finché quel tema è attivo.

Entrambi sono editor di codice (core 0.80): evidenziazione della sintassi, numeri di riga, parentesi abbinate e completamento delle proprietà CSS, chiari o scuri come l'admin. Tab passa al campo successivo come sempre; l'editor viene caricato solo quando si apre la sezione.

L'anteprima mostra il CSS mentre lo scrivi; **Pubblica** lo salva con le opzioni del tema. Viene stampato per ultimo nell'`<head>` (`<style id="cx-additional-css">`), dopo il CSS del tema, quello di un tema child e quello dei blocchi. Ogni riquadro contiene fino a 100.000 caratteri e non può contenere `<style`, `</style` o `<script` (potrebbe chiudere l'elemento); quanto è salvato viene comunque protetto di nuovo quando si stampa. È conservato nelle impostazioni del sito (namespace `additional-css`, chiavi `site` e `theme:<slug>`), quindi i backup lo comprendono e le esportazioni del sito (`cleitext export`) lo portano nel nuovo sito (`site.additionalCss` del documento di trasferimento).

I temi non hanno più bisogno di un'opzione "CSS personalizzato" propria. Quella di Zenit si è spostata qui con il core 0.79: il suo valore è diventato il CSS aggiuntivo del sito (per ogni tema dove Zenit era il tema del sito, solo per Zenit altrove), e Zenit 1.0.5 non ha più l'opzione.

### Nell'editor a blocchi

Anche l'area di modifica dell'editor a blocchi applica il CSS aggiuntivo (core 0.80): la parte per ogni tema e quella del tema attivo, dopo gli stili per l'editor del tema (`editorCss`, `editor.css`, compresi quelli di un tema child) e gli stili dei blocchi dei plugin, come le pagine lo stampano per ultimo. Resta dentro l'area di modifica (un iframe), quindi l'interfaccia dell'admin non cambia; `GET /themes/active/editor-styles` risponde `{ css, additionalCss }`. Il CSS scritto per il markup del sito (un header, `.site-content p`) lì non trova nulla; le regole sui blocchi, le loro classi e `body` sì. Le modifiche fatte in Personalizza si vedono in un editor aperto dopo (ricarica quello già aperto). L'area di Fresco è la pagina stessa, quindi lo ha già; il riquadro dell'Editor classico non mostra né gli stili per l'editor del tema né questo CSS.

### Importato da WordPress

WordPress conserva il suo CSS aggiuntivo in un post `custom_css` per ogni tema. Il WordPress Importer (1.24) lo porta in **CSS per ogni tema**: l'unico dell'esportazione, oppure quello del tema dell'esportazione (i temi a blocchi lo indicano), altrimenti quello modificato più di recente; gli altri sono nominati nel resoconto dell'importazione. Il CSS che non si potrebbe stampare (markup, più di 100.000 caratteri) viene segnalato e lasciato fuori.

Le importazioni non sostituiscono mai il CSS del sito (comprese quelle di un'esportazione del sito): in un riquadro vuoto il CSS va così com'è, altrimenti viene aggiunto in fondo sotto un commento, `/* Imported from <nome del sito>, <indirizzo> */`, e il resoconto lo dice. Il CSS che il sito ha già non viene aggiunto di nuovo, quindi importare due volte la stessa esportazione non cambia nulla. Quando i due insieme supererebbero il limite, la parte importata resta fuori e viene segnalata.
