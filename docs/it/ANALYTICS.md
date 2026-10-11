# Analytics

> 🇬🇧 [Read in English](../ANALYTICS.md)

Il plugin ufficiale di Cleitext per collegare servizi di misurazione e per webmaster: **Matomo**, **Google Analytics 4**, **Google Tag Manager**, il **Meta Pixel** e la verifica del sito per **Google Search Console** e **Bing Webmaster Tools**. Attivane quanti ne usi. Non è nel pacchetto base: scarica `cleitext-plugin-analytics-<versione>.zip` dalla pagina Releases e caricalo da **Plugin → Carica plugin**.

## Regole privacy applicate per te

Ogni servizio dice al plugin **Privacy e GDPR** cosa fa, e quel plugin applica le regole, senza niente da copiare a mano:

| Servizio                               | Consenso  | Categoria               | Cookie                                               | Policy                                                                              |
| -------------------------------------- | --------- | ----------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Matomo, modalità anonima (consigliata) | non serve | —                       | nessuno                                              | legittimo interesse, statistiche aggregate                                          |
| Matomo con cookie                      | serve     | Statistiche             | `_pk_id.*`, `_pk_ses.*`                              | consenso                                                                            |
| Google Analytics 4                     | serve     | Statistiche             | `_ga`, `_ga_<id>`                                    | consenso, Google, trasferimento negli USA (Data Privacy Framework), Consent Mode v2 |
| Google Tag Manager                     | serve     | Statistiche o Marketing | quelli dei suoi tag (aggiungili in Privacy → Cookie) | consenso, Consent Mode v2                                                           |
| Meta Pixel                             | serve     | Marketing               | `_fbp`, `fr`                                         | consenso, Meta, trasferimento fuori dall'UE                                         |
| Search Console, Bing                   | non serve | —                       | nessuno (un meta tag)                                | —                                                                                   |

- Il banner offre le categorie di cui i servizi hanno bisogno, anche se il sito non ne offre; chiede di nuovo la scelta ai visitatori quando i servizi cambiano.
- I servizi che richiedono il consenso arrivano nella pagina inattivi e partono solo dopo che il visitatore ha accettato la loro categoria. Senza Privacy e GDPR attivo (o con il suo banner spento) non vengono caricati affatto.
- I servizi Google attivano la Google Consent Mode v2: tutto parte _negato_ e segue la scelta.
- I loro cookie compaiono nella tabella dei cookie, e la privacy policy descrive ogni servizio quando la ricrei in **Privacy → Policy**.

**La modalità anonima di Matomo** non usa cookie (`disableCookies`). Il Garante (linee guida del 10 giugno 2021) ammette queste statistiche senza consenso se l'indirizzo IP è mascherato e i dati non vengono incrociati con altri: in Matomo imposta **Privacy → Anonimizza i dati** ad almeno 2 byte.

## Motori di ricerca

Incolla il codice di verifica di Google Search Console (il tag `google-site-verification`, o solo il suo contenuto) o di Bing (`msvalidate.01`), poi invia la sitemap `https://<il tuo sito>/sitemap.xml` nelle loro console.

## Installazione

```bash
bin/cleitext plugin:install plugins/analytics
```

oppure carica lo zip da **Plugin → Carica plugin**, poi attivalo insieme a **Privacy e GDPR**. Le impostazioni sono in **Statistiche** nel menu dell'admin. Richiede Cleitext 0.13 o successivo (API dei plugin 1.4).
