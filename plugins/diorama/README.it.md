# Diorama

🇬🇧 [Read in English](./README.md)

Il plugin ufficiale di Cleitext per **slider e sezioni hero**: veloci da creare, leggeri per le pagine, leggibili sul telefono e usabili da tutti. È gratuito e non fa parte del pacchetto di base: installalo da **Plugin → Aggiungi nuovo** (catalogo), oppure scarica `cleitext-plugin-diorama-<versione>.zip` dalla pagina delle Release e caricalo in **Plugin → Carica plugin**. Richiede Cleitext 0.72 o successivo (API dei plugin 1.46).

La versione gratuita tiene **uno slider per sito**, con tutte le slide che vuoi e tutte le funzioni qui sotto. **Diorama Pro** (un plugin a parte, a pagamento) dà tutti gli slider che servono, più caroselli, popup e altri effetti.

## Cosa fa

- **Due strade nello stesso editor.**
  - **La strada rapida:** Nuovo slider → **Dalle tue immagini** → scegli qualche immagine → se vuoi, un titolo, un testo e un pulsante per ciascuna → fatto. Oppure parti da uno dei **dieci modelli** (hero con invito all'azione, ristorante, saldi, testimonianze, portfolio, evento, hotel, studio, palestra, ultimi articoli), fatti solo di colori, sfumature, forme e icone: le tue immagini le aggiungi dopo.
  - **La strada visuale:** livelli che si spostano trascinandoli e si ridimensionano sulla slide; un **selettore del dispositivo** (computer, tablet, telefono); le schede **Contenuto**, **Stile** e **Movimento** del livello selezionato; annulla e ripristina; duplica una slide o un livello; un'anteprima dal vivo con lo slider vero.
  - L'interruttore **Avanzate** mostra i tempi più fini (quanto durano gli effetti) e il loro andamento.
- **Tipi e dimensioni.** Uno **slider** o un **hero** (una scena sola). Nel contenuto della pagina (con una larghezza massima), **a tutta larghezza**, oppure **a tutto schermo** con lo spazio per un'intestazione fissa. L'altezza si sceglie per ogni dispositivo.
- **Sfondi.** Un'immagine della libreria con il punto che resta in vista (ci fai clic sopra), un colore, una sfumatura, oppure un video: un MP4 della libreria, o YouTube e Vimeo nei loro lettori che rispettano la privacy. Una velatura sullo sfondo e un lento movimento **Ken Burns** (zoom in avanti, all'indietro, panoramica).
- **Livelli.** Titolo (H1–H4 o testo), testo, pulsante (verso una pagina del sito, un indirizzo, una telefonata, un'email o una sezione della pagina), immagine, icona (24 icone), forma (rettangolo, cerchio, macchia, linea), e il **riquadro di contenuto**: un titolo, un testo e dei pulsanti uno sotto l'altro, sistemato con nove posizioni pronte.
- **Ogni dispositivo.** Posizione, dimensioni e stile hanno un valore per il computer e, solo dove li cambi, per tablet e telefono (un pallino segna ciò che è diverso, con un ripristino). Ogni livello si può nascondere su un dispositivo. Sul telefono testi e pulsanti hanno un'**impaginazione leggibile da sola**: larghi, centrati, con caratteri più piccoli ma mai minuscoli, finché non li sistemi tu.
- **Movimento.** 15 effetti di entrata e di uscita con il loro ritardo (e durata e andamento nelle Avanzate), effetti al passaggio del mouse sui pulsanti, e transizioni tra le slide: dissolvenza, dissolvenza incrociata, scorrimento nelle quattro direzioni, scorrimento sopra, zoom.
- **Navigazione.** Frecce, pallini e barra di avanzamento in sei stili, con colore e dimensioni; scorrimento col dito e trascinamento; le frecce della tastiera, Home e Fine quando lo slider ha il focus; scorrimento automatico che si ferma sotto il mouse e al focus, con un **pulsante di pausa** sempre presente mentre scorre.
- **Gli ultimi articoli del blog** come slide: la prima slide è il modello, con le etichette `{{title}}`, `{{excerpt}}`, `{{date}}`, `{{category}}` e `{{author}}`, collegamenti a «l'articolo della slide» e la sua immagine in evidenza come sfondo. Per categoria, con il numero di articoli e la lunghezza del riassunto.

## Accessibile e veloce di serie

- Semantica da carosello (`aria-roledescription`, slide chiamate «2 di 5»), slide nascoste fuori dall'ordine di lettura (`aria-hidden`, `inert`), pulsanti con un nome, regione live spenta mentre le slide scorrono da sole, testi alternativi dalla libreria (o i tuoi, o nessuno per le decorazioni), un solo titolo principale dove scegli tu.
- **Riduci il movimento** viene rispettato: con quell'impostazione del visitatore nulla si muove da solo, nessun effetto né Ken Burns, i video non partono, e le slide cambiano lo stesso, all'istante.
- Un piccolo motore tutto nostro (circa 9 KB, niente jQuery né librerie di animazione) con animazioni CSS e Web Animations, aggiunto **solo alle pagine con uno slider**.
- Immagini responsive (`srcset` e `sizes` dalle copie AVIF e WebP della libreria); la prima si carica subito e con priorità alta, le altre solo quando servono.
- L'altezza è riservata nel CSS per ogni dispositivo, quindi la pagina non salta mentre si carica. I caratteri si adattano alla larghezza dello slider (container query) e non scendono mai sotto i tre quarti.
- Gli sfondi YouTube e Vimeo aspettano il consenso al marketing quando il plugin **Privacy & GDPR** è attivo (gli vengono dichiarati), e altrimenti si caricano subito; fino ad allora si vede l'immagine.

## Come si usa

1. Attiva Diorama in **Plugin**, poi apri **Diorama** nel menu dell'amministrazione.
2. **Nuovo slider** → dalle tue immagini, da un modello o vuoto.
3. Mostralo in una pagina:
   - il blocco **Slider (Diorama)** nell'editor a blocchi (mostra lo slider, con un collegamento per modificarlo);
   - il widget **Slider** in Fresco (in **Media**);
   - lo shortcode `[diorama alias="home"]` (o `id="…"`) da solo in un paragrafo, ovunque vadano i blocchi: le pagine WordPress importate che lo contengono ricevono il blocco;
   - in un tema, lo stesso blocco in un'area di blocchi o in un template.

Gli slider stanno nella tabella del plugin, quindi sono nei **backup** di Cleitext, e `cleitext export` / `import` li spostano con il sito (API dei plugin 1.46): le immagini e le pagine a cui portano i pulsanti vengono ricollegate a quelle del nuovo sito. Un secondo slider viene rifiutato solo quando lo si crea: quello che hai continua a funzionare e resta modificabile.

## Per sviluppatori: estendere Diorama (Diorama Pro)

Diorama tiene i suoi punti di estensione su `globalThis`, come Fresco, così un plugin a parte (Diorama Pro, che richiede `diorama`) può togliere il limite e aggiungere funzioni senza una nuova versione di Diorama. Un'estensione che fallisce viene annotata nel registro e lasciata fuori.

**Server** — `globalThis[Symbol.for('cleitext.diorama')]` (`src/pro.ts`), ricreato a ogni ricarica dei plugin:

| Elenco         | Che cosa fa                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sliderLimit`  | Funzioni `(siteId) => number \| null`: la risposta più alta è quanti slider può avere un sito (Diorama risponde 1; Pro con una licenza valida, `Infinity`). |
| `sources`      | Fonti di contenuti oltre a «create qui» e agli ultimi articoli (`{ id, load(slider, context) }`, che riempiono la slide modello come gli articoli).         |
| `beforeRender` | `(slider, { siteId, locale }) => slider`: cambia uno slider prima di disegnarlo (slide programmate, slide per lingua…).                                     |
| `renderers`    | `(input) => ReactNode \| undefined`: disegna uno slider al posto di Diorama (carosello, popup…); vince la prima risposta.                                   |
| `media`        | `(slider) => string[]`: id dei media nei dati propri del plugin, caricati in anticipo con le loro copie responsive.                                         |
| `upgradeUrl`   | La pagina mostrata dall'invito a Pro.                                                                                                                       |

Ogni slider, slide e livello ha un oggetto `ext` che Diorama conserva così com'è (fino a 32 KB): Pro ci tiene le sue impostazioni.

Da Diorama 1.1 l'API del server ha anche:

- `decorators`: `(input) => RenderDecorator | undefined`, chiamati prima dei `renderers`; le risposte sono unite in `input.decorate`. Un decoratore aggiunge classi e attributi alla radice dello slider, alle slide e ai livelli (gli attributi vengono dopo quelli di Diorama, quindi `data-transition` può indicare un'altra transizione), impostazioni unite a quelle del runtime (`data-dio`, per esempio `effect`), altro CSS, contenuto nello stage dopo le slide (livelli mostrati su ogni slide) e dopo la navigazione (miniature, schede), e il testo di un titolo, un testo o un pulsante (per esempio diviso in lettere). La tela dell'editor non disegna decorazioni.
- `sliders`: `list(siteId)` e `get(siteId, idOAlias)`, in sola lettura (per esempio i popup messi su ogni pagina).
- `lib`: il disegno di Diorama (`SliderView`, `SlideView`, `LayerView`, `sliderCss`, `BASE_CSS`, `stringsFor`, punti di interruzione…), così un'estensione lo riusa senza includerlo.
- I renderer ricevono anche `alias` e `sliderId` dello slider.
- I livelli posizionati sulla slide aggiungono `--dio-tx` e `--dio-ty` (lunghezze, `0px` di base) alla loro posizione: spostamenti che un'estensione può animare (parallasse, loop).

**Amministrazione** — `globalThis[Symbol.for('cleitext.diorama.admin')]` (`src/studio/pro.ts`): `sliderPanels` (altre sezioni delle impostazioni dello Slider, con lo slider, il dispositivo e un `onChange`), `templates` (altri modelli nella galleria), `canCreate` e `invitation` (il testo dell'invito). Da 1.1: `layerPanels` (sezioni di una scheda del livello, Movimento se non indicata, con un `onChange` del livello), `slidePanels` (sezioni delle impostazioni della Slide), `canvasPanels` (pannelli sotto la tela, anche solo con l'interruttore Avanzate, per esempio una linea del tempo), `preview` (`decorators`, `renderers`, `scripts` e `styles` per la cornice dell'Anteprima, come nelle pagine) e `lib` (i componenti di Diorama, i controlli del suo editor e le funzioni del modello, impostati quando si carica l'amministrazione di Diorama). I modelli delle estensioni si creano dai loro dati.

**Browser** — `window.cleitextDiorama`: `transitions[nome] = (from, to, { duration, easing, direction }) => Animation[]` aggiunge una transizione (usata quando l'effetto di una slide o dello slider ha quel nome), e `listeners` vengono chiamati con ogni slider su `'ready'` e `'change'`. Gli script aggiunti da un altro plugin dopo quello di Diorama girano prima che gli slider partano. Da 1.1: i pulsanti con `data-dio-go="<n>"` ovunque nella radice dello slider (miniature, schede) portano alla slide `n` e ricevono `aria-current`; uno slider ha `setPaused(boolean)` e `paused`; `scan()` avvia gli slider aggiunti dopo alla pagina.

**Modello dei dati** — `src/model/types.ts`. I valori che cambiano per dispositivo sono `{ base, tablet?, mobile? }` e salvano solo le modifiche; i media sono oggetti `{ id, url }`; la normalizzazione (`src/model/normalize.ts`) limita ogni valore e scarta ciò che non conosce.

**Endpoint** (`/api/v1/ext/diorama`, capacità `manage_diorama`, data ad amministratori ed editori): `GET/POST /sliders`, `GET/PUT/DELETE /sliders/:id`, `POST /sliders/:id/duplicate`, `GET /templates`, `GET /posts-sample`; `GET /options` (gli slider, per i selettori; `edit_entries`). Un nuovo slider rifiutato risponde `409` con `code: 'limit'`.

**Test** — `pnpm --filter @cleitext/plugin-diorama test` (modello, valori per dispositivo, markup e CSS, accessibilità, riduzione del movimento, il motore in jsdom, shortcode, dati di esportazione), il test del server `apps/server/test/diorama.test.ts` e quello end-to-end `apps/admin/e2e/diorama.spec.ts`.
