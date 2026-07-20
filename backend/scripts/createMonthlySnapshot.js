#!/usr/bin/env node

require("dotenv").config({ path: `${__dirname}/../.env` });

const fs = require("fs");
const path = require("path");

const db = require("../config/database");
const { createMonthlySnapshots } = require("../services/monthlySnapshotService");

function readOption(args, name) {
  const equalArg = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalArg) return equalArg.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return "";
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const commit = args.includes("--commit");
  const explicitDryRun = args.includes("--dry-run");

  if (commit && explicitDryRun) {
    throw new Error("Gunakan salah satu --commit atau --dry-run, bukan keduanya");
  }

  return {
    period: readOption(args, "--period") || null,
    commit,
    force: args.includes("--force"),
    output: readOption(args, "--output") || "",
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const result = await createMonthlySnapshots(db, options);
  const text = JSON.stringify(result, null, 2);

  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, text, "utf8");
  }

  console.log(text);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
