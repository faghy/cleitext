# AvaTax

Un componente aggiuntivo di Cleishop (plugin ufficiale, gratuito): le imposte sulle vendite USA calcolate da **Avalara AvaTax**, come fa _WooCommerce AvaTax_.

- **Nel carrello e al checkout**: le imposte di prodotti, spedizione (codice `FR`) e commissioni per l'indirizzo, per giurisdizione (stato, contea, città, distretti speciali) nel riepilogo, nell'ordine, nelle email e nella fattura PDF. Nel carrello una stima dal CAP; gli altri paesi usano le aliquote del negozio.
- **Indirizzi verificati** al checkout (ResolveAddress): un indirizzo USA che Avalara non trova viene rifiutato con un messaggio chiaro.
- **Mai senza imposte**: se Avalara non risponde, il carrello avvisa che mancano le imposte e il checkout si ferma; nessun ordine con imposte a zero per errore.
- **Registrazione degli ordini (commit)**, spenta di default: quando la accendi (al go-live) ogni ordine pagato diventa una _SalesInvoice_ registrata in Avalara per le dichiarazioni, un ordine annullato viene stornato, i rimborsi vengono registrati (interi o in parte). I preventivi sono _SalesOrder_, che Avalara non conserva. Gli ordini importati dal vecchio negozio non vengono mai registrati di nuovo.
- **Impostazioni**: Plugin → AvaTax. Numero di account e chiave di licenza (cifrati, mai più mostrati), sandbox o produzione, codice azienda, da dove parte la merce, codici fiscali di prodotti e spedizione, paesi. «Prova la connessione» mostra l'azienda e il suo nexus.
- **Registro** delle chiamate, spento di default: operazione, tempo, esito, CAP o numero d'ordine; niente nomi, indirizzi né dati di pagamento.

Richiede Cleitext 0.101 o successivo e Cleishop 1.16 o successivo (il suo servizio `shop.taxes`).
