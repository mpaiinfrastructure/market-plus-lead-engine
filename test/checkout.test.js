const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/server');
const { getHighIncomeZips } = require('../src/config');

async function withServer(callback) {
  const server = createApp().listen(0);
  try {
    const address = server.address();
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('uses configured ZIP codes for lead eligibility', () => {
  const previous = process.env.HIGH_INCOME_ZIPS;
  process.env.HIGH_INCOME_ZIPS = '12345, invalid,90210';

  assert.deepEqual(getHighIncomeZips(), ['12345', '90210']);

  if (previous === undefined) delete process.env.HIGH_INCOME_ZIPS;
  else process.env.HIGH_INCOME_ZIPS = previous;
});

test('does not provide a free installation endpoint', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'example.com' }),
    });

    assert.equal(response.status, 404);
  });
});

test('reports missing Stripe readiness requirements', async () => {
  const previousSecret = process.env.STRIPE_API_KEY;
  const previousPrice = process.env.STRIPE_PRICE_ID;
  const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_API_KEY;
  delete process.env.STRIPE_PRICE_ID;
  delete process.env.STRIPE_WEBHOOK_SECRET;

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/ready`);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.status, 'not_ready');
    assert.equal(body.checks.stripeSecret, false);
    assert.equal(body.checks.stripePrice, false);
    assert.equal(body.checks.stripeWebhook, false);
  });

  if (previousSecret === undefined) delete process.env.STRIPE_API_KEY;
  else process.env.STRIPE_API_KEY = previousSecret;
  if (previousPrice === undefined) delete process.env.STRIPE_PRICE_ID;
  else process.env.STRIPE_PRICE_ID = previousPrice;
  if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
});

test('requires Stripe configuration before checkout', async () => {
  const previousSecret = process.env.STRIPE_API_KEY;
  const previousPrice = process.env.STRIPE_PRICE_ID;
  delete process.env.STRIPE_API_KEY;
  delete process.env.STRIPE_PRICE_ID;

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company_name: 'Example Co', domain: 'example.com', zip: '90210' }),
    });

    assert.equal(response.status, 503);
  });

  if (previousSecret === undefined) delete process.env.STRIPE_API_KEY;
  else process.env.STRIPE_API_KEY = previousSecret;
  if (previousPrice === undefined) delete process.env.STRIPE_PRICE_ID;
  else process.env.STRIPE_PRICE_ID = previousPrice;
});

test('exposes the configured Stripe webhook path', async () => {
  const previousSecret = process.env.STRIPE_API_KEY;
  const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_API_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/stripe/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.session.completed' }),
    });

    assert.equal(response.status, 503);
  });

  if (previousSecret === undefined) delete process.env.STRIPE_API_KEY;
  else process.env.STRIPE_API_KEY = previousSecret;
  if (previousWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
});

test('rejects checkout outside configured ZIP codes', async () => {
  const previousSecret = process.env.STRIPE_API_KEY;
  const previousPrice = process.env.STRIPE_PRICE_ID;
  process.env.STRIPE_API_KEY = 'sk_test_placeholder';
  process.env.STRIPE_PRICE_ID = 'price_placeholder';

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company_name: 'Example Co', domain: 'example.com', zip: '00000' }),
    });

    assert.equal(response.status, 400);
  });

  if (previousSecret === undefined) delete process.env.STRIPE_API_KEY;
  else process.env.STRIPE_API_KEY = previousSecret;
  if (previousPrice === undefined) delete process.env.STRIPE_PRICE_ID;
  else process.env.STRIPE_PRICE_ID = previousPrice;
});

test('returns SignalWire-compatible XML for inbound voice webhooks', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/webhooks/signalwire/voice/inbound`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'From=%2B15551234567',
    });

    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /<Response>/);
    assert.match(body, /Gather/);
    assert.match(response.headers.get('content-type'), /text\/xml/);
  });
});

test('fails closed for unconfigured outbound providers', async () => {
  const previousSignalWireToken = process.env.SIGNALWIRE_API_TOKEN;
  const previousZohoPassword = process.env.ZOHO_SMTP_PASSWORD;
  const previousDeepgramKey = process.env.DEEPGRAM_API_KEY;
  delete process.env.SIGNALWIRE_API_TOKEN;
  delete process.env.ZOHO_SMTP_PASSWORD;
  delete process.env.DEEPGRAM_API_KEY;

  await withServer(async (baseUrl) => {
    const signalWireResponse = await fetch(`${baseUrl}/api/signalwire/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: '+15551234567', body: 'Hello' }),
    });

    test('keeps configured Mailgun sends in dry-run mode by default', async () => {
      const previousKey = process.env.MAILGUN_API_KEY;
      const previousDomain = process.env.MAILGUN_DOMAIN;
      const previousDryRun = process.env.DRY_RUN;
      process.env.MAILGUN_API_KEY = 'mailgun-test-key';
      process.env.MAILGUN_DOMAIN = 'mg.example.com';
      process.env.DRY_RUN = 'true';

      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/mailgun/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ to: 'lead@example.com', subject: 'Hello', text: 'Hello' }),
        });
        const body = await response.json();
        assert.equal(response.status, 202);
        assert.equal(body.dryRun, true);
        assert.equal(body.provider, 'mailgun');
      });

      if (previousKey === undefined) delete process.env.MAILGUN_API_KEY;
      else process.env.MAILGUN_API_KEY = previousKey;
      if (previousDomain === undefined) delete process.env.MAILGUN_DOMAIN;
      else process.env.MAILGUN_DOMAIN = previousDomain;
      if (previousDryRun === undefined) delete process.env.DRY_RUN;
      else process.env.DRY_RUN = previousDryRun;
    });
    const mailResponse = await fetch(`${baseUrl}/api/mail/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: 'lead@example.com', subject: 'Hello', text: 'Hello' }),
    });
    const deepgramResponse = await fetch(`${baseUrl}/api/deepgram/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Hello' }),
    });

    assert.equal(signalWireResponse.status, 503);
    assert.equal(mailResponse.status, 503);
    assert.equal(deepgramResponse.status, 503);
  });

  if (previousSignalWireToken === undefined) delete process.env.SIGNALWIRE_API_TOKEN;
  else process.env.SIGNALWIRE_API_TOKEN = previousSignalWireToken;
  if (previousZohoPassword === undefined) delete process.env.ZOHO_SMTP_PASSWORD;
  else process.env.ZOHO_SMTP_PASSWORD = previousZohoPassword;
  if (previousDeepgramKey === undefined) delete process.env.DEEPGRAM_API_KEY;
  else process.env.DEEPGRAM_API_KEY = previousDeepgramKey;
});