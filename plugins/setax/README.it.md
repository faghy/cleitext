# Setax

Un filtro per tipo e zona, per i siti che elencano servizi o negozi per zona: «Lavatrici ad Albenga», «Frigoriferi a incasso a Savona».

- **Il blocco «Filtro per tipo e zona»**: due selezioni, i tipi (i termini di una tassonomia delle pagine, es. `elettrodomestici`) e le zone (il campo **Località** delle pagine), un pulsante, poi le pagine che corrispondono con il loro estratto, oppure «Nessun risultato trovato». Funziona con ogni tema, nell'editor a blocchi e in Fresco.
- **Una pagina per ogni scelta**: il modulo apre un indirizzo leggibile, `/zone/?tipo=lavatrici&comune=albenga`, che i motori di ricerca vedono come una pagina a sé: titolo («Lavatrici ad Albenga»), descrizione, indirizzo canonico (uno per scelta, in qualunque ordine siano i parametri), dati strutturati `ItemList` e `BreadcrumbList`, e un posto nella sitemap XML. Le scelte senza risultati, o che non esistono, restano fuori dai motori di ricerca (`noindex, follow`).
- **Ogni pagina con una località è un servizio** (dalla 1.1.0): una pagina con il campo Località riceve uno schema.org `Service`: il tipo è il termine della pagina (es. «Lavatrici»), il comune servito è la sua località (`areaServed`, una `City`) e il fornitore è l'attività descritta dal plugin SEO (SEO 2.5.0, Impostazioni → SEO → Rappresentazione del sito), quando c'è.
- **Link a ogni scelta**: sotto il modulo, i tipi con le zone che hanno risultati, come semplici link, perché visitatori e motori di ricerca le trovino tutte.
- **Da WordPress**: la località di ogni pagina viene letta all'importazione dalla sua meta, un campo ACF come `comune` o qualsiasi meta (Impostazioni → Setax). Le tassonomie del tema le importa già il WordPress Importer.

Nel blocco si scelgono i nomi dei parametri (`tipo`, `comune`…), le etichette, i titoli con `{tipo}` e `{zona}`, la descrizione per i motori di ricerca (`{n}` è il numero di risultati) e il messaggio senza risultati.

Richiede Cleitext 0.96.5 (plugin API 1.63) per i titoli e gli indirizzi canonici delle scelte; con versioni precedenti il filtro funziona e le scelte non vengono indicizzate da sole.

## Licenza

GPL-2.0-or-later. Copyright (C) 2026 Serafino Christian.
