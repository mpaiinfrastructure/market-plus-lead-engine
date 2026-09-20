const { runPipeline } = require('./pipeline');

const intervalMs = Math.max(1000, Number(process.env.PIPELINE_WATCH_INTERVAL_MS || 60000));
let stopping = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function watch() {
  process.once('SIGINT', () => { stopping = true; });
  process.once('SIGTERM', () => { stopping = true; });
  console.log(`Pipeline watch active. Recheck interval: ${intervalMs}ms.`);

  while (!stopping) {
    try {
      const result = await runPipeline();
      console.log(JSON.stringify({
        status: result.status,
        processed: result.processed,
        leadsFound: result.leadsFound,
        errors: result.errors,
        pausedUntil: result.pausedUntil || null,
      }));
      const pauseWait = result.pausedUntil ? Math.max(1000, Date.parse(result.pausedUntil) - Date.now()) : intervalMs;
      await wait(Math.min(pauseWait, 24 * 60 * 60 * 1000));
    } catch (error) {
      console.error(`Pipeline watch cycle failed: ${error.message}`);
      await wait(intervalMs);
    }
  }

  console.log('Pipeline watch stopped.');
}

watch().catch((error) => {
  console.error(`Pipeline watch failed: ${error.message}`);
  process.exitCode = 1;
});
