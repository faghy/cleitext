# AI Relay

Chriss base, l'AI gratuita di ogni sito Cleitext. Installato su cleitext.com, risponde alle richieste della chat dei siti con il fornitore AI di cleitext.com (quello impostato in Admin → Chriss, per esempio un Ollama locale su `http://127.0.0.1:11434/v1`, modello `chriss-base`), entro una piccola quota giornaliera per sito. I siti non raggiungono mai quel fornitore: parlano solo con il relay. Nessun testo delle richieste viene salvato o registrato nei log.

## Come funziona

1. In Admin → Chriss un super admin fa clic su **Attiva** sotto _Chriss base (gratis)_. Il sito crea un segreto monouso, ne mostra lo SHA-256 su `https://<sito>/.well-known/cleitext-ai-relay` e invia al relay `POST /api/v1/ext/ai-relay/register` con `{ "origin": "https://example.com", "secret": "…" }`.

   Il relay legge l'indirizzo well-known (solo https pubblico) e controlla l'hash: solo il sito a quell'indirizzo può registrarlo. Risponde `{ "key": "cxai_…", "model": "chriss-base", "limit": 20 }` e conserva solo lo SHA-256 della chiave. Il sito salva la chiave, cifrata, come chiave del fornitore, con l'indirizzo `https://cleitext.com/api/v1/ext/ai-relay/v1`.

2. La chat del sito invia richieste compatibili con OpenAI (senza streaming, con gli strumenti) a `POST /api/v1/ext/ai-relay/v1/chat/completions` con `authorization: Bearer cxai_…`. La risposta è un `chat.completion` con `model: "chriss-base"` e gli header `x-ratelimit-limit`, `x-ratelimit-remaining` (domande rimaste oggi) e `x-ratelimit-reset` (secondi Unix, prossima mezzanotte UTC).

   Da AI Relay 1.1 (core 0.117.0) i siti chiedono invece con un **job**, così nessuna richiesta dura a lungo (un proxy come Cloudflare interrompe quelle oltre i 100 secondi, mentre un modello piccolo su CPU può metterci minuti): `POST /api/v1/ext/ai-relay/v1/chat/jobs` con lo stesso corpo, gli stessi limiti e controlli di `chat/completions`, e la domanda contata subito; anche gli errori (`413 prompt_too_long`, `429 quota_exceeded`, `503 busy`…) arrivano subito. Altrimenti, in un attimo: `202 { "id": "job_…", "status": "queued", "position": 0, "limit": 20, "remaining": 19, "resetAt": "…" }`. Il sito poi chiede ogni paio di secondi `GET /api/v1/ext/ai-relay/v1/chat/jobs/job_…` (stessa chiave), che risponde `{ "id", "status": "queued" | "running" | "done" | "error", "position"?, "result"?, "error"?, "limit", "remaining", "resetAt" }`: `position` (in coda) è il numero di richieste davanti (0: tocca a lei); `result` (done) è l'oggetto `chat.completion` qui sopra; `error` (error) è `{ "error": "upstream_error" | "not_configured" | "busy" | "abandoned", "message" }`, e la domanda viene restituita. Un sito ha un job alla volta (un altro: `409 job_active` con il suo `id`); il job di un altro sito, uno sconosciuto o uno risposto da più di 10 minuti: `404 not_found`. Un job in attesa che nessuno chiede da 30 secondi viene scartato al suo turno. Il job gira nella stessa coda di `chat/completions`, in background, non legato alla richiesta; `chat/completions` funziona come prima.

3. `GET /api/v1/ext/ai-relay/usage` (stessa chiave) risponde `{ limit, used, remaining, resetAt }`; `GET /api/v1/ext/ai-relay/v1/models` elenca `chriss-base`.

## Limiti

- **Domande al giorno per sito** (20): una richiesta il cui ultimo messaggio è della persona. I giri con i risultati degli strumenti che seguono una domanda sono liberi fino a **richieste per domanda** (8) per il numero di domande.
- **Richieste al minuto da un indirizzo** (10), **richieste al giorno da tutti i siti** (2000), **richieste servite contemporaneamente** (1: su una CPU due insieme si rallentano a vicenda); le altre aspettano in ordine in una coda di **richieste in attesa del turno** (5, al massimo un minuto e mezzo), oltre la quale ricevono `503 busy` con `retry-after`.
- **Token di una risposta** (1024) e **caratteri di una richiesta** (22 000, circa 6 000 token; oltre: `413 prompt_too_long`). I siti stessi inviano a Chriss base solo gli strumenti essenziali con descrizioni brevi e un prompt breve (circa 1 500 token, identici a ogni turno così il server del modello li tiene già letti), e accorciano la conversazione a circa 6 000 token.

Oltre un limite giornaliero: `429 { "error": "quota_exceeded", "limit": 20, "resetAt": "…", "scope": "site" | "global" }`, che il sito trasforma nell'invito a collegare il proprio servizio AI.

Le risposte possono richiedere tempo (un modello piccolo su CPU legge un prompt lungo in decine di secondi): `chat/completions` e `register` usano il tempo dei job in background del core (`timeout: 'job'`, API dei plugin 1.79), e un proxy davanti al server deve permettere per loro richieste di qualche minuto. I job non ne hanno bisogno: ogni richiesta è breve, e un job aspetta il suo turno fino a tre minuti. Letture dei job: 600 al minuto da un indirizzo.

## Impostazioni

**Impostazioni → Relay AI** (capability `manage_ai_relay`, amministratori): accendere o spegnere il servizio, cambiare i limiti, vedere i siti registrati con le domande e le richieste di oggi, revocare un sito (la sua chiave smette di funzionare e non può registrarsi di nuovo) o consentirlo di nuovo.

I siti usano `https://cleitext.com/api/v1/ext/ai-relay` per impostazione predefinita; `CLEITEXT_AI_RELAY` indica un altro relay, e un valore vuoto nasconde Chriss base.
