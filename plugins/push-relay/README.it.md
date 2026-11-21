# Push Relay

Invia le notifiche push dell’app ufficiale Cleitext (iOS e Android) per tutti i siti Cleitext, tramite Firebase Cloud Messaging (HTTP v1). Si installa su cleitext.com: contiene l’account di servizio di Firebase, così i siti non hanno mai bisogno di una chiave Firebase.

## Come funziona

1. Una persona accede al suo sito dall’app Cleitext e registra il telefono (`POST /api/v1/push/devices`).
2. Quando succede qualcosa (un commento da moderare, un messaggio di un modulo, un nuovo ordine), il sito scrive al relay:

   ```http
   POST /api/v1/ext/push-relay/send
   content-type: application/json
   x-cleitext-site: https://example.com

   { "tokens": ["…"], "title": "Nuovo ordine n. 12 — 71,98 €", "body": "Ada Rossi · 3 prodotti",
     "data": { "type": "shop.order", "siteUrl": "https://example.com", "adminPath": "/cl-admin/ext/shop/orders?order=…", "id": "…" } }
   ```

3. Il relay invia un messaggio per telefono e risponde `{ "sent": 2, "invalid": ["…"], "failed": 0 }`. Il sito dimentica i token `invalid` (app rimosse, token rinnovati).

Limiti di una richiesta: 100 token, titolo di 120 caratteri, testo di 400, `data` con al massimo 20 valori di testo. Errori: `400 {error: "invalid_request"}`, `429 {error: "rate_limited"}` (con `retry-after`), `502 {error: "upstream_error"}` (Google ha rifiutato l’account di servizio), `503 {error: "not_configured"}` finché la chiave non è impostata.

## Impostazioni

**Impostazioni → Relay notifiche push** (capacità `manage_push_relay`, amministratori):

- **Account di servizio Firebase**: incolla la chiave JSON (console di Firebase → Impostazioni progetto → Account di servizio → Genera nuova chiave privata). Viene salvata cifrata; la pagina mostra solo il progetto e l’account.
- **Notifiche all’ora per ogni sito**: 300 di base, contate per telefono in base all’indirizzo `x-cleitext-site`. Ogni indirizzo IP può fare anche 120 richieste al minuto. I contatori restano in memoria.

I siti usano `https://cleitext.com/api/v1/ext/push-relay/send` di base; `CLEITEXT_PUSH_RELAY` indirizza un sito verso un altro relay, e un valore vuoto spegne le notifiche.
