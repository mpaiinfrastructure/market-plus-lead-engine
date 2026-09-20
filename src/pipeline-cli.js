const { runPipeline } = require('./pipeline');

runPipeline()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.errors > 0) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(`Lead pipeline failed: ${error.message}`);
    process.exitCode = 1;
  });
