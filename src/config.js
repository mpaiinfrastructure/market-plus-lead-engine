require('dotenv').config();

const path = require('path');

function coalesce(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

function getHighIncomeZips() {
  return coalesce(process.env.HIGH_INCOME_ZIPS, '90210,10021,60043,02108,77019')
    .split(',')
    .map((zip) => zip.trim())
    .filter((zip) => /^\d{5}$/.test(zip));
}

function getProviderConfig() {
  return {
    app: {
      environment: coalesce(process.env.NODE_ENV, 'development'),
      port: Number(process.env.PORT || 3000),
      dataDir: path.resolve(__dirname, '..', process.env.DATA_DIR || 'data'),
      publicBaseUrl: coalesce(process.env.PUBLIC_BASE_URL, 'http://localhost:3000'),
    },
    ollama: {
      baseUrl: coalesce(process.env.OLLAMA_BASE_URL, 'http://127.0.0.1:11434'),
      model: coalesce(process.env.OLLAMA_MODEL, 'qwen2.5:7b'),
    },
    google: {
      apiKey: coalesce(process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY),
      model: coalesce(process.env.GEMINI_MODEL, process.env.GOOGLE_MODEL, 'gemini-2.5-flash'),
    },
    stripe: {
      secretKey: coalesce(process.env.STRIPE_API_KEY, process.env.STRIPE_SECRET_KEY),
      publishableKey: coalesce(
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
        process.env.STRIPE_PUBLISHABLE_KEY,
      ),
      webhookSecret: coalesce(process.env.STRIPE_WEBHOOK_SECRET),
      priceId: coalesce(process.env.STRIPE_PRICE_ID),
      successUrl: coalesce(process.env.STRIPE_SUCCESS_URL, 'http://localhost:3000/checkout/success'),
      cancelUrl: coalesce(process.env.STRIPE_CANCEL_URL, 'http://localhost:3000/checkout/cancel'),
    },
    twilio: {
      accountSid: coalesce(process.env.TWILIO_ACCOUNT_SID),
      authToken: coalesce(process.env.TWILIO_AUTH_TOKEN),
      phoneNumber: coalesce(process.env.TWILIO_PHONE_NUMBER),
    },
    deepgram: {
      apiKey: coalesce(process.env.DEEPGRAM_API_KEY),
      voiceId: coalesce(process.env.DEEPGRAM_VOICE_ID, 'aura-asteria-en'),
      ttsModel: coalesce(process.env.DEEPGRAM_TTS_MODEL, 'aura-asteria-en'),
    },
    mailgun: {
      apiKey: coalesce(process.env.MAILGUN_API_KEY),
      domain: coalesce(process.env.MAILGUN_DOMAIN),
    },
    apify: {
      apiToken: coalesce(process.env.APIFY_API_TOKEN),
      actorId: coalesce(process.env.APIFY_ACTOR_ID, 'apify/website-scraper'),
    },
    github: {
      owner: coalesce(process.env.GH_OWNER),
      repo: coalesce(process.env.GH_REPO),
      pat: coalesce(process.env.GITHUB_PAT),
    },
    highIncomeZips: getHighIncomeZips(),
  };
}

function getProviderStatus(config = getProviderConfig()) {
  return {
    google: Boolean(config.google.apiKey),
    stripe: Boolean(config.stripe.secretKey),
    twilio: Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.phoneNumber),
    deepgram: Boolean(config.deepgram.apiKey),
    apify: Boolean(config.apify.apiToken),
    github: Boolean(config.github.owner && config.github.repo && config.github.pat),
  };
}

function getReadiness(config = getProviderConfig()) {
  const providers = getProviderStatus(config);
  const checks = {
    dataDirectory: Boolean(config.app.dataDir),
    stripeSecret: providers.stripe,
    stripePrice: Boolean(config.stripe.priceId),
    stripeWebhook: Boolean(config.stripe.webhookSecret),
  };

  return {
    ready: Object.values(checks).every(Boolean),
    checks,
    providers,
  };
}

module.exports = {
  getProviderConfig,
  getProviderStatus,
  getReadiness,
  getHighIncomeZips,
};
