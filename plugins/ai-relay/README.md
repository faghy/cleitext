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

   Since AI Relay 1.1 (core 0.117.0) sites ask as a **job** instead, so no request lasts long (a proxy such as Cloudflare cuts the ones over 100 seconds, while a small model on a CPU may take minutes):

   ```http
   POST /api/v1/ext/ai-relay/v1/chat/jobs
   authorization: Bearer cxai_…

   { "model": "chriss-base", "messages": [...], "tools": [...], "max_tokens": 1024 }
   ```

   Same body, limits and checks as `chat/completions`, the question counted at once; errors (`413 prompt_too_long`, `429 quota_exceeded`, `503 busy`…) come back at once too. Otherwise, within a moment: `202 { "id": "job_…", "status": "queued", "position": 0, "limit": 20, "remaining": 19, "resetAt": "…" }`. The site then asks every couple of seconds:

   ```http
   GET /api/v1/ext/ai-relay/v1/chat/jobs/job_…
   authorization: Bearer cxai_…
   ```

   `{ "id", "status": "queued" | "running" | "done" | "error", "position"?, "result"?, "error"?, "limit", "remaining", "resetAt" }`: `position` (while queued) is the number of requests ahead of it (0: its turn now); `result` (done) is the `chat.completion` object above; `error` (error) is `{ "error": "upstream_error" | "not_configured" | "busy" | "abandoned", "message" }`, and the question is given back. A site has one job at a time (another one: `409 job_active` with its `id`); a job of another site, an unknown one or one answered more than 10 minutes ago: `404 not_found`. A waiting job nobody asked about for 30 seconds is dropped at its turn. The job runs in the same queue as `chat/completions`, in the background, not tied to the request; `chat/completions` keeps working as before.

3. `GET /api/v1/ext/ai-relay/usage` (same key) answers `{ limit, used, remaining, resetAt }`; `GET /api/v1/ext/ai-relay/v1/models` lists `chriss-base`.

## Limits

- **Questions per site per day** (20): a request whose last message is the person's. The rounds with tool results that follow a question are free up to **requests per question** (8) times the questions.
- **Requests per minute from one address** (10), **requests per day from all sites** (2000), **requests answered at the same time** (1: on a CPU, two at once slow each other down); others wait in order in a queue of **requests waiting for their turn** (5, a minute and a half at most), and beyond it get `503 busy` with `retry-after`.
- **Tokens of an answer** (1024) and **characters of a request** (22 000, about 6 000 tokens; more: `413 prompt_too_long`). The sites themselves send Chriss base only the essential tools with short descriptions and a short prompt (about 1 500 tokens, the same at every turn so the model's server keeps it read), and trim the conversation to about 6 000 tokens.

Over a daily limit: `429 { "error": "quota_exceeded", "limit": 20, "resetAt": "2026-11-22T00:00:00.000Z", "scope": "site" | "global" }`, which the site turns into an invitation to connect its own AI service. Other errors: `400 invalid_request`, `401 invalid_key`, `403 revoked` / `not_verified`, `413 prompt_too_long`, `429 rate_limited`, `502 upstream_error`, `503 disabled` / `busy` / `not_configured`.

Answers may take long (a small model on a CPU reads a long prompt in tens of seconds): `chat/completions` and `register` use the background-job time of the core (`timeout: 'job'`, plugin API 1.79), and a proxy in front of the server must allow requests of a few minutes for them. The jobs need nothing of the kind: each request is short, and a job waits for its turn up to three minutes. Polls: 600 a minute from one address.

## Settings

**Settings → AI Relay** (capability `manage_ai_relay`, administrators): turn the service on or off, change the limits, see the registered sites with today's questions and requests, revoke a site (its key stops working and it cannot register again) or allow it again.

Sites use `https://cleitext.com/api/v1/ext/ai-relay` by default; `CLEITEXT_AI_RELAY` points a site to another relay, and an empty value hides Chriss base.
