const test = require('node:test');
const assert = require('node:assert/strict');

const { getProviderConfig, getProviderReadiness, getProviderStatus } = require('../src/config');

test('loads provider config from environment variables', () => {
  process.env.GEMINI_API_KEY = 'google-key';
  process.env.GEMINI_MODEL = 'gemini-2.0-flash';
  process.env.TWILIO_ACCOUNT_SID = 'twilio-sid';
  process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
  process.env.TWILIO_PHONE_NUMBER = '+15551234567';
  process.env.DEEPGRAM_API_KEY = 'deepgram-key';
  process.env.DEEPGRAM_TTS_MODEL = 'aura-asteria-en';
  process.env.MAILGUN_API_KEY = 'mailgun-key';
  process.env.MAILGUN_DOMAIN = 'mg.example.com';
  process.env.APIFY_API_TOKEN = 'apify-token';
  process.env.APIFY_ACTOR_ID = 'user/custom-actor';
  process.env.GH_OWNER = 'owner';
  process.env.GH_REPO = 'repo';
  process.env.GITHUB_PAT = 'github-token';
  process.env.SIGNALWIRE_SPACE = 'example.signalwire.com';
  process.env.SIGNALWIRE_PROJECT_ID = 'project-id';
  process.env.SIGNALWIRE_API_TOKEN = 'signalwire-token';
  process.env.ZOHO_SMTP_PASSWORD = 'smtp-password';

  const config = getProviderConfig();

  assert.equal(config.google.apiKey, 'google-key');
  assert.equal(config.google.model, 'gemini-2.0-flash');
  assert.equal(config.twilio.accountSid, 'twilio-sid');
  assert.equal(config.twilio.phoneNumber, '+15551234567');
  assert.equal(config.deepgram.apiKey, 'deepgram-key');
  assert.equal(config.deepgram.ttsModel, 'aura-asteria-en');
  assert.equal(config.mailgun.domain, 'mg.example.com');
  assert.equal(config.apify.actorId, 'user/custom-actor');
  assert.equal(config.github.repo, 'repo');
  assert.equal(config.signalwire.projectId, 'project-id');
  assert.equal(config.zoho.smtp.user, 'ai@market-plus.icu');
  assert.equal(config.zoho.imap.port, 993);
});

test('exposes a centralized runtime status for optional providers', () => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_PHONE_NUMBER;
  delete process.env.DEEPGRAM_API_KEY;
  delete process.env.APIFY_API_TOKEN;
  delete process.env.APIFY_ACTOR_ID;
  delete process.env.MAILGUN_API_KEY;
  delete process.env.MAILGUN_DOMAIN;
  delete process.env.GH_OWNER;
  delete process.env.GH_REPO;
  delete process.env.GITHUB_PAT;
  delete process.env.SIGNALWIRE_SPACE;
  delete process.env.SIGNALWIRE_PROJECT_ID;
  delete process.env.SIGNALWIRE_API_TOKEN;
  delete process.env.ZOHO_SMTP_PASSWORD;

  const { getProviderStatus } = require('../src/config');
  const status = getProviderStatus();

  assert.equal(status.google, false);
  assert.equal(status.twilio, false);
  assert.equal(status.deepgram, false);
  assert.equal(status.signalwire, false);
  assert.equal(status.zoho, false);
  assert.equal(status.apify, false);
  assert.equal(status.mailgun, false);
  assert.equal(status.github, false);
});

test('reports complete and missing provider requirements explicitly', () => {
  const names = ['STRIPE_API_KEY', 'STRIPE_PRICE_ID', 'STRIPE_WEBHOOK_SECRET', 'MAILGUN_API_KEY', 'MAILGUN_DOMAIN'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    const config = getProviderConfig();
    const status = getProviderStatus(config);
    const readiness = getProviderReadiness(config);

    assert.equal(typeof status.stripe, 'boolean');
    assert.equal(typeof status.twilio, 'boolean');
    assert.equal(readiness.stripe.ready, false);
    assert.ok(readiness.stripe.missing.includes('STRIPE_API_KEY'));
    assert.ok(readiness.mailgun.missing.includes('MAILGUN_API_KEY'));
    assert.ok(Array.isArray(readiness.github.missing));
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
