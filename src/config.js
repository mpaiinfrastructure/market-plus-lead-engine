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
  const configuredApifyActor = coalesce(process.env.APIFY_ACTOR_ID);
  return {
    app: {
      environment: coalesce(process.env.NODE_ENV, 'development'),
      port: Number(process.env.PORT || 3000),
      dataDir: path.resolve(__dirname, '..', process.env.DATA_DIR || 'data'),
      publicBaseUrl: coalesce(process.env.PUBLIC_BASE_URL, 'http://localhost:3000'),
      dashboardUrl: coalesce(process.env.DASHBOARD_URL, 'http://localhost:3001'),
      dashboardOrigin: coalesce(process.env.DASHBOARD_ORIGIN, 'http://localhost:3001'),
      allowRuntimeUpgrade: coalesce(process.env.ALLOW_RUNTIME_UPGRADE, 'false') === 'true',
      dryRun: coalesce(process.env.DRY_RUN, 'true') !== 'false',
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
    signalwire: {
      space: coalesce(process.env.SIGNALWIRE_SPACE, process.env.SPACE),
      projectId: coalesce(process.env.SIGNALWIRE_PROJECT_ID, process.env.PROJECT_ID),
      apiToken: coalesce(process.env.SIGNALWIRE_API_TOKEN, process.env.API_TOKEN),
      phoneNumber: coalesce(process.env.SIGNALWIRE_PHONE_NUMBER),
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
      sttModel: coalesce(process.env.DEEPGRAM_STT_MODEL, 'nova-3'),
    },
    zoho: {
      smtp: {
        host: coalesce(process.env.ZOHO_SMTP_HOST, 'smtp.zoho.com'),
        port: Number(process.env.ZOHO_SMTP_PORT || 465),
        secure: coalesce(process.env.ZOHO_SMTP_SECURE, 'true') === 'true',
        user: coalesce(process.env.ZOHO_SMTP_USER, 'ai@market-plus.icu'),
        password: coalesce(process.env.ZOHO_SMTP_PASSWORD),
      },
      imap: {
        host: coalesce(process.env.ZOHO_IMAP_HOST, 'imap.zoho.com'),
        port: Number(process.env.ZOHO_IMAP_PORT || 993),
        secure: coalesce(process.env.ZOHO_IMAP_SECURE, 'true') === 'true',
        user: coalesce(process.env.ZOHO_IMAP_USER, 'ai@market-plus.icu'),
        password: coalesce(process.env.ZOHO_IMAP_PASSWORD),
      },
    },
    mailgun: {
      apiKey: coalesce(process.env.MAILGUN_API_KEY),
      domain: coalesce(process.env.MAILGUN_DOMAIN),
    },
    apify: {
      apiToken: coalesce(process.env.APIFY_API_TOKEN),
      actorId: configuredApifyActor === 'apify/website-scraper'
        ? 'compass/crawler-google-places'
        : coalesce(configuredApifyActor, 'compass/crawler-google-places'),
    },
    github: {
      owner: coalesce(process.env.GH_OWNER),
      repo: coalesce(process.env.GH_REPO),
      pat: coalesce(process.env.GITHUB_PAT),
      oauthClientId: coalesce(process.env.GITHUB_OAUTH_CLIENT_ID),
      oauthClientSecret: coalesce(process.env.GITHUB_OAUTH_CLIENT_SECRET),
      oauthAllowedLogin: coalesce(process.env.GITHUB_OAUTH_ALLOWED_LOGIN, process.env.GH_OWNER),
      oauthCallbackUrl: coalesce(process.env.GITHUB_OAUTH_CALLBACK_URL, 'http://localhost:3000/auth/github/callback'),
      sessionSecret: coalesce(process.env.GITHUB_SESSION_SECRET),
    },
    highIncomeZips: getHighIncomeZips(),
    leadSearchTerm: coalesce(process.env.LEAD_SEARCH_TERM, 'businesses'),
  };
}

function getProviderStatus(config = getProviderConfig()) {
  return {
    google: Boolean(config.google.apiKey),
    stripe: Boolean(config.stripe.secretKey),
    signalwire: Boolean(config.signalwire.space && config.signalwire.projectId && config.signalwire.apiToken),
    twilio: Boolean(config.twilio.accountSid && config.twilio.authToken && config.twilio.phoneNumber),
    deepgram: Boolean(config.deepgram.apiKey),
    zoho: Boolean(config.zoho.smtp.user && config.zoho.smtp.password),
    mailgun: Boolean(config.mailgun.apiKey && config.mailgun.domain),
    apify: Boolean(config.apify.apiToken),
    github: Boolean(config.github.owner && config.github.repo && config.github.pat),
  };
}

function getProviderReadiness(config = getProviderConfig()) {
  const missing = (fields) => fields.filter((field) => !field.value).map((field) => field.name);
  const requirements = {
    google: [{ name: 'GEMINI_API_KEY', value: config.google.apiKey }],
    stripe: [
      { name: 'STRIPE_API_KEY', value: config.stripe.secretKey },
      { name: 'STRIPE_PRICE_ID', value: config.stripe.priceId },
      { name: 'STRIPE_WEBHOOK_SECRET', value: config.stripe.webhookSecret },
    ],
    signalwire: [
      { name: 'SIGNALWIRE_SPACE', value: config.signalwire.space },
      { name: 'SIGNALWIRE_PROJECT_ID', value: config.signalwire.projectId },
      { name: 'SIGNALWIRE_API_TOKEN', value: config.signalwire.apiToken },
      { name: 'SIGNALWIRE_PHONE_NUMBER', value: config.signalwire.phoneNumber },
    ],
    twilio: [
      { name: 'TWILIO_ACCOUNT_SID', value: config.twilio.accountSid },
      { name: 'TWILIO_AUTH_TOKEN', value: config.twilio.authToken },
      { name: 'TWILIO_PHONE_NUMBER', value: config.twilio.phoneNumber },
    ],
    deepgram: [{ name: 'DEEPGRAM_API_KEY', value: config.deepgram.apiKey }],
    mailgun: [
      { name: 'MAILGUN_API_KEY', value: config.mailgun.apiKey },
      { name: 'MAILGUN_DOMAIN', value: config.mailgun.domain },
    ],
    apify: [{ name: 'APIFY_API_TOKEN', value: config.apify.apiToken }],
    github: [
      { name: 'GH_OWNER', value: config.github.owner },
      { name: 'GH_REPO', value: config.github.repo },
      { name: 'GITHUB_PAT', value: config.github.pat },
    ],
  };

  return Object.fromEntries(Object.entries(requirements).map(([provider, fields]) => {
    const missingFields = missing(fields);
    return [provider, { ready: missingFields.length === 0, missing: missingFields }];
  }));
}

function getReadiness(config = getProviderConfig()) {
  const providers = getProviderStatus(config);
  const providerReadiness = getProviderReadiness(config);
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
    providerReadiness,
  };
}

module.exports = {
  getProviderConfig,
  getProviderStatus,
  getProviderReadiness,
  getReadiness,
  getHighIncomeZips,
};
