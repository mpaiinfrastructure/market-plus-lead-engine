# Market Plus Lead Engine

A lightweight lead-generation and automation prototype for finding businesses in high-income ZIP codes. It scans broad business listings, identifies businesses without detectable AI infrastructure, scores each opportunity with Gemini, and recommends the AI tools or workflows most useful for that specific business.

## What it does

- Scrapes broad business listings from high-income ZIP codes using Yellow Pages-style search results
- Filters out businesses with detectable AI infrastructure
- Recommends business-specific AI tools such as AI receptionists, missed-call text back, lead qualification, booking, and follow-up automation
- Filters out businesses that already appear to have AI tooling
- Qualifies leads with Google Gemini when a key is available
- Sends SMS through Twilio when configured
- Sends voice pitch through Deepgram when configured
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

# Optional for SMS outreach
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+15551234567

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

For production, set `NODE_ENV=production`, `PUBLIC_BASE_URL` to the public HTTPS URL, and use a process manager such as systemd, Docker, or a hosted service that restarts the process. Configure its health check to call `/health/live`; use `/health/ready` for deployment gating. The readiness endpoint returns `503` until Stripe secret, price, and webhook values are configured.

4. Run the scraper manually

```bash
npm run scrape
```

5. Run manual outreach if you want to process collected leads

```bash
node src/outreach.js
```

## Required vs optional providers

### Recommended minimum

```env
GEMINI_API_KEY=your_google_ai_key
```

This enables lead qualification. Without it, the app returns a dry-run qualification result and does not crash.

### SMS / outbound follow-up

```env
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+15551234567
```

This is only needed for actual SMS messages. Without it, outbound SMS is skipped and logged as a dry run.

### Voice outreach

```env
DEEPGRAM_API_KEY=your_deepgram_key
DEEPGRAM_VOICE_ID=aura-asteria-en
DEEPGRAM_TTS_MODEL=aura-asteria-en
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
```

Stripe is required for customer checkout and paid fulfillment.

Create a one-time Stripe Price in the Stripe Dashboard and set `STRIPE_PRICE_ID`. Configure the webhook endpoint as `https://your-domain.example/webhooks/stripe` for the `checkout.session.completed` event, then set the signing secret as `STRIPE_WEBHOOK_SECRET`. Only verified, paid Checkout sessions trigger fulfillment. Checkout requests must include a configured high-income ZIP code.

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
- `sendSmsFollowUp()` returns a dry-run result if Twilio is not configured
- `sendVoicePitch()` logs the prompt if Deepgram is not configured
- `runApifyCapture()` silently skips Apify when no token is present
- the server still starts and exposes health endpoints

These fallbacks do not bypass Stripe payment or paid fulfillment.

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

# Twilio SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Deepgram voice
DEEPGRAM_API_KEY=
DEEPGRAM_VOICE_ID=
DEEPGRAM_TTS_MODEL=

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