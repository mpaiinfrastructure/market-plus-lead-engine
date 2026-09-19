const test = require('node:test');
const assert = require('node:assert/strict');

const { getProviderConfig } = require('../src/config');

test('loads provider config from environment variables', () => {
  process.env.GOOGLE_API_KEY = 'google-key';
  process.env.GOOGLE_MODEL = 'gemini-2.0-flash';
  process.env.TWILIO_ACCOUNT_SID = 'twilio-sid';
  process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
  process.env.TWILIO_PHONE_NUMBER = '+15551234567';
  process.env.DEEPGRAM_API_KEY = 'deepgram-key';
  process.env.DEEPGRAM_TTS_MODEL = 'aura-asteria-en';

  const config = getProviderConfig();

  assert.equal(config.google.apiKey, 'google-key');
  assert.equal(config.google.model, 'gemini-2.0-flash');
  assert.equal(config.twilio.accountSid, 'twilio-sid');
  assert.equal(config.twilio.phoneNumber, '+15551234567');
  assert.equal(config.deepgram.apiKey, 'deepgram-key');
  assert.equal(config.deepgram.ttsModel, 'aura-asteria-en');
});

test('exposes a centralized runtime status for optional providers', () => {
  delete process.env.GOOGLE_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_PHONE_NUMBER;
  delete process.env.DEEPGRAM_API_KEY;
  delete process.env.APIFY_API_TOKEN;

  const { getProviderStatus } = require('../src/config');
  const status = getProviderStatus();

  assert.equal(status.google, false);
  assert.equal(status.twilio, false);
  assert.equal(status.deepgram, false);
  assert.equal(status.apify, false);
});
