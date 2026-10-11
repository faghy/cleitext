# Assistenti IA (MCP)

> 🇬🇧 Versione di riferimento in inglese: [docs/MCP.md](../MCP.md). Questa traduzione è secondaria e può essere meno aggiornata.

Cleitext è un **server MCP**: ognuno collega il proprio assistente IA (ChatGPT, Cursor o qualsiasi client MCP) al sito e gli chiede di scrivere pagine e articoli. L'assistente lavora con i blocchi dell'editor e le sezioni del tema, con i permessi della persona che l'ha collegato. Cleitext non chiama nessun servizio di IA e non serve nessuna chiave API.

## Attivarlo

In **Impostazioni → Assistenti IA (MCP)** spunta _Permetti agli assistenti IA di lavorare su questo sito_ e salva. Lì trovi l'indirizzo da dare all'assistente: `https://<il tuo sito>/mcp`. Finché è spento, `/mcp` e gli indirizzi OAuth rispondono 404.

## Collegare un assistente

**Con OAuth** (le app con i "connettori personalizzati", come ChatGPT): aggiungi un connettore con l'indirizzo `https://<il tuo sito>/mcp`. L'assistente si registra da solo, apre l'accesso di Cleitext e ti chiede di consentire: leggere i contenuti, creare e modificare bozze e, solo se lo spunti e il tuo ruolo può pubblicare, pubblicare.

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

Ogni collegamento è un token API del tuo account: lo trovi in **Profilo → Token API** (quelli OAuth si chiamano "<assistente> (MCP)"), e revocarlo scollega l'assistente.

## Cosa può fare l'assistente

| Strumento                   | Cosa fa                                                                                  | Serve         |
| --------------------------- | ---------------------------------------------------------------------------------------- | ------------- |
| `get_site`                  | Lingue, tipi di contenuto, tema, menu, e con chi agisce                                  | lettura       |
| `get_block_guide`           | Come scrivere i blocchi: blocchi del core e dei plugin, guida del tema, pattern del sito | lettura       |
| `get_pattern`               | I blocchi di un pattern, da riusare                                                      | lettura       |
| `list_entries`, `get_entry` | Trovare e leggere pagine e articoli, con i loro blocchi                                  | lettura       |
| `list_media`                | Trovare immagini                                                                         | lettura       |
| `create_entry`              | Creare una pagina, un articolo o una traduzione (`translation_of`) come **bozza**        | scrittura     |
| `update_entry`              | Cambiare titolo, indirizzo, riassunto, immagine in evidenza o testo                      | scrittura     |
| `get_preview_link`          | Un link temporaneo per vedere una bozza                                                  | scrittura     |
| `upload_image`              | Aggiungere un'immagine da un indirizzo https pubblico, con il testo alternativo          | scrittura     |
| `set_menu`                  | Impostare le voci di un menu in una lingua                                               | scrittura     |
| `publish_entry`             | Pubblicare                                                                               | pubblicazione |

I contenuti arrivano come **markup dei blocchi di WordPress** (`<!-- wp:heading -->…`), HTML semplice o blocchi di Cleitext; vengono convertiti e validati come tutto ciò che si salva nell'editor, quindi il risultato si apre sempre nell'editor a blocchi. Un assistente non cancella niente.

## Per chi crea temi

Aggiungi `aiGuide` (Markdown) alla definizione del tema: come si costruiscono le pagine con il tema, le sue sezioni e classi e quando usarle. Gli assistenti la leggono con `get_block_guide`, insieme ai pattern del sito: è il modo migliore per farli costruire nello stile del tema.

## Sicurezza

- L'assistente agisce come l'utente: non può mai fare più di quanto permette il suo ruolo.
- I collegamenti di sola lettura non possono cambiare nulla; pubblicare richiede un permesso a parte.
- OAuth: codice di autorizzazione con PKCE (S256), registrazione dinamica dei client, consenso sulla pagina del sito, token di accesso validi 7 giorni, token di rinnovo a rotazione validi 90 giorni.
- `/mcp` rifiuta le richieste delle pagine di altri siti nel browser (controllo dell'Origin).
- `upload_image` scarica solo da indirizzi https pubblici: ogni indirizzo a cui punta un nome viene controllato al momento della connessione, redirect compresi; al massimo 15 MB, solo immagini.
- Tutto quello che fa un assistente finisce nel registro attività, come l'utente, tramite il token.
