# Checklist OWASP ASVS

Cleitext punta a **OWASP ASVS 5.0, livello 2** (RNF-08 in [SPECIFICHE.md](SPECIFICHE.md)). La versione completa, capitolo per capitolo e con i file da controllare, è in inglese: [docs/ASVS.md](../ASVS.md). Viene rivista a ogni milestone.

Ultima revisione: ottobre 2026, versione 0.17.0.

## Sintesi

| Capitolo                    | Stato | Note                                                                                                                                                                |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 Codifica e sanificazione | ✅    | Rendering React lato server, testo ricco strutturato (CXD), URL filtrati, blocco HTML sanificato con allowlist per chi non ha `unfiltered_html`.                    |
| V2 Validazione e logica     | ✅    | Schemi Zod su ogni richiesta, transizioni di stato controllate dal server, blocco progressivo degli accessi.                                                        |
| V3 Sicurezza del frontend   | ⚠️    | CSP rigorosa nell'admin; sul sito pubblico niente restrizioni sugli script, perché gli amministratori possono pubblicare il proprio HTML.                           |
| V4 API                      | ✅    | Errori RFC 9457, token API con hash, scope, scadenza e limiti del proprietario.                                                                                     |
| V5 File                     | ✅    | Tipo riconosciuto dal contenuto, SVG rifiutati, percorsi costruiti dal server (nome originale ridotto a `a-z 0-9 - _ .`, mai sovrascritti), media isolati per sito. |
| V6 Autenticazione           | ✅    | argon2id, 2FA TOTP con codici di recupero, passkey, nessuna enumerazione degli account, nuove password controllate contro quelle trapelate.                         |
| V7 Sessioni                 | ✅    | Token casuali salvati come hash, scadenze, revoca dal profilo e al cambio password.                                                                                 |
| V8 Autorizzazione           | ✅    | Negato per impostazione predefinita, controlli per oggetto, row level security forzata su ogni tabella, ruoli e schemi separati per i plugin.                       |
| V9 Token autosufficienti    | ➖    | Nessun JWT; le anteprime usano link firmati HMAC con scadenza.                                                                                                      |
| V10 OAuth e OIDC            | ✅    | OAuth 2.1 per gli assistenti IA: solo authorization code, PKCE S256 obbligatorio, redirect esatti, refresh token ruotati. OIDC previsto.                            |
| V11 Crittografia            | ✅    | Segreti cifrati con AES-256-GCM, confronti a tempo costante, solo librerie standard.                                                                                |
| V12 Comunicazioni           | ✅    | HTTPS forzato per dominio e HSTS; l'indirizzo del visitatore si legge da `X-Forwarded-For` solo attraverso proxy fidati (`TRUST_PROXY`, `TRUST_CLOUDFLARE`).        |
| V13 Configurazione          | ✅    | Segreti solo nelle variabili d'ambiente; `pnpm audit` senza vulnerabilità nelle dipendenze di produzione.                                                           |
| V14 Protezione dei dati     | ✅    | Admin e API non in cache, registro attività senza dati sensibili, contenuti privati mai serviti ai visitatori.                                                      |
| V15 Codice e architettura   | ✅    | TypeScript rigoroso, plugin isolati, anteprime embed senza richieste verso l'esterno.                                                                               |
| V16 Log ed errori           | ✅    | Eventi di sicurezza nel registro attività del sito, errori senza dettagli interni.                                                                                  |
| V17 WebRTC                  | ➖    | Non usato.                                                                                                                                                          |

## Punti aperti

- Una CSP rigorosa anche per il sito pubblico, per esempio come impostazione per i siti senza script personalizzati (V3).
- Sostituire la dipendenza obsoleta `@esbuild-kit` di `drizzle-kit` quando lo farà il progetto originale (V13, solo sviluppo).
