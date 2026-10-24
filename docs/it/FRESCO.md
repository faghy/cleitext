# Fresco e Fresco Pro

Fresco è il page builder visuale di Cleitext: costruisci una pagina trascinandoci sezioni e widget e dandogli uno stile, mentre la vedi con la grafica del tuo sito. **Fresco** è gratuito e sta nel catalogo ufficiale. **Fresco Pro** aggiunge il Theme Builder, i popup, i moduli, i loop, i contenuti dinamici, altri widget ed effetti; costa 67 € per sito con 12 mesi di aggiornamenti.

Una pagina di Fresco è una normale voce di Cleitext: revisioni, traduzioni, esportazione, ricerca, assistenti AI e importazione da WordPress continuano a funzionare. Cambia solo l'editor.

## Primi passi

1. Installa Fresco da **Plugin → Aggiungi nuovo plugin** e attivalo.
2. Apri una pagina e scegli **Modifica con Fresco**, oppure crea una pagina e scegli Fresco come editor. Sul sito, da connesso, anche la barra in alto di una pagina Fresco ha **Modifica con Fresco**.
3. Trascina un **Contenitore** dal pannello nella pagina, poi i widget nel contenitore.
4. Seleziona un elemento per modificarlo nel pannello: schede **Contenuto**, **Stile** e **Avanzate**.
5. **Pubblica** come sempre: la pagina viene salvata con le sue revisioni.

La barra in cima al pannello apre gli **Elementi**, la libreria dei **Modelli**, la **Struttura** (l'albero della pagina), le **Impostazioni pagina** e le **Impostazioni del sito**. Ci sono anche annulla e ripeti (Ctrl+Z, Ctrl+Maiusc+Z); Ctrl+S salva, anche dalla tela.

- **Pannello**: trascinane il bordo destro per allargarlo o stringerlo; un doppio clic sul bordo lo riporta com'era.
- **Struttura**: una finestra che si sposta dalla sua intestazione; lasciata sul bordo destro si aggancia lì, accanto alla tela, con la larghezza che scegli trascinandone il bordo sinistro.
- **Finder** (Ctrl+E, o il suo pulsante): una sola casella di ricerca per gli elementi della pagina, i widget da aggiungere, le altre pagine e articoli del sito (per aprirli in Fresco) e i comandi dell'editor. Maiusc+? elenca le scorciatoie da tastiera.
- **Più elementi**: Ctrl-clic (Cmd-clic su Mac) ne seleziona più di uno, per eliminarli, duplicarli o copiarli insieme.
- **Ripetitori** (voci di elenco, icone social, slide…): trascina una voce dalla sua maniglia per cambiarne l'ordine.

Le **Impostazioni pagina** hanno tre schede. **Impostazioni**: titolo, stato, immagine in evidenza, layout della pagina (quello del tema, **Larghezza piena** o **Canvas**, senza header e footer del tema), titolo del tema e immagine in evidenza nascosti. **Stile**: lo sfondo della pagina (colore, sfumatura o immagine) e la spaziatura attorno al contenuto. **Avanzate**: CSS personalizzato e scroll snap, con Fresco Pro. L'immagine in evidenza nascosta resta negli archivi, nei loop e nelle anteprime social; le pagine a larghezza piena e Canvas non la mostrano mai. Per un'anteprima social senza immagine in evidenza usa il campo **Immagine social** del plugin SEO.

**Colori**: il campione apre un selettore con tinta e **opacità**, il **contagocce** del browser (dove il browser lo ha) e il valore esadecimale o rgba; il globo accanto sceglie uno dei **colori globali**. **Font**: il selettore cerca nell'intero elenco dei **Google Fonts**, con prima i più usati e i font di sistema; in ogni pagina si caricano solo i font che usa.

Le icone sopra la pagina passano tra i **dispositivi**: desktop, tablet e mobile, più i breakpoint attivati in **Impostazioni del sito → Layout** (**schermo ampio**, **portatile**, **tablet extra**, **mobile extra**: fino a sei). I valori di stile impostati su un dispositivo valgono da quel dispositivo in giù (lo schermo ampio: dalla sua larghezza in su). Il clic destro su un elemento offre copia, incolla, incolla stile, ripristina stile, duplica, salva come modello ed elimina; il clic destro sulla tela vuota offre **Copia tutto**, che copia l'intera pagina per incollarla in un'altra.

## Struttura

- **Contenitore**: flex (riga o colonna) o griglia, in riquadro o a tutta larghezza, con sfondo (colore, sfumatura, immagine, un video della libreria che scorre muto dietro il contenuto), velatura, bordo, ombra, divisori sagomati e link. I contenitori si annidano liberamente.
- Larghezza, margini, spaziature interne, posizione e livello di ogni elemento stanno nella scheda **Advanced**, con le animazioni d'ingresso, id e classi CSS e la possibilità di nasconderlo per dispositivo.

## Widget (Fresco)

Titolo, Testo, Immagine, Pulsante, Video, Divisore, Spaziatore, Icona, Box con icona, Box con immagine, Elenco con icone, Contatore, Barra di avanzamento, Testimonianza, Schede, Fisarmonica, Interruttore, Icone social, Avviso, Valutazione a stelle, HTML, Àncora di menu, Google Maps, Testo su tracciato, Carosello di immagini, Galleria (con lightbox), SoundCloud, Menu di navigazione, Pulsanti flottanti (WhatsApp, telefono, SMS, email, Telegram, Messenger e altri, tutti visibili, aperti da un solo pulsante o come riquadro chat) e Link in bio (con immagine di copertina facoltativa).

**Immagini dal desktop**: trascina file di immagine dal computer sulla pagina nell'editor. Vanno nella libreria media e diventano elementi Immagine dove li rilasci; rilasciane uno su un elemento Immagine per sostituirne l'immagine.

Schede, fisarmoniche e interruttori contengono contenitori, quindi dentro può andare qualunque cosa.

**Blocchi degli altri plugin**: il gruppo **Plugin** del pannello contiene i blocchi degli altri plugin attivi, come la griglia prodotti e il link al carrello di Cleishop. Le impostazioni sono quelle dell'editor a blocchi, la tela li mostra come appariranno nella pagina e la scheda Avanzate funziona come su qualunque widget. Un plugin che offre il suo blocco anche come elemento proprio, con `registerElement` di Fresco e lo stesso tipo del blocco (lo **Slider** di Diorama, in **Media**), compare una volta sola, come quell'elemento (Fresco 2.8.2).

**Cambiare editor.** **Modifica con Fresco** trasforma il contenuto dell'editor a blocchi in elementi di Fresco: il testo mantiene la formattazione, le colonne diventano contenitori in riga e i blocchi senza un widget restano come sono dentro un elemento blocco del plugin. Tornando all'editor a blocchi, il testo torna paragrafi, titoli ed elenchi, le righe di contenitori diventano colonne e i widget senza un blocco corrispondente (box con icona, elenchi con icone, testimonianze, contatori, schede e fisarmoniche) mantengono titoli e testo. Stili e impostazioni di layout non vengono riportati; il contenuto precedente resta nelle revisioni. Per convertire molte pagine insieme c'è il plugin **Converti editor** (**Strumenti → Converti editor**). Per lasciare Fresco mantenendo l'impaginazione (sezioni a tutta larghezza, colonne con le loro larghezze, colori e spaziature) c'è il plugin **Importa layout** (**Strumenti → Importa layout → Pagine Fresco di questo sito**): segnala ciò che non ha un blocco.

## Impostazioni del sito

Le impostazioni del sito (**Site settings**, il kit) valgono per tutte le pagine di Fresco:

- **Colori e font globali**: si scelgono in qualunque controllo di colore o font; cambiandoli una volta si cambia lo stile del sito.
- **Stile del tema**: titoli, pulsanti, immagini e campi dei moduli.
- **Layout**: larghezza dei contenuti, spaziature, breakpoint (quelli in più restano spenti finché non li attivi; le pagine fatte prima restano uguali).
- **Selettore del titolo della pagina**, perché le pagine possano nascondere il titolo del tema. Aurora, Canvas, Pulsar e Vitality lo tolgono da soli dalla pagina, così non compare mai due volte.
- Impostazioni della **lightbox**.

### Google Fonts e privacy

**Impostazioni del sito → Font globali → Google Fonts** stabilisce da dove le pagine prendono i Google Font del kit e degli elementi (da Fresco 2.8):

- **Ospita su questo sito** (il predefinito, anche per i siti creati prima): la prima volta che una pagina usa una famiglia, il server scarica una sola volta da Google il suo foglio di stile e i file dei font (solo da `fonts.googleapis.com` e `fonts.gstatic.com`, in https, con limiti di dimensione e di tempo, presentandosi come un browser moderno così i file sono WOFF2 divisi per alfabeto) e li conserva nella tabella di Fresco. Le pagine collegano la copia del sito (`/_fresco/gfonts/<nome>.css`, con i suoi file accanto, in cache per un anno): **nessun browser dei visitatori contatta Google**, quindi per i font non serve il consenso (LG München, 20 gennaio 2022; il Garante italiano è dello stesso avviso). Una pagina aspetta al massimo 2,5 secondi una famiglia nuova; se il download dura di più o non riesce, la pagina mostra il font di riserva, mai il link a Google, l'errore finisce nel log e il download viene ritentato più tardi (dopo 10 minuti, poi a intervalli più lunghi; **Strumenti → Rigenera CSS** lo ritenta subito). Quando la copia è pronta, le pagine in cache rimaste senza vengono aggiornate.
- **Carica da Google**: le pagine collegano `fonts.googleapis.com`, come prima della 2.8. L'indirizzo IP dei visitatori arriva a Google: nell'UE serve il loro consenso. Da Cleitext 0.71 il core ospita sul sito, per impostazione predefinita, ogni link a Google Fonts di una pagina (**Impostazioni → Generali → Privacy → Web font**, [Privacy](./PRIVACY.md#web-font-ospitati-sul-sito)): perché le pagine carichino davvero da Google, scegli anche lì **Caricali da Google o Bunny Fonts**.
- **Non caricare**: Fresco non aggiunge nessun Google Font; li fornisce il tema o il tuo CSS (per esempio con regole `@font-face` di font ospitati sul sito).

Qualunque sia la scelta, Fresco non aggiunge mai una famiglia che la pagina carica già da sé: una che il tema collega da Google Fonts o Bunny Fonts (`<link rel="stylesheet">` o `@import`) o dichiara con `@font-face` in uno `<style>` della pagina (i temi scrivono lì il loro CSS; anche i font personalizzati di Fresco Pro), o una che **Prisma** ha già aggiunto dalle sue copie (ogni link indica la sua famiglia). Una famiglia dichiarata solo dentro un file CSS collegato non viene vista: se il tuo tema fa così, scegli **Non caricare**. Le famiglie si confrontano per nome, non per peso: un peso che il tema non ha viene simulato dal browser.

La tela dell'editor segue la stessa scelta: con **Ospita su questo sito** usa anch'essa le copie del sito (una famiglia scelta per la prima volta compare dopo qualche secondo, mentre il server la copia), con **Carica da Google** le carica da Google, con **Non caricare** nessuna. Il plugin **Privacy e GDPR** può controllare le pagine: **Privacy → Banner cookie → Font da Google**.

## Modalità atomica

Gli elementi atomici (Flexbox, Griglia, Div, Titolo, Paragrafo, Pulsante, Immagine, SVG, Divisore, YouTube, Video) si stilizzano con **classi e variabili** invece che con impostazioni per singolo elemento: crei classi globali, gli dai stili per dispositivo e stato (hover, focus, active) e le riusi. Le variabili contengono colori, font e misure.

## Modelli

**Modelli** salva una sezione o una pagina intera per riusarla, e importa o esporta file `.fresco.json` per spostare i design tra siti. Puoi cercarli per nome, vederne l'anteprima alla larghezza di un desktop, di un tablet o di un telefono prima di inserirli, rinominarli ed eliminarli, nell'editor (Ctrl/⌘+Maiusc+L) o in **Fresco → Modelli**.

**Importa** accetta anche i **modelli di Elementor**: i file `.json` che Elementor esporta da **Modelli → Esporta**, o che distribuiscono i siti di modelli (non i kit in `.zip`). Vengono convertiti come l'importatore di WordPress converte le pagine di Elementor; il titolo resta, un modello di tipo pagina diventa una pagina, ogni altro tipo una sezione. Le immagini restano al loro indirizzo originale (non viene scaricato nulla): un avviso dice quante sono, così puoi caricarle nella libreria media e sostituirle. I widget senza un equivalente in Fresco mantengono solo il loro testo, e gli elementi che questo sito non ha (quelli di Fresco Pro, senza Fresco Pro) vengono tralasciati; un avviso ne indica il numero. I colori e i font globali si riferiscono a quelli di questo sito.

## Il menu di Fresco

Oltre alla panoramica e a **Modelli**, il menu **Fresco** dell'amministrazione ha (per gli amministratori):

- **Impostazioni del sito**: apre l'editor sul pannello delle impostazioni del sito, anche prima di aver fatto una pagina con Fresco (viene creata una pagina in bozza apposta).
- **Strumenti**: **Rigenera il CSS** (quando una pagina appare sbagliata dopo un aggiornamento), **Sostituisci URL** (dopo aver spostato il sito su un nuovo indirizzo o su HTTPS: conta il vecchio indirizzo in ogni pagina e modello di Fresco, poi lo sostituisce; le revisioni precedenti restano) e le versioni di Cleitext, Fresco e Fresco Pro.
- **Gestione elementi**: tutti gli elementi dell'editor, con quanto il sito li usa (contato quando lo chiedi). Disattiva quelli che non ti servono: escono dal pannello dell'editor, e le pagine che li hanno continuano a mostrarli.
- **Modalità sicura** (in **Strumenti**, o nel menu Fresco dell'editor): apre una pagina nell'editor con i blocchi degli altri plugin e gli stili del tema e degli altri plugin disattivati. Se lì il problema sparisce, la causa è uno di questi. Una barra sopra il canvas permette di uscirne.
- **Informazioni di sistema**: versioni, server, sito, tema e plugin attivi, con un pulsante che li copia per una richiesta di assistenza.

## Assistenti IA

**Chriss**, l'assistente di Cleitext, e gli assistenti collegati via MCP sanno quali pagine sono fatte con Fresco e le mantengono pagine Fresco ([MCP](MCP.md)). Leggono la guida di Fresco (elementi e impostazioni, dispositivi, hover, colori e font globali del sito) e scrivono direttamente contenitori e widget; blocchi o HTML mandati per una pagina Fresco vengono convertiti da Fresco. Quello che scrivono viene controllato: elementi sconosciuti e widget fuori dai contenitori vengono rifiutati, e il testo formattato viene ripulito. **Chiedi a Chriss** nell'editor della voce apre la chat su quella pagina.

## Da WordPress

L'importatore di WordPress (**Importa da WordPress** nel menu dell'amministrazione) trasforma un sito costruito con Elementor (ed Elementor Pro) in Fresco:

- **Le pagine** (e le landing page) diventano pagine di Fresco: sezioni, colonne e contenitori, tutti i widget comuni con testi, link, immagini, colori e font globali, tipografia, spaziature, valori per dispositivo, colori al passaggio del mouse, sfondi (con sovrapposizioni e video), bordi, ombre e animazioni d'ingresso. Gli elementi atomici mantengono le varianti di stile e le classi. Arrivano anche le impostazioni della pagina: layout a tutta larghezza o canvas, titolo nascosto, sfondo della pagina e CSS personalizzato.
- **Il kit** confluisce nelle **Impostazioni del sito** di Fresco: colori e font globali (i Google Font vengono caricati, ospitati sul sito per impostazione predefinita), breakpoint, larghezza del contenuto, spazio tra i widget e stile del tema (testi, titoli, pulsanti, immagini, campi dei moduli, lightbox).
- **I widget Pro** diventano i rispettivi elementi di Fresco Pro (modulo, slide, call to action, flip box, tabella e listino prezzi, conto alla rovescia, titolo animato, articoli e loop, caroselli, elementi del tema e altri), ed effetti di movimento, sticky, CSS personalizzato, attributi personalizzati e tag dinamici le rispettive impostazioni di Fresco Pro.
- **I modelli del Theme Builder** (header, footer, singolo, archivio, popup, elementi del loop, sezioni salvate e widget globali) diventano modelli di Fresco Pro con le loro condizioni; i popup mantengono attivatore, frequenza e layout. Codice personalizzato, font personalizzati e CSS personalizzato del kit vanno nelle impostazioni del sito di Fresco Pro.

Gli shortcode di altri plugin che stanno da soli in un widget shortcode, testo o HTML diventano i blocchi di quei plugin quando un plugin attivo li converte (es. `[kross-booking]` di Kross Booking), dentro un elemento blocco di plugin; gli altri restano testo.

Widget Pro, modelli e impostazioni Pro si vedono con Fresco Pro: attivalo prima di importare, così vengono importati anche i modelli. Il resoconto dell'importazione elenca ciò che non ha un equivalente o è stato approssimato.

---

## Fresco Pro

Fresco Pro richiede Fresco. Si installa senza licenza come demo; per attivarlo serve la chiave di licenza. Dopo i 12 mesi continua a funzionare: la licenza serve solo per le nuove versioni.

### Theme Builder

**Theme Builder** (in **Fresco → Modelli**) crea modelli per le parti del tema:

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

**Modelli → Popup** elenca i modelli popup e ne crea di nuovi. Un modello popup ha le sue impostazioni in **Page settings → Template**: attivatore (al caricamento dopo un ritardo, allo scorrimento, al raggiungimento di un elemento, dopo alcuni clic, dopo un'inattività, quando il visitatore sta per uscire, da un link), frequenza (sempre, una volta per sessione, ogni N giorni, una volta sola), dopo quante pagine viste, su quali dispositivi, provenendo da quale indirizzo, tra quali date, posizione, dimensioni, velatura, pulsante di chiusura e animazione. I link a `#popup-<id del modello>` lo aprono; `#popup-close` lo chiude.

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

Protezione dallo spam: sempre un campo nascosto, più **Cloudflare Turnstile** o **reCAPTCHA** v2/v3. Le chiavi API vanno in **Integrazioni dei moduli**: restano sul server, cifrate, e non compaiono mai nelle pagine né nei modelli esportati. I messaggi rientrano negli strumenti privacy del sito (esportazione e cancellazione per indirizzo email). Con il plugin gratuito **Captcha** un modulo può usare invece il **captcha del sito** (chiavi impostate una volta in Impostazioni → Captcha); lo usano anche i moduli senza chiavi proprie e quelli con il solo campo nascosto, quando il plugin Captcha protegge i moduli dei page builder.

Il widget **Accesso** fa entrare i visitatori sul sito stesso, codici a due fattori compresi, e mostra chi ha effettuato l'accesso.

### Widget Pro

Titolo animato, Tabella prezzi, Listino prezzi, Flip box, Call to action, Conto alla rovescia (verso una data, o per visitatore), Citazione, Indice, Pulsanti di condivisione, Codice evidenziato, Hotspot, Avanzamento di lettura, Slide, Carosello media, Carosello di testimonianze, Recensioni, Playlist video, Lottie, Contenuti Facebook (caricati dopo il consenso), Pulsanti PayPal e Stripe, Mega menu, Off-canvas (si apre con un link a `#offcanvas-<nome>`), Carosello annidato, Modello, Modulo e Accesso.

**Widget globali**: clic destro su un elemento → **Save as global widget**. Diventa un modello Sezione mostrato da un elemento Modello: cambi il modello e cambiano tutte le copie.

### Effetti e impostazioni avanzate

Ogni elemento riceve, nella scheda **Advanced**:

- **Effetti di movimento** allo scorrimento (spostamento verticale e orizzontale, trasparenza, sfocatura, rotazione, scala) e con il mouse (inseguimento, inclinazione 3D). Rispettano l'impostazione "riduci movimento" del visitatore.
- **Sticky** in alto o in basso nella finestra, oppure dentro il suo contenitore.
- **CSS personalizzato**, dove `selector` è l'elemento stesso.
- **Attributi personalizzati** (`nome|valore`, uno per riga; i gestori di eventi non sono ammessi).
- **Condizioni di visualizzazione**: con o senza accesso, tra due date, giorni della settimana, orari, un parametro dell'indirizzo, tipi di contenuto.

Le pagine hanno **CSS personalizzato** e **scroll snap** nella scheda **Avanzate** delle **Impostazioni pagina**.

### Funzioni per il sito

**Codice personalizzato** (amministratori) contiene:

- **CSS del sito**, su ogni pagina.
- **Codice** per `<head>`, l'inizio o la fine del `<body>`, con le stesse condizioni dei modelli: statistiche, pixel, verifiche.
- **Transizioni di pagina** tra le pagine del sito, con animazione di caricamento.

**Font e icone** (amministratori) contiene:

- **Font personalizzati**, caricati come `.woff2`, `.woff`, `.ttf` o `.otf`, poi disponibili in tutti i selettori di font.
- **Icone personalizzate**, caricate come file SVG (ripuliti dagli script), poi disponibili nel selettore di icone; prendono il colore del testo.

**Licenza** (sotto Fresco, per chi attiva i plugin) mostra la licenza di Fresco Pro sul sito, come fa **Plugin**: inserisci la chiave, verificala, rinnovala o rimuovila.

### Ruoli

Fresco Pro aggiunge capacità che puoi dare ai ruoli nella scheda **Ruoli** di **Utenti**:

| Capacità                                        | Ruoli predefiniti                             | Senza                                        |
| ----------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| Modificare le pagine con Fresco                 | Amministratore, editor, autore, collaboratore | Le pagine di Fresco si possono solo guardare |
| Cambiare struttura e stile in Fresco            | Amministratore, editor                        | Solo i contenuti: testi, immagini e link     |
| Gestire i modelli del tema                      | Amministratore                                | Niente Theme Builder                         |
| Vedere i messaggi dei moduli                    | Amministratore, editor                        | Niente Invii dei moduli                      |
| Configurare le integrazioni dei moduli          | Amministratore                                | Niente Integrazioni dei moduli               |
| Aggiungere codice personalizzato e CSS del sito | Amministratore                                | Niente Codice personalizzato, Font e icone   |

## Estendere l'editor (per chi scrive plugin)

Gli altri plugin estendono Fresco con `extensions()`, liste a cui aggiungono elementi dal proprio ingresso admin. Da Fresco 2.5 l'editor ha quattro hook in più, ognuno riceve il contesto dell'editor aperto (`entry`, `selected()`, `select(id)`, `node(id)`, `canvas()`, `reveal(id)`, `refresh()`, `notify(testo)`):

- **`topbarItems`**: pulsanti nella barra in alto, prima del Finder, con un badge (`badge(editor)` restituisce un numero o un breve testo; oltre 99 mostra `99+`).
- **`shortcuts`**: scorciatoie da tastiera (`keys: 'Shift+C'`, Ctrl vale anche ⌘), nell'editor e nell'area di disegno, elencate nella finestra **Scorciatoie da tastiera** (Shift+?); quelle di Fresco hanno la precedenza.
- **`canvasOverlays`**: livelli React disegnati sopra la pagina nell'area di disegno, con i riquadri degli elementi di cui chiedono gli id; un clic su di essi non seleziona mai un elemento.
- **`contextMenuItems`**: voci del menu del tasto destro di un elemento, in un gruppo prima di **Elimina**.

Un'estensione che dà errore non rompe mai l'editor: l'errore va nel log e l'estensione viene tralasciata. Tipi ed esempio completo nella [guida in inglese](../FRESCO.md#extending-the-editor-for-plugin-authors).

## Licenze

Fresco è GPL-3.0-or-later. Anche Fresco Pro è GPL-3.0-or-later, venduto con l'accesso a download e aggiornamenti. Le icone vengono da Font Awesome Free (CC BY 4.0); le animazioni Lottie sono riprodotte con lottie-web (MIT).
