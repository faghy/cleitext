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
cleitext theme:uninstall mio-tema       # solo se nessun sito lo usa
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

`entryFields` aggiunge opzioni alle singole pagine (per esempio una barra laterale o un'intestazione trasparente per pagina). Chi scrive le imposta nella scheda Documento dell'editor a blocchi; sono salvate con il contenuto in `document.editor.data` e il tema le legge da `entry.document.editor?.data`. `types` le limita ad alcuni tipi di contenuto (`['page']`).

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
- React esegue l'escape dell'output; usa `dangerouslySetInnerHTML` solo per il tuo CSS o JSON.
- Pagine accessibili (landmark, link per saltare al contenuto, etichette, contrasto) e leggere.
