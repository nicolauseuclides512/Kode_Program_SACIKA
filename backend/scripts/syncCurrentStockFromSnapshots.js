#!/usr/bin/env node

const path = require("path");

const {
  createPoolFromEnv,
  loadBackendEnv,
  sanitizeMessage,
} = require("./migrationRunner");
const {
  syncCurrentStockFromSnapshots,
  writeSyncReport,
} = require("../services/currentStockSyncService");

function readOption(args, name) {
  const eqArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (eqArg) return eqArg.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];

  return "";
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const commit = args.includes("--commit");
  const dryRun = args.includes("--dry-run") || !commit;
  const reportOutputPath = readOption(args, "--report-output")
    || path.resolve(process.cwd(), "current-stock-sync-report.json");

  return {
    commit,
    dryRun,
    reportOutputPath,
  };
}

async function main() {
  loadBackendEnv();
  const options = parseArgs(process.argv);

  if (options.dryRun && !options.commit) {
    console.log("Mode dry-run: database tidak diubah.");
  }

  const pool = createPoolFromEnv();

  try {
    const report = await syncCurrentStockFromSnapshots(pool, {
      commit: options.commit,
    });
    const reportPath = writeSyncReport(report, options.reportOutputPath);

    console.log(JSON.stringify({
      ...report,
      report_path: reportPath,
    }, null, 2));
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
  parseArgs,
};
