#!/usr/bin/env node

require("dotenv").config({ path: `${__dirname}/../.env` });

const fs = require("fs");
const path = require("path");

const db = require("../config/database");
const {
  bootstrapProductsFromWorkbook,
} = require("../services/productCatalogBootstrapService");

function readOption(args, name) {
  const eqArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (eqArg) return eqArg.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return "";
}

function loadCategoryMap(categoryMapPath) {
  if (!categoryMapPath) return {};

  const absolutePath = path.resolve(categoryMapPath);
  const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("File category map harus berupa object JSON.");
  }

  return parsed;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const filePath = readOption(args, "--file")
    || process.env.IMPORT_FILE_PATH
    || process.env.INVENTORY_IMPORT_FILE;
  const commit = args.includes("--commit");
  const explicitDryRun = args.includes("--dry-run");

  if (commit && explicitDryRun) {
    throw new Error("Gunakan salah satu --commit atau --dry-run, bukan keduanya.");
  }

  const outputPath = readOption(args, "--output")
    || process.env.PRODUCT_BOOTSTRAP_REPORT
    || path.resolve(process.cwd(), "product-bootstrap-report.json");
  const categoryMapPath = readOption(args, "--category-map");

  return {
    filePath,
    commit,
    outputPath,
    categoryMap: loadCategoryMap(categoryMapPath),
  };
}

async function main() {
  const options = parseArgs(process.argv);

  if (!options.filePath) {
    throw new Error("Path workbook wajib diisi melalui --file <path>.");
  }

  const result = await bootstrapProductsFromWorkbook(db, options.filePath, options);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
