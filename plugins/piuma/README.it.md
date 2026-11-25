# Piuma

Immagini più leggere per Cleitext, gratis.

- **Nuove immagini**: quando carichi un'immagine, viene rimpicciolita se è più grande del necessario (2560 pixel sul lato più lungo, di serie) e salvata di nuovo con una buona compressione (qualità 82 per JPEG e WebP; il PNG resta senza perdita). Le foto PNG senza trasparenza diventano JPEG quando così pesano molto meno; loghi e schermate restano PNG. Un'immagine già leggera resta com'è.
- **La libreria**: le immagini già caricate vengono alleggerite in background, qualcuna ogni minuto, e vedi lo spazio risparmiato. I loro indirizzi non cambiano, quindi le pagine continuano a funzionare.

Cleitext toglie già da solo i dati della fotocamera (posizione GPS, fotocamera, data) dalle foto caricate e crea le copie WebP e AVIF che usano le pagine: Piuma lavora sui file originali.

Impostazioni: **Media → Immagini leggere**. Serve Cleitext 0.120 o successivo (API dei plugin 1.82).
