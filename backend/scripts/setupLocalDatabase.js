#!/usr/bin/env node

const readline = require("node:readline/promises");
const { spawn } = require("node:child_process");
const path = require("node:path");

const {
  createPoolFromEnv,
  loadBackendEnv,
  sanitizeMessage,
} = require("./migrationRunner");

const BACKEND_DIR = path.join(__dirname, "..");

function readOption(args, name) {
  const eqArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (eqArg) return eqArg.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];

  return "";
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const inventoryFile = readOption(args, "--inventory-file")
    || process.env.INVENTORY_FILE
    || process.env.IMPORT_FILE_PATH
    || "";

  return {
    inventoryFile,
    commitProducts: args.includes("--commit-products"),
    importInventory: args.includes("--import-inventory"),
    syncCurrentStock: args.includes("--sync-current-stock"),
  };
}

function createNpmScriptArgs(scriptName, scriptArgs = []) {
  return [
    "run",
    scriptName,
    ...(scriptArgs.length > 0 ? ["--", ...scriptArgs] : []),
  ];
}

function runNpmScript(scriptName, scriptArgs = [], options = {}) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = createNpmScriptArgs(scriptName, scriptArgs);

  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      cwd: BACKEND_DIR,
      env: process.env,
      stdio: options.stdio || "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ scriptName, exitCode: code });
        return;
      }

      reject(new Error(`Tahap ${scriptName} gagal dengan exit code ${code}`));
    });
  });
}

async function testDatabaseConnection() {
  const pool = createPoolFromEnv();
  let client;

  try {
    client = await pool.connect();
    await client.query("SELECT 1 AS ok");
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

async function askConfirmation(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(`${message}\nKetik YES untuk melanjutkan: `);
    return answer.trim() === "YES";
  } finally {
    rl.close();
  }
}

function createStage(scriptName, scriptArgs = []) {
  return {
    scriptName,
    scriptArgs,
    command: `npm run ${scriptName}${scriptArgs.length > 0 ? ` -- ${scriptArgs.join(" ")}` : ""}`,
  };
}

function buildSetupStages(options) {
  if (!options.inventoryFile) {
    throw new Error("Path inventory wajib diisi: gunakan --inventory-file <PATH_FILE.xlsx>");
  }

  const bootstrapDryRunReport = path.resolve(BACKEND_DIR, "setup-bootstrap-products-dry-run.json");
  const bootstrapCommitReport = path.resolve(BACKEND_DIR, "setup-bootstrap-products-commit.json");
  const unresolvedOutput = path.resolve(BACKEND_DIR, "setup-unresolved-products.json");
  const stockSyncReport = path.resolve(BACKEND_DIR, "setup-current-stock-sync-report.json");

  const stages = [
    createStage("db:migrate"),
    createStage("db:seed"),
    createStage("bootstrap:products", [
      "--file",
      options.inventoryFile,
      "--dry-run",
      "--report-output",
      bootstrapDryRunReport,
    ]),
  ];

  const dataChangingStages = [];

  if (options.commitProducts) {
    dataChangingStages.push(createStage("bootstrap:products", [
      "--file",
      options.inventoryFile,
      "--commit",
      "--report-output",
      bootstrapCommitReport,
    ]));
  }

  if (options.importInventory) {
    dataChangingStages.push(createStage("import:inventory", [
      "--file",
      options.inventoryFile,
      "--unresolved-output",
      unresolvedOutput,
    ]));
  }

  if (options.syncCurrentStock) {
    dataChangingStages.push(createStage("sync:current-stock", [
      "--commit",
      "--report-output",
      stockSyncReport,
    ]));
  }

  return {
    preflightStages: stages,
    dataChangingStages,
    finalStages: [createStage("db:check")],
  };
}

function ensureSetupAllowed(env) {
  if (env.NODE_ENV === "production") {
    throw new Error("setup-local ditolak pada NODE_ENV=production");
  }

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL belum diatur di backend/.env");
  }
}

function summarizeOptions(options) {
  return {
    inventory_file: options.inventoryFile,
    commit_products: options.commitProducts,
    import_inventory: options.importInventory,
    sync_current_stock: options.syncCurrentStock,
  };
}

async function runStage(stage, runScript, logger) {
  logger.log(`\n==> ${stage.scriptName}`);
  logger.log(stage.command);
  await runScript(stage.scriptName, stage.scriptArgs);
  logger.log(`Selesai: ${stage.scriptName}`);

  return {
    stage: stage.scriptName,
    status: "success",
  };
}

async function runSetupLocalDatabase(options, dependencies = {}) {
  const env = dependencies.env || process.env;
  const logger = dependencies.logger || console;
  const runScript = dependencies.runScript || runNpmScript;
  const connect = dependencies.testConnection || testDatabaseConnection;
  const confirm = dependencies.confirm || askConfirmation;

  ensureSetupAllowed(env);
  const stages = buildSetupStages(options);
  const results = [];

  logger.log("Setup database lokal SACIKA");
  logger.log(JSON.stringify(summarizeOptions(options), null, 2));

  logger.log("\n==> connection");
  await connect();
  logger.log("Selesai: koneksi PostgreSQL berhasil");
  results.push({ stage: "connection", status: "success" });

  for (const stage of stages.preflightStages) {
    results.push(await runStage(stage, runScript, logger));
  }

  if (stages.dataChangingStages.length === 0) {
    logger.log("\nMode aman: master produk, histori inventory, dan stok saat ini belum diubah.");
    logger.log("Jalankan ulang dengan flag eksplisit jika dry-run sudah sesuai:");
    logger.log("--commit-products --import-inventory --sync-current-stock");
  } else {
    const operations = stages.dataChangingStages
      .map((stage) => `- ${stage.command}`)
      .join("\n");
    const approved = await confirm(
      `Operasi berikut akan mengubah data master/histori/stok:\n${operations}`,
    );

    if (!approved) {
      throw new Error("Setup dibatalkan oleh pengguna sebelum perubahan data dijalankan");
    }

    for (const stage of stages.dataChangingStages) {
      results.push(await runStage(stage, runScript, logger));
    }
  }

  for (const stage of stages.finalStages) {
    results.push(await runStage(stage, runScript, logger));
  }

  logger.log("\nRingkasan setup:");
  for (const result of results) {
    logger.log(`- ${result.stage}: ${result.status}`);
  }

  return {
    ok: true,
    stages: results,
  };
}

async function main() {
  loadBackendEnv();
  const options = parseArgs(process.argv);
  await runSetupLocalDatabase(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(sanitizeMessage(error.message));
    process.exitCode = 1;
  });
}

module.exports = {
  buildSetupStages,
  createNpmScriptArgs,
  ensureSetupAllowed,
  main,
  parseArgs,
  runSetupLocalDatabase,
};
