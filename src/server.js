const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const Stripe = require('stripe');
const crypto = require('crypto');
const { getProviderConfig, getProviderStatus, getReadiness } = require('./config');
const { qualifyLead } = require('./ai');
const { commandCenterRouter } = require('./command-center');

function xmlEscape(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function signalWireUrl(config, resource) {
  return `https://${config.signalwire.space}/api/laml/2010-04-01/Accounts/${config.signalwire.projectId}/${resource}`;
}

function signalWireAuth(config) {
  return {
    username: config.signalwire.projectId,
    password: config.signalwire.apiToken,
  };
}

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

const oauthState = new Map();
const sessionCookie = 'market_plus_session';

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';');
  const match = cookies.map((cookie) => cookie.trim().split('=')).find(([key]) => key === name);
  return match ? decodeURIComponent(match[1] || '') : '';
}

function sessionToken(config, login, issuedAt = Date.now()) {
  const payload = `${login}.${issuedAt}`;
  const signature = crypto.createHmac('sha256', config.github.sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readSession(req, config) {
  if (!config.github.sessionSecret) return null;
  const token = cookieValue(req, sessionCookie);
  const [login, issuedAt, signature] = token.split('.');
  if (!login || !issuedAt || !signature || !/^\d+$/.test(issuedAt)) return null;
  const expected = crypto.createHmac('sha256', config.github.sessionSecret).update(`${login}.${issuedAt}`).digest('base64url');
  if (signature.length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  if (Date.now() - Number(issuedAt) > 7 * 24 * 60 * 60 * 1000) return null;
  return { login, issuedAt: Number(issuedAt) };
}

function authReady(config) {
  return Boolean(config.github.oauthClientId && config.github.oauthClientSecret
    && config.github.oauthAllowedLogin && config.github.oauthCallbackUrl && config.github.sessionSecret);
}

function requireOperator(req, res, next) {
  const config = getProviderConfig();
  const session = readSession(req, config);
  if (!session) {
    res.status(401).json({ error: 'Operator sign-in required.', signInUrl: '/auth/github' });
    return;
  }
  req.operator = session;
  next();
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

  app.get('/api/providers', (_, res) => {
    const config = getProviderConfig();
    res.json({ providers: getProviderStatus(config), readiness: getReadiness(config) });
  });

  app.get('/auth/github', (req, res) => {
    const config = getProviderConfig();
    if (!authReady(config)) {
      res.status(503).send('GitHub OAuth is not configured.');
      return;
    }
    const state = crypto.randomBytes(24).toString('hex');
    oauthState.set(state, { createdAt: Date.now() });
    const params = new URLSearchParams({
      client_id: config.github.oauthClientId,
      redirect_uri: config.github.oauthCallbackUrl,
      scope: 'read:user',
      state,
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  app.get('/auth/github/callback', async (req, res) => {
    const config = getProviderConfig();
    const savedState = oauthState.get(req.query.state);
    oauthState.delete(req.query.state);
    if (!authReady(config) || !savedState || Date.now() - savedState.createdAt > 10 * 60 * 1000 || req.query.error) {
      res.status(401).send('GitHub sign-in was cancelled or expired.');
      return;
    }
    try {
      const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
        client_id: config.github.oauthClientId,
        client_secret: config.github.oauthClientSecret,
        code: req.query.code,
        redirect_uri: config.github.oauthCallbackUrl,
      }, { headers: { Accept: 'application/json' } });
      if (!tokenResponse.data?.access_token) throw new Error('GitHub did not return an access token.');
      const userResponse = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenResponse.data.access_token}`, Accept: 'application/vnd.github+json' },
      });
      const login = userResponse.data?.login;
      if (!login || login.toLowerCase() !== config.github.oauthAllowedLogin.toLowerCase()) {
        res.status(403).send('This GitHub account is not authorized.');
        return;
      }
      const token = sessionToken(config, login);
      res.setHeader('Set-Cookie', `${sessionCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${config.app.environment === 'production' ? '; Secure' : ''}`);
      res.redirect(config.app.dashboardUrl);
    } catch (error) {
      res.status(502).send(`GitHub sign-in failed: ${error.message}`);
    }
  });

  app.get('/auth/session', (req, res) => {
    const config = getProviderConfig();
    const session = readSession(req, config);
    res.json({ authenticated: Boolean(session), login: session?.login || null, configured: authReady(config) });
  });

  app.post('/auth/logout', (_, res) => {
    res.setHeader('Set-Cookie', `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    res.status(204).end();
  });

  app.use('/api/command-center', requireOperator, commandCenterRouter(express));

  app.post('/webhooks/signalwire/voice/inbound', express.urlencoded({ extended: false }), (req, res) => {
    res.type('text/xml').send(
      '<Response><Gather input="speech dtmf" action="/webhooks/signalwire/voice/input" method="POST" speechTimeout="auto"><Say>Thanks for calling Market Plus Automated Solutions. How can we help you today?</Say></Gather></Response>'
    );
  });

  app.post('/webhooks/signalwire/voice/input', express.urlencoded({ extended: false }), (req, res) => {
    res.type('text/xml').send(
      '<Response><Say>Thank you. An automated sales specialist will follow up shortly.</Say><Hangup/></Response>'
    );
  });

  app.post('/webhooks/signalwire/voice/status', express.urlencoded({ extended: false }), (req, res) => {
    res.status(200).json({ received: true, callStatus: req.body?.CallStatus || null });
  });

  app.post('/webhooks/signalwire/sms/inbound', express.urlencoded({ extended: false }), (req, res) => {
    const body = xmlEscape(req.body?.Body || '');
    res.type('text/xml').send(
      `<Response><Message>Thanks for reaching out. We received: ${body}</Message></Response>`
    );
  });

  app.post('/api/signalwire/messages', express.json({ limit: '32kb' }), async (req, res) => {
    const config = getProviderConfig();
    const { to, body } = req.body || {};
    if (!getProviderStatus(config).signalwire) {
      res.status(503).json({ error: 'SignalWire is not configured.' });
      return;
    }
    if (!to || !body || !config.signalwire.phoneNumber) {
      res.status(400).json({ error: 'to, body, and SIGNALWIRE_PHONE_NUMBER are required.' });
      return;
    }
    try {
      const response = await axios.post(signalWireUrl(config, 'Messages.json'), new URLSearchParams({
        To: to,
        From: config.signalwire.phoneNumber,
        Body: body,
      }), { auth: signalWireAuth(config) });
      res.status(201).json({ message: response.data });
    } catch (error) {
      res.status(502).json({ error: `Unable to send SignalWire SMS: ${error.message}` });
    }
  });

  app.post('/api/signalwire/calls', express.json({ limit: '32kb' }), async (req, res) => {
    const config = getProviderConfig();
    const { to } = req.body || {};
    if (!getProviderStatus(config).signalwire) {
      res.status(503).json({ error: 'SignalWire is not configured.' });
      return;
    }
    if (!to || !config.signalwire.phoneNumber) {
      res.status(400).json({ error: 'to and SIGNALWIRE_PHONE_NUMBER are required.' });
      return;
    }
    try {
      const response = await axios.post(signalWireUrl(config, 'Calls.json'), new URLSearchParams({
        To: to,
        From: config.signalwire.phoneNumber,
        Url: `${config.app.publicBaseUrl}/webhooks/signalwire/voice/inbound`,
        StatusCallback: `${config.app.publicBaseUrl}/webhooks/signalwire/voice/status`,
      }), { auth: signalWireAuth(config) });
      res.status(201).json({ call: response.data });
    } catch (error) {
      res.status(502).json({ error: `Unable to start SignalWire call: ${error.message}` });
    }
  });

  app.post('/api/deepgram/tts', express.json({ limit: '32kb' }), async (req, res) => {
    const config = getProviderConfig();
    const text = String(req.body?.text || '').trim();
    if (!config.deepgram.apiKey) {
      res.status(503).json({ error: 'Deepgram is not configured.' });
      return;
    }
    if (!text) {
      res.status(400).json({ error: 'text is required.' });
      return;
    }
    try {
      const response = await axios.post(
        `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(config.deepgram.ttsModel)}`,
        { text },
        { responseType: 'arraybuffer', headers: { Authorization: `Token ${config.deepgram.apiKey}`, Accept: 'audio/mpeg' } }
      );
      res.type('audio/mpeg').send(response.data);
    } catch (error) {
      res.status(502).json({ error: `Unable to synthesize speech: ${error.message}` });
    }
  });

  app.post('/api/deepgram/stt', express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '25mb' }), async (req, res) => {
    const config = getProviderConfig();
    if (!config.deepgram.apiKey) {
      res.status(503).json({ error: 'Deepgram is not configured.' });
      return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'An audio request body is required.' });
      return;
    }
    try {
      const response = await axios.post(
        `https://api.deepgram.com/v1/listen?model=${encodeURIComponent(config.deepgram.sttModel)}&smart_format=true`,
        req.body,
        { headers: { Authorization: `Token ${config.deepgram.apiKey}`, 'Content-Type': req.headers['content-type'] || 'application/octet-stream' } }
      );
      res.json(response.data);
    } catch (error) {
      res.status(502).json({ error: `Unable to transcribe audio: ${error.message}` });
    }
  });

  app.get('/api/mail/status', (_, res) => {
    const config = getProviderConfig();
    const providers = getProviderStatus(config);
    res.json({ configured: providers.zoho, smtp: { host: config.zoho.smtp.host, port: config.zoho.smtp.port, user: config.zoho.smtp.user }, imap: { host: config.zoho.imap.host, port: config.zoho.imap.port, user: config.zoho.imap.user } });
  });

  app.post('/api/mail/send', express.json({ limit: '64kb' }), async (req, res) => {
    const config = getProviderConfig();
    const { to, subject, text, html } = req.body || {};
    if (!getProviderStatus(config).zoho) {
      res.status(503).json({ error: 'Zoho SMTP is not configured.' });
      return;
    }
    if (!to || !subject || (!text && !html)) {
      res.status(400).json({ error: 'to, subject, and text or html are required.' });
      return;
    }
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({ ...config.zoho.smtp, auth: { user: config.zoho.smtp.user, pass: config.zoho.smtp.password } });
      const info = await transporter.sendMail({ from: config.zoho.smtp.user, to, subject, text, html });
      res.status(202).json({ messageId: info.messageId });
    } catch (error) {
      res.status(502).json({ error: `Unable to send Zoho email: ${error.message}` });
    }
  });

  app.post('/api/mailgun/send', express.json({ limit: '64kb' }), async (req, res) => {
    const config = getProviderConfig();
    const { to, subject, text, html } = req.body || {};
    if (!getProviderStatus(config).mailgun) {
      res.status(503).json({ error: 'Mailgun is not configured.' });
      return;
    }
    if (!to || !subject || (!text && !html)) {
      res.status(400).json({ error: 'to, subject, and text or html are required.' });
      return;
    }
    if (config.app.dryRun) {
      res.status(202).json({ dryRun: true, provider: 'mailgun', to, subject });
      return;
    }
    try {
      const response = await axios.post(
        `https://api.mailgun.net/v3/${config.mailgun.domain}/messages`,
        new URLSearchParams({
          from: `Lead Engine <mailgun@${config.mailgun.domain}>`,
          to,
          subject,
          text: text || '',
          html: html || '',
        }),
        { auth: { username: 'api', password: config.mailgun.apiKey } },
      );
      res.status(202).json({ provider: 'mailgun', message: response.data });
    } catch (error) {
      res.status(502).json({ error: `Unable to send Mailgun email: ${error.message}` });
    }
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

  app.use(['/webhooks/stripe', '/stripe/webhook'], express.raw({ type: 'application/json' }));
  app.post(['/webhooks/stripe', '/stripe/webhook'], async (req, res) => {
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

      if (getProviderStatus(config).github) {
        await axios.post(
          `https://github.com/${config.github.owner}/${config.github.repo}/dispatches`,
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
              Authorization: `token ${config.github.pat}`,
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

module.exports = { createApp, installRequestedAutomation, sessionToken };
