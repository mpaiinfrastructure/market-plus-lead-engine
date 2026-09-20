# Market Plus Lead Engine

A lightweight lead-generation and automation prototype for finding businesses in high-income ZIP codes. It scans broad business listings, identifies businesses without detectable AI infrastructure, scores each opportunity with Gemini, and recommends the AI tools or workflows most useful for that specific business.

## What it does

- Scrapes broad business listings from high-income ZIP codes using Yellow Pages-style search results
- Filters out businesses with detectable AI infrastructure
- Recommends business-specific AI tools such as AI receptionists, missed-call text back, lead qualification, booking, and follow-up automation
- Filters out businesses that already appear to have AI tooling
- Qualifies leads with Google Gemini when a key is available
- Sends SMS and handles call webhooks through SignalWire when configured
- Sends voice pitch through Deepgram when configured
- Sends automated email through Zoho Mail when configured
- Stores automation install records and outreach logs in the `data/` folder
- Can trigger a GitHub dispatch when GitHub env vars are set

## Quick start

1. Install dependencies

```bash
npm install
```

2. Create a `.env` file if you want to enable providers

```env
# Optional but recommended for AI qualification
GEMINI_API_KEY=your_key_here

# Optional for SignalWire voice and SMS
SIGNALWIRE_SPACE=your-space.signalwire.com
SIGNALWIRE_PROJECT_ID=your_project_id
SIGNALWIRE_API_TOKEN=your_api_token
SIGNALWIRE_PHONE_NUMBER=+15551234567

# Optional for voice outreach
DEEPGRAM_API_KEY=your_deepgram_key

# Optional for better scraping fallback
APIFY_API_TOKEN=your_apify_token

# Optional GitHub automation
GH_OWNER=your-org
GH_REPO=your-repo
GITHUB_PAT=your-token
```

3. Start the app

```bash
npm start
```

### Run locally with Ollama

On the laptop where Ollama is installed, start the model first:

```bash
ollama run qwen2.5:7b
```

In a second terminal, from this project directory, install dependencies and start the app:

```bash
npm install
npm start
```

When `GEMINI_API_KEY` is absent, lead qualification automatically uses Ollama at `http://127.0.0.1:11434` with `qwen2.5:7b`. Override those values with `OLLAMA_BASE_URL` and `OLLAMA_MODEL` if needed.

For production, set `NODE_ENV=production`, `PUBLIC_BASE_URL` to the public HTTPS URL, and use a process manager such as systemd, Docker, or a hosted service that restarts the process. Configure its health check to call `/health/live`; use `/health/ready` for deployment gating. Runtime configuration is read from the process environment, so Codespaces, Actions, and deployed runtimes do not need provider modules to read `.env` files. The readiness endpoint returns `503` until Stripe secret, price, and webhook values are configured; `/api/providers` reports each provider's configured status and missing readiness fields.

The command center is private. Configure a GitHub OAuth application with callback
URL `GITHUB_OAUTH_CALLBACK_URL`, set `GITHUB_OAUTH_ALLOWED_LOGIN` to the only
authorized GitHub login, and provide `GITHUB_SESSION_SECRET`. The dashboard's
public surface contains only the client-facing pitch; telemetry, lead data,
pipeline state, projections, and live logs require the signed operator session.

4. Run the scraper manually

```bash
npm run scrape
```

The resumable full-range pipeline uses the checked-in Census-derived
line-oriented dataset at `datasets/zips.txt` (29,467 unique ZIPs in the current
snapshot), rather than the former five-ZIP fallback. Set `ZIP_DATASET_PATH` to
another generated file when a refreshed dataset is required; it must contain
one five-digit ZIP per line (blank lines and `#` comments are allowed). Missing
files and invalid lines fail clearly rather than silently inventing ZIP codes.
Run it with `npm run pipeline`.

Pipeline progress, permanent ZIP+niche locks, lead projections, and telemetry are
stored in `DATA_DIR` as `pipeline_state.json`, `pipeline_locks.json`,
`high_value_leads.json`, and `pipeline_telemetry.json`. `PIPELINE_CONCURRENCY`
controls bounded worker concurrency, and `LEAD_NICHES` controls the comma-separated
niche range. A ZIP can be processed once for every niche because locks use the
`ZIP:niche` key. Pipeline outreach is deterministic and dry-run by default.
`PIPELINE_LEAD_CAP` defaults to 200 newly accepted leads per cycle. Once the cap
is reached, the scanner persists a pause in `pipeline_state.json` and resumes
after `PIPELINE_PAUSE_MS` (default: 14,400,000 ms / four hours). A second run
during that window reports `status: "paused"` without scraping or sending.

5. Run manual outreach if you want to process collected leads

```bash
node src/outreach.js
```

The scheduled GitHub Actions workflow refreshes lead data with `npm run scrape`; outbound outreach remains manual so provider messages are sent intentionally.

## Required vs optional providers

### Recommended minimum

```env
GEMINI_API_KEY=your_google_ai_key
```

This enables lead qualification. Without it, the app returns a dry-run qualification result and does not crash.

### SMS / outbound follow-up

```env
SIGNALWIRE_SPACE=your-space.signalwire.com
SIGNALWIRE_PROJECT_ID=your_project_id
SIGNALWIRE_API_TOKEN=your_api_token
SIGNALWIRE_PHONE_NUMBER=+15551234567
```

This is only needed for actual SMS and outbound calls. Without it, outbound requests return `503` and inbound webhooks remain available.

### Voice outreach

```env
DEEPGRAM_API_KEY=your_deepgram_key
DEEPGRAM_VOICE_ID=aura-asteria-en
DEEPGRAM_TTS_MODEL=aura-asteria-en
DEEPGRAM_STT_MODEL=nova-3
```

Optional for voice pitch generation. Without it, the system logs the pitch instead of calling Deepgram.

### Scraping fallback

```env
APIFY_API_TOKEN=your_apify_token
```

This is optional and only used to improve scraping coverage, not required for startup.

### GitHub dispatch

```env
GH_OWNER=your-org
GH_REPO=your-repo
GITHUB_PAT=your-token
```

Optional. This triggers a GitHub repository dispatch after install or checkout events.

### Stripe

```env
STRIPE_API_KEY=your_secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_publishable
STRIPE_WEBHOOK_SECRET=your_webhook_secret
STRIPE_PRICE_ID=price_...
```

Stripe is required for customer checkout and paid fulfillment.

Create a one-time Stripe Price in the Stripe Dashboard and set `STRIPE_PRICE_ID`. Configure the webhook endpoint as `https://your-domain.example/stripe/webhook` for the `checkout.session.completed` event, then set the signing secret as `STRIPE_WEBHOOK_SECRET`. The legacy `/webhooks/stripe` path is also supported. For local development, use `stripe listen --forward-to localhost:3000/stripe/webhook` and copy the displayed signing secret into `STRIPE_WEBHOOK_SECRET`. Only verified, paid Checkout sessions trigger fulfillment. Checkout requests must include a configured high-income ZIP code.

Paid fulfillment records the requested workflow and AI recommendations in `data/installed_automations.json`. Provider-specific deployment remains an explicit integration step; the service does not silently install arbitrary third-party software or run unreviewed code after payment.

## Operations

Run the operational checks from the project directory:

```bash
npm run doctor
npm run self-heal
```

`self-heal` creates the data directory and quarantines malformed JSON records rather than deleting them. Dependency upgrades are deliberately guarded:

```bash
ALLOW_RUNTIME_UPGRADE=true npm run upgrade
```

Run upgrades during a maintenance window under a process manager, review the lockfile change, and restart the service. No application can safely guarantee autonomous recovery from provider outages, bad credentials, or incompatible upgrades.

## Runtime behavior without optional APIs

The app is tolerant of missing optional provider keys:

- `qualifyLead()` returns a dry-run result if no Google key exists
- `sendSmsFollowUp()` returns a dry-run result if SignalWire is not configured
- `sendVoicePitch()` logs the prompt if Deepgram is not configured
- `runApifyCapture()` silently skips Apify when no token is present
- the server still starts and exposes health endpoints

These fallbacks do not bypass Stripe payment or paid fulfillment.

## API routes

Provider routes are available from the running server:

- `POST /api/signalwire/messages` and `POST /api/signalwire/calls` send outbound communications
- `POST /webhooks/signalwire/voice/inbound`, `/voice/input`, `/voice/status`, and `/sms/inbound` receive SignalWire webhooks
- `POST /api/deepgram/tts` accepts JSON `{ "text": "..." }`; `POST /api/deepgram/stt` accepts audio bytes
- `GET /api/mail/status` reports non-secret Zoho SMTP/IMAP settings; `POST /api/mail/send` sends outreach mail
- `POST /stripe/webhook` and the legacy `/webhooks/stripe` verify and process Stripe events

Set `PUBLIC_BASE_URL` to the public HTTPS origin before configuring SignalWire callbacks. Keep `.env` out of source control and rotate any credentials that may have been exposed.

## Project structure

```text
src/
  ai.js
  config.js
  outreach.js
  scraper.js
  server.js

test/
  providers.test.js
```

## Environment variable reference

```env
# Google AI for lead qualification
GEMINI_API_KEY=
GEMINI_MODEL=

# SignalWire voice and SMS
SIGNALWIRE_SPACE=
SIGNALWIRE_PROJECT_ID=
SIGNALWIRE_API_TOKEN=
SIGNALWIRE_PHONE_NUMBER=

# Deepgram voice
DEEPGRAM_API_KEY=
DEEPGRAM_VOICE_ID=
DEEPGRAM_TTS_MODEL=
DEEPGRAM_STT_MODEL=

# Zoho Mail
ZOHO_SMTP_HOST=smtp.zoho.com
ZOHO_SMTP_PORT=465
ZOHO_SMTP_SECURE=true
ZOHO_SMTP_USER=ai@market-plus.icu
ZOHO_SMTP_PASSWORD=
ZOHO_IMAP_HOST=imap.zoho.com
ZOHO_IMAP_PORT=993
ZOHO_IMAP_SECURE=true
ZOHO_IMAP_USER=ai@market-plus.icu
ZOHO_IMAP_PASSWORD=

# Apify scraping fallback
APIFY_API_TOKEN=
APIFY_ACTOR_ID=

# GitHub dispatch
GH_OWNER=
GH_REPO=
GITHUB_PAT=

# Stripe integration
STRIPE_API_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
STRIPE_SUCCESS_URL=http://localhost:3000/checkout/success
STRIPE_CANCEL_URL=http://localhost:3000/checkout/cancel

# Lead targeting
HIGH_INCOME_ZIPS=90210,10021,60043,02108,77019
ZIP_DATASET_PATH=datasets/zips.txt
LEAD_NICHES=general
PIPELINE_CONCURRENCY=4
DRY_RUN=true
```

## Recommended revenue-first rollout

Payment is collected through Stripe before installation is dispatched. Revenue is still dependent on qualified prospects, compliant outreach, a working service, pricing, refunds, and Stripe account approval; no software configuration can guarantee money.

## High-income ZIP-code targeting

The scraper currently targets these ZIP codes:

```text
90210  Beverly Hills, CA
10021  Manhattan, NY
60043  Kenilworth, IL
02108  Boston, MA
77019  Houston, TX
```

For each ZIP code, it searches broadly for businesses, checks their websites for signs of existing AI infrastructure, and keeps businesses where no AI tooling is detected. Scraped records are written to `data/high_value_leads.json` and include the source ZIP code. Gemini then evaluates each business and returns a score, summary, and `recommendedTools` list tailored to that business.

To change the broad directory query, set `LEAD_SEARCH_TERM` in `.env`. The default is `businesses`. Override the target ZIP codes with `HIGH_INCOME_ZIPS`; these same ZIPs gate Checkout eligibility.

## License

This project is currently provided as-is for prototype and internal use.