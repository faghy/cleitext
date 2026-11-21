# AI Relay

Chriss base, the free AI of every Cleitext site. Installed on cleitext.com, it answers the chat requests of the sites with cleitext.com's own AI provider (the one set in Admin → Chriss, e.g. a local Ollama at `http://127.0.0.1:11434/v1`, model `chriss-base`), within a small daily allowance per site. Sites never reach that provider: they only talk to the relay. No text of the requests is stored or logged.

## How it works

1. In Admin → Chriss a super admin clicks **Activate** under _Chriss base (free)_. The site creates a one-time secret, shows its SHA-256 at `https://<site>/.well-known/cleitext-ai-relay` and posts to the relay:

   ```http
   POST /api/v1/ext/ai-relay/register
   content-type: application/json

   { "origin": "https://example.com", "secret": "…" }
   ```

   The relay reads the well-known address (public https only) and checks the hash, so only the site at that address can register it. It answers `{ "key": "cxai_…", "model": "chriss-base", "limit": 20 }` and keeps only the key's SHA-256. The site stores the key, encrypted, as its provider key, with the address `https://cleitext.com/api/v1/ext/ai-relay/v1`.

2. The site's chat sends OpenAI-compatible requests (non-streaming, with tools):

   ```http
   POST /api/v1/ext/ai-relay/v1/chat/completions
   authorization: Bearer cxai_…

   { "model": "chriss-base", "messages": [...], "tools": [...], "max_tokens": 1024 }
   ```

   The answer is a `chat.completion` with `model: "chriss-base"`, and the headers `x-ratelimit-limit`, `x-ratelimit-remaining` (questions left today) and `x-ratelimit-reset` (Unix seconds, next UTC midnight).

3. `GET /api/v1/ext/ai-relay/usage` (same key) answers `{ limit, used, remaining, resetAt }`; `GET /api/v1/ext/ai-relay/v1/models` lists `chriss-base`.

## Limits

- **Questions per site per day** (20): a request whose last message is the person's. The rounds with tool results that follow a question are free up to **requests per question** (8) times the questions.
- **Requests per minute from one address** (10), **requests per day from all sites** (2000), **requests answered at the same time** (1: on a CPU, two at once slow each other down); others wait in order in a queue of **requests waiting for their turn** (5, a minute and a half at most), and beyond it get `503 busy` with `retry-after`.
- **Tokens of an answer** (1024) and **characters of a request** (22 000, about 6 000 tokens; more: `413 prompt_too_long`). The sites themselves send Chriss base only the essential tools with short descriptions and a short prompt (about 1 500 tokens, the same at every turn so the model's server keeps it read), and trim the conversation to about 6 000 tokens.

Over a daily limit: `429 { "error": "quota_exceeded", "limit": 20, "resetAt": "2026-11-22T00:00:00.000Z", "scope": "site" | "global" }`, which the site turns into an invitation to connect its own AI service. Other errors: `400 invalid_request`, `401 invalid_key`, `403 revoked` / `not_verified`, `413 prompt_too_long`, `429 rate_limited`, `502 upstream_error`, `503 disabled` / `busy` / `not_configured`.

Requests may take long (a small model on a CPU reads a long prompt in tens of seconds): the routes use the background-job time of the core (`timeout: 'job'`, plugin API 1.79). Proxies in front of the server must allow requests of a few minutes on `/api/v1/ext/ai-relay/`.

## Settings

**Settings → AI Relay** (capability `manage_ai_relay`, administrators): turn the service on or off, change the limits, see the registered sites with today's questions and requests, revoke a site (its key stops working and it cannot register again) or allow it again.

Sites use `https://cleitext.com/api/v1/ext/ai-relay` by default; `CLEITEXT_AI_RELAY` points a site to another relay, and an empty value hides Chriss base.
