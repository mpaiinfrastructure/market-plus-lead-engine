const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const Stripe = require('stripe');
const { getProviderConfig, getProviderStatus, getReadiness } = require('./config');
const { qualifyLead } = require('./ai');

const installedAutomationsFile = (config) => path.join(config.app.dataDir, 'installed_automations.json');

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function writeJsonAtomically(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2));
  fs.renameSync(temporaryPath, filePath);
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health/live', (_, res) => {
    res.json({ status: 'ok', service: 'Market Plus Engine' });
  });

  app.get('/health/ready', (_, res) => {
    const config = getProviderConfig();
    const readiness = getReadiness(config);
    res.status(readiness.ready ? 200 : 503).json({ status: readiness.ready ? 'ok' : 'not_ready', ...readiness });
  });

  app.get('/health', (_, res) => {
    const config = getProviderConfig();
    const readiness = getReadiness(config);
    res.json({
      status: 'ok',
      service: 'Market Plus Engine',
      environment: config.app.environment,
      providers: getProviderStatus(config),
      readiness,
      checkoutConfigured: Boolean(config.stripe.secretKey && config.stripe.priceId),
    });
  });

  app.post('/checkout', express.json({ limit: '32kb' }), async (req, res) => {
    const config = getProviderConfig();
    const { company_name, business_name, domain, workflow, zip } = req.body || {};
    const normalizedZip = String(zip || '').trim();

    if (!config.stripe.secretKey || !config.stripe.priceId) {
      res.status(503).json({ error: 'Stripe checkout is not configured.' });
      return;
    }

    if (!config.highIncomeZips.includes(normalizedZip)) {
      res.status(400).json({ error: 'This offer is currently limited to configured high-income ZIP codes.' });
      return;
    }

    if (!domain || (!company_name && !business_name)) {
      res.status(400).json({ error: 'company_name and domain are required.' });
      return;
    }

    try {
      const stripe = Stripe(config.stripe.secretKey);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ price: config.stripe.priceId, quantity: 1 }],
        success_url: config.stripe.successUrl,
        cancel_url: config.stripe.cancelUrl,
        metadata: {
          company_name: company_name || business_name,
          domain,
          zip: normalizedZip,
          workflow: workflow || 'AI receptionist + missed call text back',
        },
      });
      res.status(201).json({ checkoutUrl: session.url, sessionId: session.id });
    } catch (error) {
      res.status(502).json({ error: `Unable to create Stripe checkout: ${error.message}` });
    }
  });

  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.post('/webhooks/stripe', async (req, res) => {
    const config = getProviderConfig();
    const signature = req.headers['stripe-signature'];

    if (!config.stripe.secretKey || !config.stripe.webhookSecret) {
      res.status(503).json({ error: 'Stripe webhook verification is not configured.' });
      return;
    }

    let event;
    try {
      const stripe = Stripe(config.stripe.secretKey);
      event = stripe.webhooks.constructEvent(req.body, signature, config.stripe.webhookSecret);
    } catch (error) {
      res.status(400).json({ error: `Invalid Stripe webhook: ${error.message}` });
      return;
    }

    if (event.type !== 'checkout.session.completed') {
      res.status(200).json({ received: true });
      return;
    }

    const session = event.data && event.data.object ? event.data.object : {};
    if (session.payment_status !== 'paid') {
      res.status(200).json({ received: true, fulfilled: false });
      return;
    }

    const metadata = { ...(session.metadata || {}), checkout_session_id: session.id };
    try {
      const installedPath = installedAutomationsFile(config);
      const installed = readJsonArray(installedPath);
      const alreadyInstalled = installed.find((item) => item.checkoutSessionId === session.id);
      if (alreadyInstalled) {
        res.status(200).json({ status: 'Already fulfilled.', installed: alreadyInstalled });
        return;
      }

      const qualification = await qualifyLead({
        name: metadata.company_name || metadata.business_name || metadata.domain,
        domain: metadata.domain,
        workflow: metadata.workflow,
      });
      const workflow = installRequestedAutomation({
        ...metadata,
        recommendedTools: qualification.recommendedTools,
      });

      if (process.env.GH_OWNER && process.env.GH_REPO && process.env.GITHUB_PAT) {
        await axios.post(
          `https://github.com/${process.env.GH_OWNER}/${process.env.GH_REPO}/dispatches`,
          {
            event_type: 'auto_install_triggered',
            client_payload: {
              domain: workflow.domain,
              ip: workflow.ip,
              workflow_request: workflow.requestedWorkflow,
              qualification_summary: qualification.summary || 'Not yet qualified',
            },
          },
          {
            headers: {
              Authorization: `token ${process.env.GITHUB_PAT}`,
              Accept: 'application/vnd.github.v3+json',
            },
          }
        );
      }

      res.status(200).json({ status: 'Dispatched.', installed: workflow, qualification });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}

function installRequestedAutomation(metadata = {}) {
  const config = getProviderConfig();
  const workflow = {
    domain: metadata.client_domain || metadata.domain || 'example.com',
    ip: metadata.client_server_ip || metadata.ip || 'unknown',
    checkoutSessionId: metadata.checkout_session_id || null,
    requestedWorkflow: metadata.workflow_request || metadata.workflow || 'AI receptionist + missed call text back',
    installedFeatures: [
      'AI receptionist',
      'Missed call text back',
      'Call qualification',
      'Automated booking workflow'
    ],
    recommendedTools: Array.isArray(metadata.recommendedTools) ? metadata.recommendedTools : [],
    deploymentStatus: 'queued_for_provider_installation',
    deployedAt: new Date().toISOString(),
  };

  workflow.providerConfig = getProviderStatus();

  const installedPath = installedAutomationsFile(config);
  fs.mkdirSync(config.app.dataDir, { recursive: true });
  const existing = readJsonArray(installedPath);

  existing.push(workflow);
  writeJsonAtomically(installedPath, existing);

  return workflow;
}

const port = getProviderConfig().app.port;
if (require.main === module) {
  createApp().listen(port, () => console.log(`Market Plus Webhook Server Live on port ${port}.`));
}

module.exports = { createApp, installRequestedAutomation };
