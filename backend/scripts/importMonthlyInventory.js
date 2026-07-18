#!/usr/bin/env node

require("dotenv").config({ path: `${__dirname}/../.env` });

const path = require("path");

const db = require("../config/database");
const {
  importMonthlyInventory,
} = require("../services/monthlyInventoryImporter");

function readOption(args, name) {
  const eqArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (eqArg) return eqArg.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];

  return "";
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const filePath = readOption(args, "--file")
    || process.env.IMPORT_FILE_PATH
    || process.env.INVENTORY_IMPORT_FILE;
  const dryRun = args.includes("--dry-run") || process.env.DRY_RUN === "true";
  const unresolvedFormat = readOption(args, "--unresolved-format") || "json";
  const unresolvedOutputPath = readOption(args, "--unresolved-output")
    || path.resolve(process.cwd(), `unresolved-products.${unresolvedFormat}`);

  return {
    filePath,
    dryRun,
    unresolvedFormat,
    unresolvedOutputPath,
  };
}

async function main() {
  const options = parseArgs(process.argv);

  if (!options.filePath) {
    throw new Error(
      "Path file wajib diisi: gunakan --file <path> atau IMPORT_FILE_PATH",
    );
  }

  const summary = await importMonthlyInventory(db, options.filePath, {
    dryRun: options.dryRun,
    unresolvedFormat: options.unresolvedFormat,
    unresolvedOutputPath: options.unresolvedOutputPath,
  });

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
