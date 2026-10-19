# Fresco e Fresco Pro

Fresco è il page builder visuale di Cleitext: costruisci una pagina trascinandoci sezioni e widget e dandogli uno stile, mentre la vedi con la grafica del tuo sito. **Fresco** è gratuito e sta nel catalogo ufficiale. **Fresco Pro** aggiunge il Theme Builder, i popup, i moduli, i loop, i contenuti dinamici, altri widget ed effetti; costa 67 € per sito con 12 mesi di aggiornamenti.

Una pagina di Fresco è una normale voce di Cleitext: revisioni, traduzioni, esportazione, ricerca, assistenti AI e importazione da WordPress continuano a funzionare. Cambia solo l'editor.

## Primi passi

1. Installa Fresco da **Plugin → Aggiungi nuovo plugin** e attivalo.
2. Apri una pagina e scegli **Modifica con Fresco**, oppure crea una pagina e scegli Fresco come editor.
3. Trascina un **Contenitore** dal pannello nella pagina, poi i widget nel contenitore.
4. Seleziona un elemento per modificarlo nel pannello: schede **Content** (contenuto), **Style** (stile) e **Advanced** (avanzate).
5. **Pubblica** come sempre: la pagina viene salvata con le sue revisioni.

La barra in cima al pannello apre gli elementi (**Elements**), la libreria dei modelli (**Templates**), il **Navigator** (l'albero della pagina), le impostazioni della pagina (**Page settings**) e del sito (**Site settings**). L'editor di Fresco, per ora, ha le etichette in inglese. Ci sono anche annulla e ripeti (Ctrl+Z, Ctrl+Maiusc+Z).

Le **impostazioni della pagina** scelgono il layout (quello del tema, **Full width**, a tutta larghezza, o **Canvas**, senza intestazione e piè di pagina del tema), nascondono il titolo del tema, nascondono l'immagine in evidenza e danno uno sfondo alla pagina. L'immagine in evidenza nascosta resta negli archivi, nei loop e nelle anteprime social; le pagine Full width e Canvas non la mostrano mai. Per un'anteprima social senza immagine in evidenza usa il campo **Immagine social** del plugin SEO.

Le icone sopra la pagina passano tra **desktop, tablet e mobile**: i valori di stile impostati su un dispositivo valgono da quel dispositivo in giù. Il clic destro su un elemento offre copia, incolla, incolla stile, ripristina stile, duplica, salva come modello ed elimina.

## Struttura

- **Contenitore**: flex (riga o colonna) o griglia, in riquadro o a tutta larghezza, con sfondo (colore, sfumatura, immagine, un video della libreria che scorre muto dietro il contenuto), velatura, bordo, ombra, divisori sagomati e link. I contenitori si annidano liberamente.
- Larghezza, margini, spaziature interne, posizione e livello di ogni elemento stanno nella scheda **Advanced**, con le animazioni d'ingresso, id e classi CSS e la possibilità di nasconderlo per dispositivo.

## Widget (Fresco)

Titolo, Testo, Immagine, Pulsante, Video, Divisore, Spaziatore, Icona, Box con icona, Box con immagine, Elenco con icone, Contatore, Barra di avanzamento, Testimonianza, Schede, Fisarmonica, Interruttore, Icone social, Avviso, Valutazione a stelle, HTML, Àncora di menu, Google Maps, Testo su tracciato, Carosello di immagini, Galleria (con lightbox), SoundCloud e Menu di navigazione.

Schede, fisarmoniche e interruttori contengono contenitori, quindi dentro può andare qualunque cosa.

**Blocchi degli altri plugin**: il gruppo **Plugin** del pannello contiene i blocchi degli altri plugin attivi, come la griglia prodotti e il link al carrello di Cleishop. Le impostazioni sono quelle dell'editor a blocchi, la tela li mostra come appariranno nella pagina e la scheda Avanzate funziona come su qualunque widget.

**Cambiare editor.** **Modifica con Fresco** trasforma il contenuto dell'editor a blocchi in elementi di Fresco: il testo mantiene la formattazione, le colonne diventano contenitori in riga e i blocchi senza un widget restano come sono dentro un elemento blocco del plugin. Tornando all'editor a blocchi, il testo torna paragrafi, titoli ed elenchi, le righe di contenitori diventano colonne e i widget senza un blocco corrispondente (box con icona, elenchi con icone, testimonianze, contatori, schede e fisarmoniche) mantengono titoli e testo. Stili e impostazioni di layout non vengono riportati; il contenuto precedente resta nelle revisioni. Per convertire molte pagine insieme c'è il plugin **Converti editor** (**Strumenti → Converti editor**).

## Impostazioni del sito

Le impostazioni del sito (**Site settings**, il kit) valgono per tutte le pagine di Fresco:

- **Colori e font globali**: si scelgono in qualunque controllo di colore o font; cambiandoli una volta si cambia lo stile del sito.
- **Stile del tema**: titoli, pulsanti, immagini e campi dei moduli.
- **Layout**: larghezza dei contenuti, spaziature, breakpoint.
- **Selettore del titolo della pagina**, perché le pagine possano nascondere il titolo del tema. Aurora, Canvas, Pulsar e Vitality lo tolgono da soli dalla pagina, così non compare mai due volte.
- Impostazioni della **lightbox**.

## Modalità atomica

Gli elementi atomici (Flexbox, Griglia, Div, Titolo, Paragrafo, Pulsante, Immagine, SVG, Divisore, YouTube, Video) si stilizzano con **classi e variabili** invece che con impostazioni per singolo elemento: crei classi globali, gli dai stili per dispositivo e stato (hover, focus, active) e le riusi. Le variabili contengono colori, font e misure.

## Modelli

**Templates** salva una sezione o una pagina intera per riusarla, e importa o esporta file `.fresco.json` per spostare i design tra siti.

## Da WordPress

L'importatore di WordPress (**Importa da WordPress** nel menu dell'amministrazione) trasforma un sito costruito con Elementor (ed Elementor Pro) in Fresco:

- **Le pagine** (e le landing page) diventano pagine di Fresco: sezioni, colonne e contenitori, tutti i widget comuni con testi, link, immagini, colori e font globali, tipografia, spaziature, valori per dispositivo, colori al passaggio del mouse, sfondi (con sovrapposizioni e video), bordi, ombre e animazioni d'ingresso. Gli elementi atomici mantengono le varianti di stile e le classi. Arrivano anche le impostazioni della pagina: layout a tutta larghezza o canvas, titolo nascosto, sfondo della pagina e CSS personalizzato.
- **Il kit** confluisce nelle **Impostazioni del sito** di Fresco: colori e font globali (i Google Font vengono caricati), breakpoint, larghezza del contenuto, spazio tra i widget e stile del tema (testi, titoli, pulsanti, immagini, campi dei moduli, lightbox).
- **I widget Pro** diventano i rispettivi elementi di Fresco Pro (modulo, slide, call to action, flip box, tabella e listino prezzi, conto alla rovescia, titolo animato, articoli e loop, caroselli, elementi del tema e altri), ed effetti di movimento, sticky, CSS personalizzato, attributi personalizzati e tag dinamici le rispettive impostazioni di Fresco Pro.
- **I modelli del Theme Builder** (header, footer, singolo, archivio, popup, elementi del loop, sezioni salvate e widget globali) diventano modelli di Fresco Pro con le loro condizioni; i popup mantengono attivatore, frequenza e layout. Codice personalizzato, font personalizzati e CSS personalizzato del kit vanno nelle impostazioni del sito di Fresco Pro.

Widget Pro, modelli e impostazioni Pro si vedono con Fresco Pro: attivalo prima di importare, così vengono importati anche i modelli. Il resoconto dell'importazione elenca ciò che non ha un equivalente o è stato approssimato.

---

## Fresco Pro

Fresco Pro richiede Fresco. Si installa senza licenza come demo; per attivarlo serve la chiave di licenza. Dopo i 12 mesi continua a funzionare: la licenza serve solo per le nuove versioni.

### Theme Builder

**Theme Builder** (nel menu dell'amministrazione) crea modelli per le parti del tema:

| Modello           | Sostituisce                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Header, Footer    | L'header e il footer del tema                                                                    |
| Singolo           | Il layout delle voci; metti un elemento **Contenuto della voce** dove va il contenuto della voce |
| Archivio          | Archivi e risultati di ricerca; metti un elemento **Voci dell'archivio**                         |
| Popup             | Si apre sopra la pagina                                                                          |
| Sezione           | Una parte da riusare con l'elemento **Modello**                                                  |
| Elemento del loop | Un elemento di una Griglia o di un Carosello di loop                                             |

Ogni modello ha delle **condizioni**: includere o escludere tutto il sito, la home, le voci di un tipo, una voce, le voci con un termine, gli archivi, una tassonomia, i risultati di ricerca, la pagina 404. Quando più modelli corrispondono vince il più specifico; il Theme Builder segnala le sovrapposizioni. I temi mostrano i modelli dove segnano le loro posizioni (Canvas, Pulsar, Vitality e Aurora lo fanno). I modelli di archivio valgono anche per gli elenchi dei plugin: la pagina del negozio di Cleishop è l'archivio del tipo `product`, le sue categorie e i suoi marchi sono archivi delle tassonomie `product-category` e `brand`, e l'elemento **Voci dell'archivio** mostra i loro prodotti con filtri e paginazione.

Con il plugin Multilingual un modello si traduce come una pagina: su una pagina in una lingua si usa la sua versione in quella lingua; se non c'è, l'originale.

**Widget del tema**: logo, titolo e motto del sito, titolo, estratto, contenuto, immagine in evidenza e informazioni della voce, titolo e voci dell'archivio, briciole di pane, modulo di ricerca, box dell'autore, navigazione tra le voci e mappa del sito.

### Popup

Un modello popup ha le sue impostazioni in **Page settings → Template**: attivatore (al caricamento dopo un ritardo, allo scorrimento, al raggiungimento di un elemento, dopo alcuni clic, dopo un'inattività, quando il visitatore sta per uscire, da un link), frequenza (sempre, una volta per sessione, ogni N giorni, una volta sola), dopo quante pagine viste, su quali dispositivi, provenendo da quale indirizzo, tra quali date, posizione, dimensioni, velatura, pulsante di chiusura e animazione. I link a `#popup-<id del modello>` lo aprono; `#popup-close` lo chiude.

### Contenuti dinamici

Il pulsante ⚡ accanto ai controlli di testo, link e immagine li riempie con i dati della pagina: titolo, estratto, data, termini, indirizzo e immagine in evidenza della voce, campi personalizzati, titolo e descrizione dell'archivio, titolo e motto del sito, l'anno corrente, l'autore, link di contatto (email, telefono, WhatsApp) e link ai popup. Usali nei modelli perché un solo design mostri tutte le voci.

### Loop

- **Griglia di loop** e **Carosello di loop** disegnano ogni voce con un modello **Elemento del loop**, così la scheda si progetta come qualunque altra parte.
- **Articoli** e **Portfolio** hanno schede pronte; il Portfolio ha una barra di filtri.
- **Filtro per tassonomia** restringe un loop a un termine.

La query sceglie tipo di contenuto, termini, ordine e quantità; la paginazione può essere a numeri, precedente e successivo, o con un pulsante Carica altri. Pagine e filtri fanno parte dell'indirizzo, quindi funzionano anche senza JavaScript. Con più loop in una pagina, dai a ciascuno un **Query ID**.

### Moduli

Il widget **Modulo** ha campi di testo, email, area di testo, telefono, URL, numero, data, ora, menu a tendina, scelta singola, caselle, accettazione, password, nascosto e HTML, colonne e **passaggi** con barra di avanzamento.

Dopo l'invio un modulo può: salvare il messaggio (**Invii dei moduli**, con esportazione CSV), mandare un'email e una seconda email (per esempio al visitatore), reindirizzare, chiamare un webhook, iscrivere la persona a **Mailchimp, ActiveCampaign, Kit, MailerLite, GetResponse o Brevo**, avvisare **Slack** o **Discord**, aprire o chiudere un popup. Tag come `[all-fields]`, `[email]`, `[form-name]` e `[page-url]` compilano email e indirizzi.

Protezione dallo spam: sempre un campo nascosto, più **Cloudflare Turnstile** o **reCAPTCHA** v2/v3. Le chiavi API vanno in **Integrazioni dei moduli**: restano sul server, cifrate, e non compaiono mai nelle pagine né nei modelli esportati. I messaggi rientrano negli strumenti privacy del sito (esportazione e cancellazione per indirizzo email).

Il widget **Accesso** fa entrare i visitatori sul sito stesso, codici a due fattori compresi, e mostra chi ha effettuato l'accesso.

### Widget Pro

Titolo animato, Tabella prezzi, Listino prezzi, Flip box, Call to action, Conto alla rovescia (verso una data, o per visitatore), Citazione, Indice, Pulsanti di condivisione, Codice evidenziato, Hotspot, Avanzamento di lettura, Slide, Carosello media, Carosello di testimonianze, Recensioni, Playlist video, Lottie, Contenuti Facebook (caricati dopo il consenso), Pulsanti flottanti, Link in bio, Pulsanti PayPal e Stripe, Mega menu, Off-canvas (si apre con un link a `#offcanvas-<nome>`), Carosello annidato, Modello, Modulo e Accesso.

**Widget globali**: clic destro su un elemento → **Save as global widget**. Diventa un modello Sezione mostrato da un elemento Modello: cambi il modello e cambiano tutte le copie.

### Effetti e impostazioni avanzate

Ogni elemento riceve, nella scheda **Advanced**:

- **Effetti di movimento** allo scorrimento (spostamento verticale e orizzontale, trasparenza, sfocatura, rotazione, scala) e con il mouse (inseguimento, inclinazione 3D). Rispettano l'impostazione "riduci movimento" del visitatore.
- **Sticky** in alto o in basso nella finestra, oppure dentro il suo contenitore.
- **CSS personalizzato**, dove `selector` è l'elemento stesso.
- **Attributi personalizzati** (`nome|valore`, uno per riga; i gestori di eventi non sono ammessi).
- **Condizioni di visualizzazione**: con o senza accesso, tra due date, giorni della settimana, orari, un parametro dell'indirizzo, tipi di contenuto.

Le pagine hanno **Custom CSS** e **Scroll snap** in **Page settings**.

### Funzioni per il sito

**Codice personalizzato** (amministratori) contiene:

- **CSS del sito**, su ogni pagina.
- **Codice** per `<head>`, l'inizio o la fine del `<body>`, con le stesse condizioni dei modelli: statistiche, pixel, verifiche.
- **Font personalizzati**, caricati come `.woff2`, `.woff`, `.ttf` o `.otf`, poi disponibili in tutti i selettori di font.
- **Icone personalizzate**, caricate come file SVG (ripuliti dagli script), poi disponibili nel selettore di icone; prendono il colore del testo.
- **Transizioni di pagina** tra le pagine del sito, con preloader.

### Ruoli

Fresco Pro aggiunge capacità che puoi dare ai ruoli nella scheda **Ruoli** di **Utenti**:

| Capacità                                        | Ruoli predefiniti                             | Senza                                        |
| ----------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| Modificare le pagine con Fresco                 | Amministratore, editor, autore, collaboratore | Le pagine di Fresco si possono solo guardare |
| Cambiare struttura e stile in Fresco            | Amministratore, editor                        | Solo i contenuti: testi, immagini e link     |
| Gestire i modelli del tema                      | Amministratore                                | Niente Theme Builder                         |
| Vedere i messaggi dei moduli                    | Amministratore, editor                        | Niente Invii dei moduli                      |
| Configurare le integrazioni dei moduli          | Amministratore                                | Niente Integrazioni dei moduli               |
| Aggiungere codice personalizzato e CSS del sito | Amministratore                                | Niente Codice personalizzato                 |

## Licenze

Fresco è GPL-3.0-or-later. Anche Fresco Pro è GPL-3.0-or-later, venduto con l'accesso a download e aggiornamenti. Le icone vengono da Font Awesome Free (CC BY 4.0); le animazioni Lottie sono riprodotte con lottie-web (MIT).
