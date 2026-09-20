const fs = require('fs');
const path = require('path');
const { getProviderConfig } = require('./config');
const { scrapeBusinessLeadsForZip } = require('./scraper');
const { buildPitchPrompt } = require('./outreach');
const { qualifyLeadLocally } = require('./ai');

const ZIP_PATTERN = /^\d{5}$/;
const DEFAULT_NICHES = ['general'];

function pipelineError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function loadZipDataset(filePath = process.env.ZIP_DATASET_PATH || path.resolve(__dirname, '..', 'datasets', 'zips.txt')) {
  if (!fs.existsSync(filePath)) {
    throw pipelineError('ZIP_DATASET_MISSING', `ZIP dataset is missing: ${filePath}`);
  }

  const zips = [];
  const seen = new Set();
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    if (!ZIP_PATTERN.test(line)) {
      throw pipelineError('ZIP_DATASET_INVALID', `Invalid ZIP at ${filePath}:${index + 1}: "${rawLine}"`);
    }
    if (!seen.has(line)) {
      seen.add(line);
      zips.push(line);
    }
  });

  if (zips.length === 0) {
    throw pipelineError('ZIP_DATASET_INVALID', `ZIP dataset contains no ZIP codes: ${filePath}`);
  }
  return zips;
}

function normalizeNiches(niches = process.env.LEAD_NICHES) {
  const values = Array.isArray(niches) ? niches : String(niches || DEFAULT_NICHES).split(',');
  const result = [...new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
  if (result.length === 0) throw pipelineError('NICHES_INVALID', 'At least one niche is required.');
  return result;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return parsed;
}

function writeJsonAtomically(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

function projectOpportunity(lead, qualification) {
  const monthlyMissedRevenue = Math.round(qualification.score * 100);
  return {
    monthlyMissedRevenue,
    annualOpportunity: monthlyMissedRevenue * 12,
    confidence: qualification.score >= 75 ? 'high' : qualification.score >= 60 ? 'medium' : 'low',
  };
}

function generateOutreach(lead, qualification, dryRun = true) {
  return {
    dryRun,
    mode: 'voice',
    subject: `AI automation opportunity for ${lead.name || 'your business'}`,
    body: buildPitchPrompt(lead),
    qualification,
  };
}

async function runPipeline(options = {}) {
  const config = getProviderConfig();
  const dataDir = options.dataDir || config.app.dataDir;
  const zips = options.zips || loadZipDataset(options.datasetPath);
  const niches = normalizeNiches(options.niches);
  const concurrency = Math.max(1, Math.floor(Number(options.concurrency || process.env.PIPELINE_CONCURRENCY || 4)));
  const dryRun = options.dryRun === undefined ? config.app.dryRun : Boolean(options.dryRun);
  const leadCap = Math.max(1, Math.floor(Number(options.leadCap || process.env.PIPELINE_LEAD_CAP || 200)));
  const pauseMs = Math.max(1000, Math.floor(Number(
    options.pauseMs || process.env.PIPELINE_PAUSE_MS || 4 * 60 * 60 * 1000,
  )));
  const scrape = options.scrape || ((zip, niche) => scrapeBusinessLeadsForZip(zip, niche));
  const statePath = options.statePath || path.join(dataDir, 'pipeline_state.json');
  const locksPath = options.locksPath || path.join(dataDir, 'pipeline_locks.json');
  const telemetryPath = options.telemetryPath || path.join(dataDir, 'pipeline_telemetry.json');
  const leadsPath = options.leadsPath || path.join(dataDir, 'high_value_leads.json');
  const state = readJson(statePath, {
    nextIndex: 0,
    completed: 0,
    completedJobs: {},
    total: zips.length * niches.length,
    cycleLeads: 0,
    pausedUntil: null,
  });
  const now = Date.now();
  if (state.pausedUntil && Date.parse(state.pausedUntil) > now) {
    return {
      status: 'paused',
      pausedUntil: state.pausedUntil,
      remainingMs: Date.parse(state.pausedUntil) - now,
      leadCap,
      leads: readJson(leadsPath, []),
      state,
      locks: readJson(locksPath, {}),
    };
  }
  if (state.pausedUntil && Date.parse(state.pausedUntil) <= now) {
    state.pausedUntil = null;
    state.cycleLeads = 0;
  }
  const locks = readJson(locksPath, {});
  const leads = readJson(leadsPath, []);
  const telemetry = readJson(telemetryPath, { runs: [], items: [] });
  const jobs = [];

  for (const zip of zips) {
    for (const niche of niches) jobs.push({ zip, niche, key: `${zip}:${niche}` });
  }
  state.total = jobs.length;
  state.completedJobs = state.completedJobs || {};
  const run = {
    startedAt: new Date().toISOString(),
    dryRun,
    concurrency,
    leadCap,
    pauseMs,
    total: jobs.length,
    processed: 0,
    errors: 0,
    leadsFound: 0,
    status: 'running',
  };

  let cursor = 0;
  let stopScheduling = false;
  async function worker() {
    while (true) {
      if (stopScheduling || state.cycleLeads >= leadCap) return;
      const index = cursor;
      cursor += 1;
      if (index >= jobs.length) return;
      const job = jobs[index];
      if (state.completedJobs[job.key] || locks[job.key]) {
        state.completedJobs[job.key] = true;
        continue;
      }
      const startedAt = Date.now();
      try {
        const scraped = await scrape(job.zip, job.niche);
        const mappedRecords = (Array.isArray(scraped) ? scraped : []).map((lead) => {
          const enriched = { ...lead, zip: job.zip, niche: job.niche };
          const qualification = qualifyLeadLocally(enriched);
          return {
            ...enriched,
            qualification,
            projection: projectOpportunity(enriched, qualification),
            outreach: generateOutreach(enriched, qualification, dryRun),
          };
        });
        const remaining = Math.max(0, leadCap - state.cycleLeads);
        const records = mappedRecords.slice(0, remaining);
        for (const record of records) {
          const duplicate = leads.some((item) => item.website === record.website && item.zip === record.zip && item.niche === record.niche);
          if (!duplicate) {
            leads.push(record);
            state.cycleLeads += 1;
            run.leadsFound += 1;
          }
        }
        locks[job.key] = { zip: job.zip, niche: job.niche, lockedAt: new Date().toISOString(), count: records.length };
        telemetry.items.push({ ...job, status: 'completed', count: records.length, durationMs: Date.now() - startedAt });
        run.processed += 1;
        if (state.cycleLeads >= leadCap) stopScheduling = true;
      } catch (error) {
        telemetry.items.push({ ...job, status: 'error', error: error.message, durationMs: Date.now() - startedAt });
        run.errors += 1;
      } finally {
        if (!state.completedJobs[job.key] && locks[job.key]) state.completed += 1;
        if (locks[job.key]) state.completedJobs[job.key] = true;
        state.nextIndex = index + 1;
        writeJsonAtomically(statePath, state);
        writeJsonAtomically(locksPath, locks);
        writeJsonAtomically(leadsPath, leads);
        writeJsonAtomically(telemetryPath, telemetry);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  if (state.cycleLeads >= leadCap) {
    state.pausedUntil = new Date(Date.now() + pauseMs).toISOString();
    run.status = 'paused';
    run.pausedUntil = state.pausedUntil;
  } else {
    run.status = 'complete';
  }
  run.finishedAt = new Date().toISOString();
  telemetry.runs.push(run);
  writeJsonAtomically(telemetryPath, telemetry);
  return { ...run, state, locks, leads, telemetry };
}

module.exports = {
  loadZipDataset,
  normalizeNiches,
  localQualification: qualifyLeadLocally,
  projectOpportunity,
  generateOutreach,
  runPipeline,
};
