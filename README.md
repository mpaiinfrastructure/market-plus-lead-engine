# Market Plus Lead Engine

A production-grade enterprise B2B lead generation engine for finding businesses in high-income ZIP codes. It scans broad business listings, identifies businesses without detectable AI infrastructure, scores each opportunity with Gemini, and recommends the AI tools or workflows most useful for that specific business.

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

## Configured Integrations

- SignalWire (SMS/Voice)
- Deepgram (Voice AI)
- Zoho Mail (Email)
- Stripe (Monetization)
- Apify (Scraper Fallback)

## Run locally with LM Studio

Run the "Hermes 3" model in LM Studio, start the local server, and set the environment variables to point to LM Studio's default local port.
