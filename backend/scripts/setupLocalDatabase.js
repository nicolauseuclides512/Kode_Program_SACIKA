#!/usr/bin/env node

require("dotenv").config({ path: `${__dirname}/../.env` });

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function readOption(args, name) {
  const equalArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalArg) return equalArg.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
}

function parseArgs(argv) {
  const args = argv.slice(2);
  return {
    inventoryFile: readOption(args, "--inventory-file"),
    commitProducts: args.includes("--commit-products"),
    importInventory: args.includes("--import-inventory"),
    syncCurrentStock: args.includes("--sync-current-stock"),
    skipSeed: args.includes("--skip-seed"),
  };
}

function assertSafeEnvironment(env = process.env) {
  if (String(env.NODE_ENV || "development").toLowerCase() === "production") {
    throw new Error("db:setup-local tidak boleh dijalankan pada NODE_ENV=production.");
  }

  if (!env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL belum diisi pada backend/.env.");
  }
}

function validateOptions(options) {
  const mutationRequested = options.commitProducts
    || options.importInventory
    || options.syncCurrentStock;

  if (mutationRequested && !options.inventoryFile) {
    throw new Error(
      "--inventory-file wajib diisi ketika menggunakan --commit-products, "
      + "--import-inventory, atau --sync-current-stock.",
    );
  }

  if (options.syncCurrentStock && !options.importInventory) {
    throw new Error("--sync-current-stock harus digunakan bersama --import-inventory.");
  }

  if (options.inventoryFile && !fs.existsSync(path.resolve(options.inventoryFile))) {
    throw new Error(`File inventory tidak ditemukan: ${options.inventoryFile}`);
  }
}

function buildSetupPlan(options) {
  const plan = [
    { name: "migration", script: "migrate.js", args: [] },
  ];

  if (!options.skipSeed) {
    plan.push({ name: "seed", script: "seed.js", args: [] });
  }

  if (options.inventoryFile) {
    const filePath = path.resolve(options.inventoryFile);
    plan.push({
      name: "bootstrap-products-dry-run",
      script: "bootstrapProductsFromWorkbook.js",
      args: ["--file", filePath, "--dry-run"],
    });

    if (options.commitProducts) {
      plan.push({
        name: "bootstrap-products-commit",
        script: "bootstrapProductsFromWorkbook.js",
        args: ["--file", filePath, "--commit"],
      });
    }

    plan.push({
      name: "import-inventory-dry-run",
      script: "importMonthlyInventory.js",
      args: ["--file", filePath, "--dry-run"],
    });

    if (options.importInventory) {
      plan.push({
        name: "import-inventory-commit",
        script: "importMonthlyInventory.js",
        args: ["--file", filePath],
      });
    }

    if (options.syncCurrentStock) {
      plan.push({
        name: "sync-current-stock-dry-run",
        script: "syncCurrentStockFromSnapshots.js",
        args: ["--dry-run"],
      });
      plan.push({
        name: "sync-current-stock-commit",
        script: "syncCurrentStockFromSnapshots.js",
        args: ["--commit"],
      });
    }
  }

  plan.push({ name: "database-health-check", script: "checkDatabase.js", args: [] });
  return plan;
}

function runStep(step, options = {}) {
  const scriptPath = path.join(__dirname, step.script);
  const spawn = options.spawn || spawnSync;
  console.log(`\n=== ${step.name} ===`);
  const result = spawn(process.execPath, [scriptPath, ...step.args], {
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Tahap ${step.name} gagal dengan exit code ${result.status}.`);
  }
}

async function main(options = parseArgs(process.argv), dependencies = {}) {
  assertSafeEnvironment(dependencies.env || process.env);
  validateOptions(options);
  const plan = buildSetupPlan(options);

  console.log("Rencana setup database lokal:");
  plan.forEach((step, index) => console.log(`${index + 1}. ${step.name}`));

  for (const step of plan) {
    runStep(step, dependencies);
  }

  console.log("\nSetup database lokal selesai.");
  return plan;
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Setup database lokal gagal:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  assertSafeEnvironment,
  buildSetupPlan,
  main,
  parseArgs,
  runStep,
  validateOptions,
};
