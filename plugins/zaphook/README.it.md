# Zaphook

Ogni messaggio dei tuoi moduli di contatto, inviato anche ai servizi che usi. Un plugin ufficiale gratuito di Cleitext.

## Cosa fa

Quando qualcuno ti scrive con un modulo del sito (il plugin **Moduli**), Zaphook passa il messaggio a uno o più **webhook**: l'indirizzo che un altro servizio ti dà per ricevere dati. Ad esempio:

- un **"Catch Hook"** di Zapier, per aggiungere la richiesta a un foglio di calcolo, a un CRM o a una chat;
- uno scenario di **Make** o di **n8n**;
- qualsiasi altro indirizzo `https://` di un tuo servizio.

Il messaggio arriva comunque per email e resta in **Messaggi**, come sempre (a meno che tu non scelga diversamente). Ogni campo parte con il nome che ha nel modulo: un modulo con i campi `nome`, `telefono`, `email`, `comune` e `richiesta` invia esattamente quei nomi, così le automazioni che hai già continuano a funzionare.

- **Scegli i moduli**: tutti i moduli del sito, oppure solo alcuni, per ogni webhook.
- **Non si perde niente**: se l'altro servizio è occupato o irraggiungibile, Zaphook riprova da solo dopo 1 minuto, 5 minuti, 30 minuti, 2 ore e 6 ore.
- **Vedi cosa è successo**: la pagina mostra gli ultimi 200 invii, con il loro esito. Uno non riuscito si può ritentare con un clic.
- **Provalo**: **Invia una prova** manda subito un messaggio di esempio e ti dice la risposta.
- **Firma le richieste** con un segreto, così chi le riceve può verificare che arrivino davvero dal tuo sito.
- **Niente email per questi messaggi**, se vuoi: se ne occupa il webhook, e restano in **Messaggi**.
- **Prima la privacy**: l'indirizzo IP e il browser del visitatore non vengono inviati se non li attivi, e l'informativa privacy scritta dal plugin **Privacy e GDPR** indica i servizi che ricevono i messaggi.

## Come si usa

1. Controlla che **Moduli** (versione 1.9.0 o successiva) sia attivo, poi attiva **Zaphook** in **Plugin**.
2. Nel servizio che usi, crea il webhook: in Zapier, uno Zap che inizia con **Webhooks by Zapier → Catch Hook**; copia l'indirizzo che ti dà.
3. Nell'admin, apri **Impostazioni → Zaphook**, fai clic su **Aggiungi un webhook**, incolla l'indirizzo e salva.
4. Fai clic su **Invia una prova**: il servizio riceve un messaggio di esempio, che lo aiuta a conoscere i campi. Poi invia un messaggio vero con il tuo modulo.

## Per gli sviluppatori

Ogni invio è un `POST` con `Content-Type: application/json`. I campi del modulo sono alla radice, per nome, come inviati (i campi con più valori, come le caselle di spunta, sono liste); le chiavi di Zaphook iniziano con `_`:

```json
{
  "nome": "Mario Rossi",
  "telefono": "+39 333 1234567",
  "email": "mario.rossi@example.com",
  "comune": "Varazze",
  "richiesta": "Vorrei un preventivo per il giardino.",
  "_form": "Richiesta informazioni",
  "_page_url": "https://example.com/contatti",
  "_page_title": "",
  "_submitted_at": "2026-11-18T09:30:00.000Z",
  "_locale": "it",
  "_message_id": "0b7e…"
}
```

`_ip` e `_user_agent` si aggiungono solo quando il webhook li chiede. **Invia una prova** aggiunge `"_test": true`.

**Risposte.** Qualsiasi `2xx` è un invio riuscito. `429`, `5xx`, un tempo scaduto (15 secondi) o un indirizzo irraggiungibile vengono ritentati (1 min, 5 min, 30 min, 2 h, 6 h); `410 Gone` e gli altri `4xx` (e i reindirizzamenti, che non vengono seguiti) lo chiudono come non riuscito. Il registro tiene gli ultimi 200 invii per sito, con i nomi dei campi ma mai i loro valori; i valori di un messaggio inviato vengono cancellati subito, quelli di uno non riuscito dopo 7 giorni (così si può ritentare).

**Firma.** Con un segreto, ogni richiesta porta `X-Zaphook-Timestamp` (secondi Unix) e `X-Zaphook-Signature: sha256=<hex>`, l'HMAC-SHA256 di `<timestamp>.<corpo grezzo>` con il segreto. Per verificarla, ad esempio in Node.js:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, headers, secret) {
  const timestamp = headers['x-zaphook-timestamp'];
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const given = String(headers['x-zaphook-signature'] ?? '');
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300;
  return (
    fresh &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  );
}
```

Usa il corpo esattamente come ricevuto, prima di interpretarlo. Il segreto è conservato cifrato nei segreti del plugin: non viene più mostrato, né scritto nei log, né esportato.

**Come funziona.** Zaphook offre il punto di estensione `forms.delivered` di Moduli (Moduli 1.9.0): mentre il visitatore aspetta mette soltanto il messaggio in coda (la tabella `plg_zaphook.deliveries`, una riga per webhook), e risponde `skipMail` quando un webhook corrispondente chiede di non inviare l'email. Un'attività ogni minuto invia ciò che è dovuto con `ctx.http` (solo indirizzi https pubblici). I valori in coda fanno parte di **Privacy → Richieste** (esportazione e cancellazione per indirizzo email). API dei plugin 1.73; permessi `routes:admin`, `settings:own`, `network`.

## Licenza

GPL-2.0-or-later. Copyright (C) 2026 Serafino Christian.
