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

## 3. La definizione del tema

`defineTheme({ … })` riceve:

| Proprietà       | A cosa serve                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Layout`        | La pagina attorno a ogni template: `<html>`, `<head>` (con `<HeadTags>` per `head.tags`), intestazione, piè di pagina. |
| `templates`     | Componenti per nome; `index` è obbligatorio. I nomi più specifici hanno la precedenza (ARCHITETTURA §12.2).            |
| `css`           | Foglio di stile incluso in ogni pagina. Tienilo piccolo.                                                               |
| `menuLocations` | Posizioni per i menu, assegnati in Aspetto → Menu; si leggono con `usePage().menus`.                                   |
| `settings`      | Campi mostrati in Aspetto → Personalizza (§4).                                                                         |
| `areas`         | Aree composte di blocchi (§5).                                                                                         |
| `editorCss`     | CSS per l'editor a blocchi, perché i contenuti abbiano lo stesso aspetto del sito mentre si scrive.                    |

I template ricevono la pagina come props (`kind`: `entry`, `archive`, `search`, `404`, `maintenance`) e leggono il resto con `usePage()`. Non interrogano mai il database.

Avvolgi in `<Location>` le parti che un theme builder può sostituire: `header`, `footer`, `single` (il contenuto della pagina di una voce; passa `entry`) e `archive` (archivi e risultati di ricerca). Se nessun plugin le riempie, si vede il markup del tema:

```tsx
<Location name="header"><header className="site-header">…</header></Location>
<Location name="single" entry={entry}><article>…</article></Location>
```

Il contenuto di una voce si mostra con `<EntryContent document={…} />`. Dentro un editor visuale (il page builder di un plugin) mostra invece un elemento vuoto `[data-cx-editor-canvas]` che l'editor riempie: così la pagina si modifica nel layout del tema.

## 4. Impostazioni

I campi usano gli stessi tipi dei campi personalizzati ([PLUGIN.md §14](PLUGIN.md#14-riferimento-tipi-di-campo)). Gli amministratori li modificano in **Aspetto → Personalizza** con l'anteprima dal vivo; i valori vengono controllati sullo schema. Si leggono con `useThemeSettings()`; i campi media contengono un id e il file è precaricato in `usePage().media`.

## 5. Aree di blocchi

Con `areas: { footer: 'Footer' }` e `<BlockArea name="footer" />` nel Layout, l'area si scrive con l'editor a blocchi in **Aspetto → Aree**, una per lingua. Finché è vuota `<BlockArea>` non mostra nulla.

## 6. Regole

- Niente accessi al database né chiamate di rete: tutto arriva da props e `usePage()`.
- React esegue l'escape dell'output; usa `dangerouslySetInnerHTML` solo per il tuo CSS o JSON.
- Pagine accessibili (landmark, link per saltare al contenuto, etichette, contrasto) e leggere.
