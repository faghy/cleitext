# OWASP ASVS checklist

Cleitext targets **OWASP ASVS 5.0, level 2** (RNF-08 in [SPECIFICATIONS.md](SPECIFICATIONS.md)). This page maps each chapter to what the code does, with the files to check. It is reviewed at every milestone.

Status: ✅ met · ⚠️ partly met (reason given) · ➖ not applicable.

Last review: October 2026, release 0.5.19.

## V1 Encoding and sanitization

| Status | Requirement                     | How                                                                                                                                                                                   |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Output encoding for the context | Pages are rendered with React on the server: text is escaped by default. Rich text is stored as a structured model (CXD), not HTML (`packages/blocks/src/inline.ts`).                 |
| ✅     | URLs in content                 | `safeUrl()` keeps only http(s), mailto, tel and relative addresses (`packages/renderer/src/url.ts`), with property tests.                                                             |
| ✅     | HTML from users is sanitized    | The Custom HTML block goes through an allowlist (sanitize-html) on create, update and autosave, unless the author has `unfiltered_html` (`apps/server/src/content/html-sanitize.ts`). |
| ✅     | No injection in queries         | Drizzle ORM with bound parameters everywhere; `LIKE` patterns are escaped.                                                                                                            |
| ✅     | No OS command injection         | The only external commands (`pg_dump`, `pg_restore` in the CLI) get arguments as arrays, without a shell (`packages/cli/src/backup.ts`).                                              |

## V2 Validation and business logic

| Status | Requirement                        | How                                                                                                                                                     |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Server-side validation             | Every request body and query goes through a Zod schema (`parseBody`, `packages/shared/src`). Documents are checked block by block against the registry. |
| ✅     | Business rules enforced in order   | Status transitions (draft → pending → published…) are checked by the service, not the client (`apps/server/src/content/entries.service.ts`).            |
| ✅     | Anti-automation on sensitive flows | Sign-in, 2FA codes: progressive lockout per email and per IP (`apps/server/src/auth/login-throttle.service.ts`).                                        |

## V3 Web frontend security

| Status | Requirement                     | How                                                                                                                                                                                                                                                               |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Content Security Policy (admin) | The admin gets a strict CSP: own scripts plus hashed inline ones, no `object`, `base-uri 'self'`, `frame-ancestors 'none'` (`apps/server/src/common/security-headers.ts`).                                                                                        |
| ⚠️     | Content Security Policy (site)  | Public pages forbid plugins, `<base>` hijacking and framing by other sites. Scripts are not restricted, because administrators may publish their own HTML (analytics, widgets), as in WordPress. Pages built by Cleitext themselves contain no executable script. |
| ✅     | Other headers                   | `X-Content-Type-Options: nosniff` and a `Referrer-Policy` on every response, `Strict-Transport-Security` over HTTPS, `X-Frame-Options`, `Cross-Origin-Opener-Policy` on the admin.                                                                                |
| ✅     | Cookies                         | Session: `HttpOnly`, `Secure` over HTTPS, `SameSite=Lax`. CSRF cookie: `SameSite=Strict`. Passkey prompt: `HttpOnly`, `SameSite=Strict`, API paths only, five minutes (`apps/server/src/auth/cookies.ts`).                                                        |
| ✅     | CSRF                            | Same-origin check of `Origin`/`Referer` and a double-submit token on every state-changing request (`apps/server/src/auth/auth.guard.ts`).                                                                                                                         |

## V4 API and web service

| Status | Requirement             | How                                                                                                                                                                                                         |
| ------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Consistent error format | RFC 9457 problem details; unexpected errors become a generic 500 without internals (`apps/server/src/common/problem.ts`).                                                                                   |
| ✅     | Content types           | JSON APIs never answer with HTML; uploads are multipart with size limits.                                                                                                                                   |
| ✅     | Token-based access      | API tokens (`ctx_…`) are stored as SHA-256 hashes, expire, have read or write scope, act within the owner's permissions and cannot manage accounts or tokens (`apps/server/src/auth/api-token.service.ts`). |

## V5 File handling

| Status | Requirement               | How                                                                                                                                                                  |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Type checked from content | Uploads are identified by their magic bytes, not their name; SVG is refused (`apps/server/src/media/media-types.ts`).                                                |
| ✅     | Size and pixel limits     | `MEDIA_MAX_BYTES` for uploads; sharp's pixel limit for images; avatars are re-encoded as 256 px WebP without metadata.                                               |
| ✅     | No user-controlled paths  | Storage keys are generated (`<site>/<yyyy>/<mm>/<uuid>.<ext>`); traversal attempts are refused before reaching the disk (`apps/server/src/tenancy/request-hook.ts`). |
| ✅     | Isolation between sites   | A site's media are served only on its own domains.                                                                                                                   |

## V6 Authentication

| Status | Requirement                 | How                                                                                                                                                                                                  |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Password storage            | argon2id with the library's OWASP parameters (`apps/server/src/auth/crypto.ts`).                                                                                                                     |
| ✅     | Password rules              | 12 to 256 characters, any character allowed, no composition rules.                                                                                                                                   |
| ⚠️     | Breached passwords          | Not checked against a list of known breached passwords yet.                                                                                                                                          |
| ✅     | No account enumeration      | Same message and similar timing whether the email exists or not; the password reset always answers the same.                                                                                         |
| ✅     | Multi-factor                | TOTP (RFC 6238) with single-use codes and ten hashed recovery codes; passkeys (WebAuthn). 2FA is optional, chosen by each user (`apps/server/src/auth/two-factor.service.ts`, `passkey.service.ts`). |
| ✅     | Re-authentication           | Turning 2FA off and making new recovery codes ask for the password; changing the password asks for the current one and signs out other sessions.                                                     |
| ✅     | Reset and invitation tokens | Random 256-bit, stored hashed, single use, short-lived (one hour for resets, seven days for invitations).                                                                                            |

## V7 Session management

| Status | Requirement            | How                                                                                                                              |
| ------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Server-side sessions   | Random 256-bit tokens, only their hash in the database (`apps/server/src/auth/session.service.ts`).                              |
| ✅     | Expiry                 | `SESSION_TTL_HOURS` (default 12) or "remember me" (`SESSION_REMEMBER_DAYS`, default 30).                                         |
| ✅     | Termination            | Sign-out revokes the session; users see and revoke their sessions in the profile; a password change or reset revokes the others. |
| ✅     | New session at sign-in | A new token at every sign-in, after both factors.                                                                                |

## V8 Authorization

| Status | Requirement                      | How                                                                                                                                                                                            |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Deny by default                  | A global guard requires a session or token on every route not marked public, and checks the capabilities declared on it.                                                                       |
| ✅     | Object-level checks              | Entries check ownership and status (`apps/server/src/content/entry-permissions.ts`); roles cannot grant permissions their author lacks.                                                        |
| ✅     | Tenant isolation in the database | PostgreSQL row level security, forced on every tenant table, with the site and user of the transaction (`packages/db`); tests check every table (`packages/db/test/tenant-isolation.test.ts`). |
| ✅     | Least privilege for plugins      | Each plugin has its own schema and database role (`SET LOCAL ROLE`) and only the permissions of its manifest.                                                                                  |

## V9 Self-contained tokens

➖ Cleitext issues no JWTs: sessions and API tokens are opaque and checked in the database. Preview links are HMAC-signed with an expiry (`apps/server/src/public/preview.ts`).

## V10 OAuth and OIDC

➖ Not used yet (OIDC single sign-on is planned as a plugin, RF-USR-11).

## V11 Cryptography

| Status | Requirement             | How                                                                                                                               |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Random values           | `crypto.randomBytes` for every token, secret and code.                                                                            |
| ✅     | Secrets at rest         | TOTP secrets and SMTP passwords: AES-256-GCM with a key derived from `APP_SECRET` (scrypt) (`apps/server/src/common/secrets.ts`). |
| ✅     | Comparisons             | Constant-time comparison for CSRF tokens and TOTP codes.                                                                          |
| ✅     | Standard libraries only | Node.js crypto, argon2 (`@node-rs/argon2`), `@simplewebauthn/server`.                                                             |

## V12 Secure communication

| Status | Requirement   | How                                                                                                                                                                                       |
| ------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | HTTPS         | Forced per domain (redirect), HSTS over HTTPS; TLS is terminated by the web server in front ([DEPLOYMENT.md](DEPLOYMENT.md)). `TRUST_PROXY` makes the scheme and client address reliable. |
| ✅     | Outgoing mail | SMTP with STARTTLS or TLS per site settings.                                                                                                                                              |

## V13 Configuration

| Status | Requirement                     | How                                                                                                                                                                                                                                                     |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Secrets out of the code         | Only environment variables (`.env` outside the release folder); none in the repository.                                                                                                                                                                 |
| ✅     | Dependencies                    | `pnpm audit`: no known vulnerability in production dependencies; one moderate advisory in a development-only tool (`drizzle-kit` → `@esbuild-kit` → `esbuild`, its dev server is never started). The lockfile is checked by pnpm's supply-chain policy. |
| ✅     | Least privilege in the database | The application role cannot change sites, domains or super admins; those changes go through checked `SECURITY DEFINER` functions.                                                                                                                       |

## V14 Data protection

| Status | Requirement               | How                                                                                    |
| ------ | ------------------------- | -------------------------------------------------------------------------------------- |
| ✅     | Sensitive data not cached | The admin and API responses are not cached; signed-in users bypass the page cache.     |
| ✅     | Minimal data in logs      | The activity log keeps actions, user, IP and target, never passwords, codes or tokens. |
| ✅     | Private content           | Private and draft entries are never served to visitors; previews need a signed link.   |

## V15 Secure coding and architecture

| Status | Requirement            | How                                                                                                                                    |
| ------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Typed, validated input | TypeScript in strict mode on every package, Zod at the boundaries.                                                                     |
| ✅     | Isolated extensions    | Plugin hooks run with a timeout and error isolation; a failing plugin cannot break pages or the admin.                                 |
| ✅     | No SSRF in embeds      | Embed previews are built from the address itself: the server never fetches third-party URLs for them (`packages/blocks/src/embed.ts`). |

## V16 Security logging and error handling

| Status | Requirement            | How                                                                                                                                                                                       |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | Security events logged | Sign-ins and failures, sign-outs, password changes and resets, 2FA on and off, passkeys, API tokens, roles, members and settings go to the per-site activity log (Activity in the admin). |
| ✅     | No details to clients  | Errors are problem details without stack traces.                                                                                                                                          |

## V17 WebRTC

➖ Not used.

## Open items

- Check new passwords against a list of breached passwords (V6).
- A strict CSP for public pages when the site does not use custom scripts (V3), for example as a setting.
- Replace `drizzle-kit`'s outdated `@esbuild-kit` dependency when upstream does (V13, development only).
