const fs = require('fs');
const path = require('path');
const { getProviderConfig, getProviderStatus, getReadiness } = require('./config');

const trackedFiles = {
  leads: 'high_value_leads.json',
  outreach: 'outreach_log.json',
  installations: 'installed_automations.json',
};

const clients = new Set();
const state = {
  autonomous: false,
  lastEventAt: null,
};

function readArray(dataDir, filename) {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.warn(`Command center could not read ${filename}: ${error.message}`);
    return [];
  }
}

function readObject(dataDir, filename, fallback = {}) {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return value && typeof value === 'object' ? value : fallback;
  } catch (error) {
    console.warn(`Command center could not read ${filename}: ${error.message}`);
    return fallback;
  }
}

function getTelemetry() {
  const config = getProviderConfig();
  const pipelineState = (() => {
    const filePath = path.join(config.app.dataDir, 'pipeline_state.json');
    if (!fs.existsSync(filePath)) return { status: 'idle', pausedUntil: null };
    try {
      const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const paused = value.pausedUntil && Date.parse(value.pausedUntil) > Date.now();
      return {
        status: paused ? 'paused' : 'running',
        pausedUntil: value.pausedUntil || null,
        cycleLeads: value.cycleLeads || 0,
        total: value.total || 0,
        completed: value.completed || 0,
        nextIndex: value.nextIndex || 0,
      };
    } catch (error) {
      console.warn(`Command center could not read pipeline state: ${error.message}`);
      return { status: 'unknown', pausedUntil: null };
    }
  })();
  const leads = readArray(config.app.dataDir, trackedFiles.leads);
  const outreach = readArray(config.app.dataDir, trackedFiles.outreach);
  const installations = readArray(config.app.dataDir, trackedFiles.installations);
  const pipelineTelemetry = readObject(config.app.dataDir, 'pipeline_telemetry.json', { items: [] });
  const locks = readObject(config.app.dataDir, 'pipeline_locks.json', {});
  const successfulOutreach = outreach.filter((item) => !item.error).length;
  const scanTotal = Number(pipelineState.total || 0);
  const scanCompleted = Number(pipelineState.completed || pipelineState.nextIndex || 0);
  const telemetryItems = Array.isArray(pipelineTelemetry.items) ? pipelineTelemetry.items : [];
  const projectedLostRevenueCents = leads.reduce((total, lead) => total + Number(lead.projection?.annualOpportunity || 0) * 100, 0);
  const lockEntries = Object.entries(locks);

  return {
    timestamp: new Date().toISOString(),
    leads: { total: leads.length, byZip: leads.reduce((result, lead) => {
      const zip = String(lead.zip || 'unknown');
      result[zip] = (result[zip] || 0) + 1;
      return result;
    }, {}) },
    outreach: { total: outreach.length, successful: successfulOutreach },
    installations: { total: installations.length, queued: installations.filter((item) => item.deploymentStatus === 'queued_for_provider_installation').length },
    revenue: { currency: 'USD', bookedCents: installations.length * 250000, projectedLostRevenueCents },
    scan: {
      status: pipelineState.pausedUntil && Date.parse(pipelineState.pausedUntil) > Date.now() ? 'paused' : (pipelineState.status || 'running'),
      total: scanTotal,
      completed: scanCompleted,
      percent: scanTotal ? Math.min(100, Math.round((scanCompleted / scanTotal) * 1000) / 10) : 0,
      activeThreads: Number(config.pipelineConcurrency || process.env.PIPELINE_CONCURRENCY || 4),
      errors: telemetryItems.filter((item) => item.status === 'error').length,
      pausedUntil: pipelineState.pausedUntil || null,
    },
    locks: lockEntries.slice(-12).map(([key, value]) => ({ key, ...(value && typeof value === 'object' ? value : { status: String(value) }) })),
    triggers: { outreach: outreach.length, installations: installations.length },
    providers: getProviderStatus(config),
  };
}

function getStatus() {
  const config = getProviderConfig();
  const readiness = getReadiness(config);
  return {
    status: 'ok',
    service: 'Market Plus Command Center',
    environment: config.app.environment,
    autonomous: state.autonomous,
    lastEventAt: state.lastEventAt,
    readiness,
    telemetry: getTelemetry(),
  };
}

function publish(event, data) {
  state.lastEventAt = new Date().toISOString();
  const payload = `event: ${event}\ndata: ${JSON.stringify({ ...data, timestamp: state.lastEventAt })}\n\n`;
  for (const client of clients) client.write(payload);
}

function setAutonomous(enabled) {
  state.autonomous = Boolean(enabled);
  publish('autonomous-control', { autonomous: state.autonomous });
  return { autonomous: state.autonomous, timestamp: state.lastEventAt };
}

function addSseClient(response) {
  clients.add(response);
  response.write(`event: snapshot\ndata: ${JSON.stringify(getStatus())}\n\n`);
  return () => clients.delete(response);
}

function commandCenterRouter(express) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', getProviderConfig().app.dashboardOrigin);
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  router.get('/telemetry', (_, res) => res.json(getTelemetry()));
  router.get('/status', (_, res) => res.json(getStatus()));
  router.get('/autonomous-control', (_, res) => res.json({ autonomous: state.autonomous }));
  router.post('/autonomous-control', express.json({ limit: '4kb' }), (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be a boolean.' });
    }
    return res.json(setAutonomous(req.body.enabled));
  });
  router.get('/live-log', (req, res) => {
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    const removeClient = addSseClient(res);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
    req.on('close', () => {
      clearInterval(heartbeat);
      removeClient();
    });
  });
  return router;
}

module.exports = { commandCenterRouter, getTelemetry, getStatus, setAutonomous };
