# Shortcode Embeds

> 🇬🇧 [Read in English](./README.md)

Un plugin di Cleitext per i siti che arrivano da WordPress con shortcode di video e podcast. Quando il sito viene importato con il **WordPress Importer**, trasforma:

- `[fve]https://…[/fve]` (lo shortcode del plugin "Facebook Video Embed", usato sia per i video di YouTube sia per quelli di Facebook) nel blocco **Incorpora** di Cleitext con quell'indirizzo: il player lo disegna il core (YouTube senza cookie, il plugin video di Facebook);
- `[spreaker type=player resource="episode_id=…" …]` (il plugin "Spreaker Shortcode") nel blocco **Player Spreaker**, con lo stesso episodio, show o playlist, altezza, tema e opzioni del player.

Uno shortcode viene convertito quando sta da solo (su una riga o in un paragrafo suo, in un blocco Shortcode, in un widget shortcode o di testo di Elementor), come l'importatore lo passa ai plugin. Un `[fve]` che non contiene l'indirizzo di un sito video conosciuto e uno `[spreaker]` senza un `resource` valido restano come l'importatore tiene gli shortcode sconosciuti, e sono elencati nel resoconto dell'importazione.

Il blocco **Player Spreaker** si può anche aggiungere a mano, nell'editor a blocchi (**Incorpora**) e in Fresco (**Plugin**): si indica `episode_id=…`, `show_id=…` o `playlist_id=…` come nel codice di condivisione di Spreaker.

## Privacy

I player sono iframe di altri siti (youtube-nocookie.com, facebook.com, widget.spreaker.com). Con il plugin **Privacy e GDPR** attivo aspettano il consenso del visitatore alla categoria dei contenuti incorporati (Marketing, se non è stato scelto altro), con un avviso al loro posto; prima non viene chiesto nulla a quei siti.

## Installazione

Caricare `cleitext-plugin-shortcode-embeds-<versione>.zip` in **Plugin → Carica plugin**, oppure sul server `bin/cleitext plugin:install <cartella>`, e attivarlo **prima** di importare l'esportazione di WordPress. Serve l'API dei plugin 1.36 (Cleitext 0.60 o successivo). Permessi: `blocks` (il blocco Spreaker) e `theme:hooks` (il filtro `import.shortcode`).

## Sviluppo

```bash
pnpm --filter @cleitext/plugin-shortcode-embeds test
pnpm --filter @cleitext/plugin-shortcode-embeds build
```

## Licenza

GPL-3.0-or-later © Faghy. Spreaker è un marchio di Spreaker Inc., YouTube di Google LLC, Facebook di Meta Platforms, Inc.: questo plugin non è fatto né approvato da loro.
