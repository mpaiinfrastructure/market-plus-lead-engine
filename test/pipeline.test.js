const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadZipDataset,
  localQualification,
  projectOpportunity,
  runPipeline,
} = require('../src/pipeline');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'market-plus-pipeline-'));
}

test('validates a line-oriented ZIP dataset and reports missing or invalid input', () => {
  const directory = tempDir();
  const valid = path.join(directory, 'zips.txt');
  fs.writeFileSync(valid, '# sample\n90210\n90210\n02108\n');
  assert.deepEqual(loadZipDataset(valid), ['90210', '02108']);

  assert.throws(() => loadZipDataset(path.join(directory, 'missing.txt')), { code: 'ZIP_DATASET_MISSING' });
  const invalid = path.join(directory, 'invalid.txt');
  fs.writeFileSync(invalid, '90210\nnot-a-zip\n');
  assert.throws(() => loadZipDataset(invalid), { code: 'ZIP_DATASET_INVALID' });
});

test('ships a nationwide ZIP dataset instead of the legacy five-ZIP fallback', () => {
  const datasetPath = path.resolve(__dirname, '..', 'datasets', 'zips.txt');
  assert.ok(loadZipDataset(datasetPath).length > 10000);
});

test('qualifies and projects leads deterministically', () => {
  const qualification = localQualification({
    website: 'https://example.com',
    phone: '+15551234567',
    aiReady: false,
    businessType: 'Plumber',
  });
  assert.deepEqual(qualification, {
    qualified: true,
    score: 100,
    summary: 'Business has a reachable contact and an apparent automation opportunity.',
    recommendedTools: ['AI receptionist', 'Missed call text back', 'Lead qualification'],
    provider: 'local',
  });
  assert.deepEqual(projectOpportunity({}, qualification), {
    monthlyMissedRevenue: 10000,
    annualOpportunity: 120000,
    confidence: 'high',
  });
});

test('resumes failed jobs and keeps permanent ZIP+niche locks for multiple niches', async () => {
  const directory = tempDir();
  let attempts = 0;
  const scrape = async (zip, niche) => {
    attempts += 1;
    if (niche === 'roofing' && attempts === 1) throw new Error('temporary failure');
    return [{ name: `${niche} business`, website: `https://${niche}.example`, phone: '5555555555', businessType: 'Service', aiReady: false }];
  };
  const first = await runPipeline({
    dataDir: directory,
    zips: ['90210'],
    niches: ['roofing', 'plumbing'],
    concurrency: 1,
    dryRun: true,
    scrape,
  });
  assert.equal(first.run?.processed, undefined);
  assert.equal(first.processed, 1);
  assert.equal(Object.keys(first.locks).length, 1);
  assert.equal(first.leads[0].outreach.dryRun, true);

  const second = await runPipeline({
    dataDir: directory,
    zips: ['90210'],
    niches: ['roofing', 'plumbing'],
    concurrency: 2,
    dryRun: true,
    scrape,
  });
  assert.equal(second.processed, 1);
  assert.deepEqual(Object.keys(second.locks).sort(), ['90210:plumbing', '90210:roofing']);
  assert.equal(second.leads.length, 2);
});

test('pauses after the configured lead cap and exposes a four-hour resume window', async () => {
  const directory = tempDir();
  const result = await runPipeline({
    dataDir: directory,
    zips: ['90210', '10021'],
    niches: ['roofing'],
    concurrency: 1,
    leadCap: 2,
    pauseMs: 4 * 60 * 60 * 1000,
    scrape: async (zip, niche) => [
      { name: `${niche} one`, website: `https://${zip}-one.example`, phone: '5555555555', businessType: 'Service', aiReady: false },
      { name: `${niche} two`, website: `https://${zip}-two.example`, phone: '5555555556', businessType: 'Service', aiReady: false },
    ],
  });

  assert.equal(result.status, 'paused');
  assert.equal(result.leadsFound, 2);
  assert.equal(result.leads.length, 2);
  assert.ok(Date.parse(result.pausedUntil) > Date.now());

  const paused = await runPipeline({
    dataDir: directory,
    zips: ['90210', '10021'],
    niches: ['roofing'],
    leadCap: 2,
    scrape: async () => [],
  });
  assert.equal(paused.status, 'paused');
  assert.equal(paused.leads.length, 2);
});
