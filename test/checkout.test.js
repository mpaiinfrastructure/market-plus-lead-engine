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