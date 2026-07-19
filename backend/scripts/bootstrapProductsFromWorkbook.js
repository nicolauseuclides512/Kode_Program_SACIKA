#!/usr/bin/env node

const path = require("path");

const {
  createPoolFromEnv,
  loadBackendEnv,
  sanitizeMessage,
} = require("./migrationRunner");
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

function parseArgs(argv) {
  const args = argv.slice(2);
  const filePath = readOption(args, "--file") || process.env.PRODUCT_BOOTSTRAP_FILE;
  const commit = args.includes("--commit");
  const dryRun = args.includes("--dry-run") || !commit;
  const reportFormat = readOption(args, "--report-format") || "json";
  const reportOutputPath = readOption(args, "--report-output")
    || path.resolve(process.cwd(), `bootstrap-products-report.${reportFormat}`);
  const categoryMapPath = readOption(args, "--category-map") || "";

  return {
    filePath,
    commit,
    dryRun,
    reportFormat,
    reportOutputPath,
    categoryMapPath,
  };
}

async function main() {
  loadBackendEnv();
  const options = parseArgs(process.argv);

  if (!options.filePath) {
    throw new Error("Path file wajib diisi: gunakan --file <path>");
  }

  if (options.dryRun && !options.commit) {
    console.log("Mode dry-run: database tidak diubah.");
  }

  const pool = createPoolFromEnv();

  try {
    const result = await bootstrapProductsFromWorkbook(pool, options.filePath, {
      commit: options.commit,
      categoryMapPath: options.categoryMapPath,
      reportFormat: options.reportFormat,
      reportOutputPath: options.reportOutputPath,
    });

    console.log(JSON.stringify({
      mode: result.mode,
      summary: result.summary,
      created_products: result.created_products.length,
      created_aliases: result.created_aliases.length,
      report_path: result.report_path,
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
