# Disbigle

🇬🇧 [Read in English](./README.md)

Il plugin ufficiale di Cleitext che annuncia i tuoi nuovi articoli sul **fediverso** con il tuo account **Disbigle**, o con un account di un altro server compatibile con Mastodon. È gratuito e non è nel pacchetto base: installalo da **Plugin → Aggiungi nuovo** (catalogo), oppure scarica `cleitext-plugin-disbigle-<versione>.zip` dalla pagina delle Release e caricalo in **Plugin → Carica plugin**.

Cleitext non diventa un server ActivityPub: è il tuo server Disbigle a scrivere, firmare e consegnare i post. Il sito parla solo con le sue API.

## Cosa fa

- **Un post per articolo.** Alla prima pubblicazione di un articolo esce un post con il titolo, un riassunto (il riassunto dell’articolo, o l’inizio del testo, circa 300 caratteri) e il link. Con il plugin Multilingual un solo post copre tutte le traduzioni: Disbigle riceve l’articolo in inglese, italiano, spagnolo, francese, tedesco e cinese, quelle che ha, e mostra a ogni follower la sua lingua. Aggiornare o ripubblicare l’articolo non crea mai un secondo post.
- **Menzioni.** Scrivi `@anna@disbigle.com` in un articolo: Anna riceve una notifica e la menzione diventa un link al suo profilo. Chi aggiungi aggiornando un articolo già annunciato viene avvisato una volta, con una risposta non in elenco sotto il post.
- **Hashtag.** Le categorie e i tag dell’articolo diventano hashtag (lettere, cifre e trattini bassi; fino a 10).
- **Commenti dal fediverso.** Sotto l’articolo, il pulsante **Commenta sul fediverso** apre il post: chiunque abbia un account Disbigle, Mastodon o di un altro server del fediverso può rispondere, e le risposte pubbliche compaiono sotto l’articolo, aggiornate ogni pochi minuti. Il loro testo viene ripulito di nuovo dal sito; le immagini arrivano solo dal tuo server (che ne tiene una copia), per gli altri compaiono le iniziali, a meno che tu non attivi gli **avatar remoti**.
- **Mai d’intralcio.** Se il server non risponde o rifiuta il post, l’articolo viene pubblicato lo stesso; l’errore compare in **Impostazioni → Disbigle** e il plugin riprova più tardi quando ha senso (o quando premi **Riprova**). Lo stesso articolo non viene mai pubblicato due volte: ogni tentativo porta la stessa chiave di idempotenza.
- **Sicuro.** L’accesso usa OAuth con PKCE; il token di accesso e il segreto dell’app sono salvati cifrati sul server, mai inviati al browser né scritti nei log. **Scollega** li revoca e li dimentica.

## Come si usa

1. Attiva il plugin e apri **Impostazioni → Disbigle**.
2. Lascia l’istanza `https://app.disbigle.com` (o scrivi il tuo server compatibile con Mastodon) e premi **Collega a Disbigle**.
3. Accedi sul server e consenti a Cleitext di **leggere il tuo account e scrivere post**. Tornato sul sito vedi **Collegato come @tu@server**.
4. Pubblica un articolo. Per escluderne uno, spegni **Annuncia su Disbigle** nella sua barra laterale (sotto **Disbigle**) prima di pubblicarlo.

## Buono a sapersi

- Vengono annunciati solo gli articoli pubblicati dopo il collegamento, non quelli vecchi ripubblicati.
- Gli articoli programmati vengono annunciati entro cinque minuti dall’uscita.
- Le risposte visibili solo ai follower e i messaggi diretti non compaiono mai sul sito. Non compaiono nemmeno le risposte del tuo account (gli avvisi di Disbigle nelle altre lingue).
