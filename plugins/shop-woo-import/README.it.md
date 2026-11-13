# WooCommerce Import

Un componente aggiuntivo di Cleishop (plugin ufficiale, gratuito): porta **clienti** e **ordini** di un negozio WooCommerce in Cleishop.

1. **Esporta da WordPress.** Scarica lo script da **Strumenti → Import da WooCommerce** (è anche in `exporter/cleitext-woo-export.php`) ed eseguilo con WP-CLI nella cartella di WordPress: `wp eval-file cleitext-woo-export.php > woocommerce-export.json`. Legge tramite le funzioni di WooCommerce, quindi funziona con le tabelle classiche e con HPOS, e non cambia nulla.
2. **Scegli l'export** nella stessa pagina: viene letto nel browser e inviato a blocchi.
3. **Clienti**: chi ha un ordine pagato, chi ha un ordine, o tutti; volendo solo le email confermate. Gli account nascono **senza password** (ogni cliente la sceglie con «Password dimenticata?»), come membri del sito, nella loro lingua; gli indirizzi di fatturazione e spedizione riempiono il checkout di Cleishop. Lo staff del sito (amministratori, gestori del negozio) resta fuori.
4. **Ordini**: ognuno con il numero che i clienti conoscono, stato, righe (collegate al prodotto Cleishop con lo stesso SKU), tasse, coupon, commissioni, spedizione, note e rimborsi, metodo e id della transazione; dati come gli id PayPal, AvaTax e i numeri di fattura restano con l'ordine. Gli ordini falliti (spesso prove di carte fatte da bot) si possono escludere.

L'export contiene anche le liste di YITH WooCommerce Wishlist, per il componente Lista desideri.

Non parte nessuna email, il magazzino non si muove, nessun servizio di pagamento viene chiamato. Importare di nuovo aggiunge solo ciò che è nuovo. Prodotti, categorie e pagine arrivano con il WordPress Importer: importali prima.

**Ricollega le righe** (1.2, con Cleishop 1.15): per gli ordini già importati, le righe senza prodotto vengono collegate ai prodotti trovati ora (per SKU, altrimenti per slug), ad esempio dopo aver importato altri prodotti. Totali, magazzino ed email non cambiano.

Richiede Cleitext 0.100 o successivo e Cleishop 1.13 o successivo (il suo servizio `shop`, API dei plugin 1.73).
