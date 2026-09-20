const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp, sessionToken } = require('../src/server');

async function withServer(callback) {
  const server = createApp().listen(0);
  try {
    const address = server.address();
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

}

function operatorCookie() {
  const secret = 'test-session-secret';
  process.env.GITHUB_SESSION_SECRET = secret;
  return `market_plus_session=${encodeURIComponent(sessionToken({ github: { sessionSecret: secret } }, 'mpaiinfrastructure'))}`;
}

test('requires an operator session for command-center data', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/command-center/status`);
    assert.equal(response.status, 401);
  });
});

test('command center exposes telemetry and status contracts', async () => {
  const previousDataDir = process.env.DATA_DIR;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'market-plus-command-center-'));
  process.env.DATA_DIR = dataDir;
  fs.writeFileSync(path.join(dataDir, 'high_value_leads.json'), JSON.stringify([
    { name: 'Beverly Hills Dental', zip: '90210' },
    { name: 'Lake Forest Studio', zip: '60043' },
  ]));
  fs.writeFileSync(path.join(dataDir, 'outreach_log.json'), JSON.stringify([{ timestamp: new Date().toISOString() }]));
  fs.writeFileSync(path.join(dataDir, 'installed_automations.json'), JSON.stringify([{ deploymentStatus: 'queued_for_provider_installation' }]));

  try {
    await withServer(async (baseUrl) => {
      const cookie = operatorCookie();
      const telemetryResponse = await fetch(`${baseUrl}/api/command-center/telemetry`, { headers: { cookie } });
      const telemetry = await telemetryResponse.json();
      assert.equal(telemetryResponse.status, 200);
      assert.equal(telemetry.leads.total, 2);
      assert.equal(telemetry.leads.byZip['90210'], 1);
      assert.equal(telemetry.installations.queued, 1);

      const statusResponse = await fetch(`${baseUrl}/api/command-center/status`, { headers: { cookie } });
      const status = await statusResponse.json();
      assert.equal(statusResponse.status, 200);
      assert.equal(status.service, 'Market Plus Command Center');
      assert.equal(status.autonomous, false);
      assert.equal(status.telemetry.revenue.bookedCents, 250000);
    });
  } finally {
    if (previousDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previousDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('autonomous control validates and publishes state', async () => {
  await withServer(async (baseUrl) => {
    const headers = { 'content-type': 'application/json', cookie: operatorCookie() };
    const invalid = await fetch(`${baseUrl}/api/command-center/autonomous-control`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ enabled: 'yes' }),
    });
    assert.equal(invalid.status, 400);

    const enabled = await fetch(`${baseUrl}/api/command-center/autonomous-control`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ enabled: true }),
    });
    assert.equal(enabled.status, 200);
    const body = await enabled.json();
    assert.equal(body.autonomous, true);
    assert.equal(typeof body.timestamp, 'string');

    await fetch(`${baseUrl}/api/command-center/autonomous-control`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ enabled: false }),
    });
  });
});
