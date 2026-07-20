#!/usr/bin/env node

const {
  createPoolFromEnv,
  loadBackendEnv,
  sanitizeMessage,
} = require("./migrationRunner");
const {
  formatHealthCheckLine,
  runDatabaseHealthCheck,
} = require("../services/databaseHealthService");

async function main() {
  loadBackendEnv();
  const pool = createPoolFromEnv();

  try {
    const report = await runDatabaseHealthCheck(pool);

    console.log("Database health check:");
    for (const check of report.checks) {
      console.log(formatHealthCheckLine(check));
    }
    console.log(`Summary: PASS=${report.summary.pass} WARNING=${report.summary.warning} FAIL=${report.summary.fail}`);

    process.exitCode = report.exit_code;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(sanitizeMessage(error.message));
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
