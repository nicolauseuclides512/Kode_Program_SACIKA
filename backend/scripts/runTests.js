#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function listTestFiles(scope) {
  const testsRoot = path.resolve(__dirname, "../tests");
  const scopeDirectories = {
    unit: testsRoot,
    database: path.join(testsRoot, "database"),
    integration: path.join(testsRoot, "integration"),
  };
  const target = scopeDirectories[scope];

  if (!fs.existsSync(target)) return [];

  return fs.readdirSync(target, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js"))
    .map((entry) => path.join(target, entry.name))
    .sort();
}

function main() {
  const scope = process.argv[2] || "unit";
  if (!["unit", "database", "integration"].includes(scope)) {
    throw new Error("Scope test harus unit, database, atau integration.");
  }

  const files = listTestFiles(scope);
  if (files.length === 0) {
    throw new Error(`Tidak ada test untuk scope ${scope}.`);
  }

  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", ...files],
    { stdio: "inherit", env: process.env },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { listTestFiles, main };
