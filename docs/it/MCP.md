# Assistenti IA (MCP)

> 🇬🇧 Versione di riferimento in inglese: [docs/MCP.md](../MCP.md). Questa traduzione è secondaria e può essere meno aggiornata.

Cleitext è un **server MCP**: ognuno collega il proprio assistente IA (ChatGPT, Cursor o qualsiasi client MCP) al sito e gli chiede di scrivere pagine e articoli. L'assistente lavora con i blocchi dell'editor e le sezioni del tema, con i permessi della persona che l'ha collegato. Cleitext non chiama nessun servizio di IA e non serve nessuna chiave API.

Nell'admin c'è anche **Chriss**, l'assistente di Cleitext: una chat che fa lo stesso lavoro con il fornitore di IA del sito (vedi [Chat nell'admin](#chat-nelladmin)).

## Attivarlo

Nell'admin apri **Chriss** e scegli _Attiva gli assistenti IA_ (oppure spunta _Permetti agli assistenti IA di lavorare su questo sito_ in **Impostazioni → Assistenti IA (MCP)** e salva). La pagina **Chriss** mostra l'indirizzo da dare all'assistente, `https://<il tuo sito>/mcp`, con il pulsante Copia, i passi per collegarlo e gli assistenti collegati al tuo account. Finché è spento, `/mcp` e gli indirizzi OAuth rispondono 404.

L'indirizzo non è una pagina da aprire nel browser: chi lo apre lì finisce su **Chriss** nell'admin.

## Collegare un assistente

**Con OAuth** (le app con i "connettori personalizzati", come ChatGPT): aggiungi un connettore con l'indirizzo `https://<il tuo sito>/mcp`. L'assistente si registra da solo e apre il sito: accedi all'admin, se serve, e vedi **Collega un assistente**, dove consenti l'accesso: leggere i contenuti, creare e modificare bozze e, solo se lo spunti e il tuo ruolo può pubblicare, pubblicare.

**Con un token** (assistenti da desktop o da riga di comando, editor, script): crea un token in **Profilo → Token API** (_Può modificare_, e _Può pubblicare_ se serve), poi aggiungi il server alla configurazione MCP dell'assistente, per esempio:

```json
{
  "mcpServers": {
    "cleitext": {
      "type": "http",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ctx_…" }
    }
  }
}
```

Ogni collegamento è un token API del tuo account: gli assistenti collegati con OAuth sono in **Chriss → Assistenti collegati** (e in **Profilo → Token API**, con il nome "<assistente> (MCP)"); scollegarlo o revocarlo ferma l'assistente.

## Cosa può fare l'assistente

| Strumento                   | Cosa fa                                                                                                        | Serve         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------- |
| `get_site`                  | Lingue, tipi di contenuto (con il loro editor e i campi personalizzati), editor, tema, menu, e con chi agisce  | lettura       |
| `get_block_guide`           | La guida: regole di Cleitext, guida dell'editor, ciò che aggiungono i plugin, guida del tema, pattern del sito | lettura       |
| `get_pattern`               | I blocchi di un pattern, da riusare                                                                            | lettura       |
| `list_entries`, `get_entry` | Trovare e leggere pagine e articoli, con il loro editor e contenuto                                            | lettura       |
| `list_media`                | Trovare immagini                                                                                               | lettura       |
| `create_entry`              | Creare una pagina, un articolo o una traduzione (`translation_of`) come **bozza**                              | scrittura     |
| `update_entry`              | Cambiare titolo, indirizzo, riassunto, immagine in evidenza, campi personalizzati (SEO…) o testo               | scrittura     |
| `get_preview_link`          | Un link temporaneo per vedere una bozza                                                                        | scrittura     |
| `upload_image`              | Aggiungere un'immagine da un indirizzo https pubblico, con il testo alternativo                                | scrittura     |
| `set_menu`                  | Impostare le voci di un menu in una lingua                                                                     | scrittura     |
| `publish_entry`             | Pubblicare                                                                                                     | pubblicazione |
| `list_comments`             | Commenti in attesa, approvati, spam o nel cestino (serve poter moderare i commenti)                            | lettura       |
| `moderate_comments`         | Approvare, trattenere, segnare come spam o cestinare commenti                                                  | pubblicazione |
| `reply_to_comment`          | Pubblicare una risposta sotto un commento                                                                      | pubblicazione |

I contenuti arrivano come **markup dei blocchi di WordPress** (`<!-- wp:heading -->…`), HTML semplice o blocchi di Cleitext; vengono convertiti e validati come tutto ciò che si salva nell'editor. Un assistente non cancella niente. I plugin possono aggiungere strumenti propri (con nome `<plugin>_<strumento>`), che agiscono anch'essi come l'utente.

### L'editor di ogni contenuto

Ogni contenuto mantiene l'editor con cui è stato fatto: l'editor a blocchi, o quello di un plugin, come **Fresco** o il **Classic Editor**. L'assistente lo conosce e lo mantiene:

- `get_site` elenca gli editor del sito e, per ogni tipo di contenuto, l'editor dei nuovi contenuti. Si sceglie in **Impostazioni → Scrittura** (anche l'admin apre con quello i nuovi contenuti); senza una scelta, l'editor a blocchi.
- `get_entry` restituisce l'`editor` del contenuto e il testo: `blocks` per l'editor a blocchi, `native` (il formato dell'editor, per esempio l'albero di contenitori e widget di Fresco) per gli altri; con `as_blocks: true` lo legge convertito in blocchi.
- `create_entry` e `update_entry` accettano un `editor` facoltativo; una modifica mantiene l'editor del contenuto e le sue impostazioni di pagina, salvo indicazione diversa. Markup dei blocchi, HTML e blocchi inviati per un contenuto di un altro editor vengono convertiti dal suo plugin sul server; i documenti `native` vengono controllati da lui (Fresco rifiuta elementi sconosciuti e widget fuori dai contenitori, e ripulisce il testo formattato). Se il plugin dell'editor non è attivo, o non sa convertire, lo strumento risponde con un errore invece di spostare il contenuto in un altro editor.
- `get_block_guide` è un'unica guida per l'editor richiesto (di default quello del tipo di contenuto): le regole di Cleitext (pagine modificabili da chi non programma, prima le bozze, riassunto, immagine in evidenza, campi SEO, lingue, menu), la guida dell'editor (per Fresco: il formato, gli elementi e le impostazioni, i dispositivi, l'hover, i colori e i caratteri globali del sito), le sezioni aggiunte dai plugin, l'`aiGuide` del tema e i pattern del sito.

Aperta dall'editor di un contenuto con **Chiedi a Chriss**, la chat dell'admin sa di quale contenuto si tratta e con quale editor è fatto.

## Chat nell'admin

La pagina **Chriss** ha anche una **Chat con Chriss** (e l'editor dei contenuti un link **Chiedi a Chriss** che la apre su quel contenuto): scrivi lì la richiesta e Chriss la esegue con l'IA del sito e gli stessi strumenti, come te, mostrando ogni passo (lettura del sito, creazione di una bozza…) e i link per modificare e vedere l'anteprima del risultato. Spunta _Può anche pubblicare_ per lasciarlo pubblicare; altrimenti lascia bozze. Le **Richieste pronte** sono esempi che funzionano bene: usale nella chat o copiale nel tuo assistente.

La chat ha bisogno di un **fornitore di IA**, configurato da un super admin in fondo alla pagina: qualunque servizio con un'API chat completions compatibile con OpenAI (l'indirizzo, come `https://api.openai.com/v1`, `https://openrouter.ai/api/v1` o `http://localhost:11434/v1` per Ollama, un modello che sappia usare gli strumenti, e la chiave). La chiave è salvata cifrata e non viene più mostrata; il fornitore addebita l'uso all'account della chiave. La conversazione resta nella scheda del browser finché non ne inizi una nuova.

## Per chi crea temi e plugin

Aggiungi `aiGuide` (Markdown) alla definizione del tema: come si costruiscono le pagine con il tema, le sue sezioni e classi e quando usarle. Gli assistenti la leggono con `get_block_guide`, insieme ai pattern del sito: è il modo migliore per farli costruire nello stile del tema.

I plugin istruiscono gli assistenti con `ctx.ai` (API dei plugin 1.40, vedi [PLUGIN.md](./PLUGIN.md#assistenti-ia)): un editor con la sua guida, le conversioni e la validazione, sezioni della guida e strumenti.

## Sicurezza

- L'assistente agisce come l'utente: non può mai fare più di quanto permette il suo ruolo.
- I collegamenti di sola lettura non possono cambiare nulla; pubblicare richiede un permesso a parte.
- OAuth: codice di autorizzazione con PKCE (S256), registrazione dinamica dei client, consenso nell'admin, con l'accesso di sempre (i token API non possono darlo), token di accesso validi 7 giorni, token di rinnovo a rotazione validi 90 giorni.
- `/mcp` rifiuta le richieste delle pagine di altri siti nel browser (controllo dell'Origin).
- `upload_image` scarica solo da indirizzi https pubblici: ogni indirizzo a cui punta un nome viene controllato al momento della connessione, redirect compresi; al massimo 15 MB, solo immagini.
- Tutto quello che fa un assistente finisce nel registro attività, come l'utente, tramite il token.
