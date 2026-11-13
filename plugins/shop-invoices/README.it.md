# Fatture PDF

Un componente aggiuntivo di Cleishop (plugin ufficiale, gratuito): una fattura in PDF per ogni ordine.

- **Automatica**: la fattura nasce quando un ordine diventa «Completato» (o negli stati che scegli) e viene allegata alle email di Cleishop al cliente.
- **Numerata senza buchi**: prefisso e suffisso (`{year}` è l'anno, ad esempio `FT-{year}/`), le cifre, e la numerazione che riparte da 1 ogni anno se vuoi. Due ordini nello stesso istante non prendono mai lo stesso numero.
- **I tuoi dati**: logo, nome del negozio, indirizzo, partita IVA e un piè di pagina (ad esempio l'IBAN). Codice fiscale, partita IVA, codice SDI e PEC del cliente vengono stampati quando l'ordine li ha.
- **Nella lingua dell'ordine** (italiano o inglese), con ogni aliquota, sconti, spedizione e rimborsi; gli ordini lunghi proseguono su più pagine numerate.
- **Download**: i clienti dal loro account e dalla pagina dell'ordine (un link con la chiave privata dell'ordine); il negozio dall'ordine nell'admin, insieme al **documento di trasporto** (senza prezzi).
- **Un mese in un solo PDF**, per il commercialista: Plugin → Fatture PDF.
- **Da WooCommerce**: gli ordini portati da Import da WooCommerce conservano numeri e date di «PDF Invoices & Packing Slips»; importali e la fattura successiva continua dal numero più alto.

Leggero: il PDF lo scrive il plugin stesso (caratteri Helvetica standard, nessuna libreria esterna).

Richiede Cleitext 0.101 o successivo e Cleishop 1.14 o successivo (i suoi punti di estensione `shop.email-attachments` e `shop.order-documents`).
