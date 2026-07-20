const { createScriptPool } = require("./lib/database");
const { runDatabaseHealthChecks } = require("../services/databaseHealthService");

function printCheck(check) {
  console.log(`[${check.status.padEnd(7)}] ${check.id}: ${check.message}`);
  if (check.details && (check.status !== "PASS" || process.argv.includes("--verbose"))) {
    console.log(`          ${JSON.stringify(check.details)}`);
  }
}

async function main(options = {}) {
  const pool = options.pool || createScriptPool();
  const shouldClose = !options.pool;

  try {
    const result = await runDatabaseHealthChecks(pool, options);
    for (const check of result.checks) printCheck(check);

    console.log("\nRingkasan:", result.summary);
    if (!result.summary.ok) process.exitCode = 1;
    return result;
  } finally {
    if (shouldClose) await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Pemeriksaan database gagal:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, printCheck };
