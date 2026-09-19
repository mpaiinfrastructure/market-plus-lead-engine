const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { getProviderConfig, getReadiness } = require('./config');

const config = getProviderConfig();
const trackedFiles = ['installed_automations.json', 'outreach_log.json', 'high_value_leads.json'];

function repairDataFiles() {
  fs.mkdirSync(config.app.dataDir, { recursive: true });
  const repaired = [];

  for (const filename of trackedFiles) {
    const filePath = path.join(config.app.dataDir, filename);
    if (!fs.existsSync(filePath)) continue;

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!Array.isArray(parsed)) throw new Error('expected a JSON array');
    } catch (error) {
      const quarantinePath = `${filePath}.corrupt-${Date.now()}`;
      fs.renameSync(filePath, quarantinePath);
      repaired.push({ filename, quarantinePath, reason: error.message });
    }
  }

  return repaired;
}

function doctor() {
  const readiness = getReadiness(config);
  const packageLock = path.resolve('package-lock.json');
  const nodeModules = path.resolve('node_modules');
  const report = {
    status: readiness.ready && fs.existsSync(packageLock) && fs.existsSync(nodeModules) ? 'ok' : 'attention_required',
    readiness,
    dependencies: {
      packageLock: fs.existsSync(packageLock),
      nodeModules: fs.existsSync(nodeModules),
    },
    dataDir: config.app.dataDir,
  };

  console.log(JSON.stringify(report, null, 2));
  return report.status === 'ok' ? 0 : 1;
}

function selfHeal() {
  const repaired = repairDataFiles();
  console.log(JSON.stringify({ status: 'ok', repaired, dataDir: config.app.dataDir }, null, 2));
  return 0;
}

function upgrade() {
  if (process.env.ALLOW_RUNTIME_UPGRADE !== 'true') {
    console.error('Runtime upgrades are disabled. Set ALLOW_RUNTIME_UPGRADE=true for a deliberate upgrade.');
    return 1;
  }

  const result = spawnSync('npm', ['install', '--omit=dev'], { stdio: 'inherit' });
  return result.status || 1;
}

const command = process.argv[2] || 'doctor';
const handlers = { doctor, 'self-heal': selfHeal, upgrade };
if (!handlers[command]) {
  console.error(`Unknown operations command: ${command}`);
  process.exitCode = 1;
} else {
  process.exitCode = handlers[command]();
}
