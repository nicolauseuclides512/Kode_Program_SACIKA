const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSetupStages,
  parseArgs,
  runSetupLocalDatabase,
} = require("../scripts/setupLocalDatabase");

function createLogger() {
  const lines = [];

  return {
    lines,
    log(message) {
      lines.push(String(message));
    },
  };
}

function createRunner({ failOn = "" } = {}) {
  const calls = [];

  return {
    calls,
    async runScript(scriptName, scriptArgs = []) {
      calls.push({ scriptName, scriptArgs });

      if (scriptName === failOn) {
        throw new Error(`${scriptName} failed`);
      }

      return { scriptName, exitCode: 0 };
    },
  };
}

function baseOptions(overrides = {}) {
  return {
    inventoryFile: "C:/data/History Penjualan_LaporanBulanan.xlsx",
    commitProducts: false,
    importInventory: false,
    syncCurrentStock: false,
    ...overrides,
  };
}

function baseDependencies(overrides = {}) {
  const logger = createLogger();
  const runner = createRunner(overrides.runnerOptions);

  return {
    env: {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/sacika",
      NODE_ENV: "test",
    },
    logger,
    runScript: runner.runScript,
    testConnection: async () => {},
    confirm: async () => {
      throw new Error("confirmation should not be called");
    },
    runner,
    ...overrides,
  };
}

test("parseArgs reads inventory file and explicit data flags", () => {
  const options = parseArgs([
    "node",
    "setupLocalDatabase.js",
    "--inventory-file",
    "C:/data/history.xlsx",
    "--commit-products",
    "--import-inventory",
    "--sync-current-stock",
  ]);

  assert.equal(options.inventoryFile, "C:/data/history.xlsx");
  assert.equal(options.commitProducts, true);
  assert.equal(options.importInventory, true);
  assert.equal(options.syncCurrentStock, true);
});

test("runSetupLocalDatabase rejects missing DATABASE_URL before running stages", async () => {
  const dependencies = baseDependencies({
    env: { NODE_ENV: "test" },
  });

  await assert.rejects(
    () => runSetupLocalDatabase(baseOptions(), dependencies),
    /DATABASE_URL/,
  );
  assert.equal(dependencies.runner.calls.length, 0);
});

test("runSetupLocalDatabase rejects NODE_ENV production", async () => {
  const dependencies = baseDependencies({
    env: {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/sacika",
      NODE_ENV: "production",
    },
  });

  await assert.rejects(
    () => runSetupLocalDatabase(baseOptions(), dependencies),
    /production/,
  );
  assert.equal(dependencies.runner.calls.length, 0);
});

test("runSetupLocalDatabase stops when connection fails", async () => {
  const dependencies = baseDependencies({
    testConnection: async () => {
      throw new Error("connection failed");
    },
  });

  await assert.rejects(
    () => runSetupLocalDatabase(baseOptions(), dependencies),
    /connection failed/,
  );
  assert.equal(dependencies.runner.calls.length, 0);
});

test("runSetupLocalDatabase stops when migration fails", async () => {
  const dependencies = baseDependencies({
    runnerOptions: { failOn: "db:migrate" },
  });

  await assert.rejects(
    () => runSetupLocalDatabase(baseOptions(), dependencies),
    /db:migrate failed/,
  );
  assert.deepEqual(
    dependencies.runner.calls.map((call) => call.scriptName),
    ["db:migrate"],
  );
});

test("runSetupLocalDatabase stops when seed fails", async () => {
  const dependencies = baseDependencies({
    runnerOptions: { failOn: "db:seed" },
  });

  await assert.rejects(
    () => runSetupLocalDatabase(baseOptions(), dependencies),
    /db:seed failed/,
  );
  assert.deepEqual(
    dependencies.runner.calls.map((call) => call.scriptName),
    ["db:migrate", "db:seed"],
  );
});

test("runSetupLocalDatabase dry-run does not modify product master or inventory history", async () => {
  const dependencies = baseDependencies();

  const result = await runSetupLocalDatabase(baseOptions(), dependencies);

  assert.equal(result.ok, true);
  assert.deepEqual(
    dependencies.runner.calls.map((call) => call.scriptName),
    ["db:migrate", "db:seed", "bootstrap:products", "db:check"],
  );
  assert.equal(
    dependencies.runner.calls[2].scriptArgs.includes("--dry-run"),
    true,
  );
  assert.equal(
    dependencies.runner.calls.some((call) => {
      return call.scriptName === "import:inventory"
        || call.scriptName === "sync:current-stock";
    }),
    false,
  );
});

test("runSetupLocalDatabase full setup runs explicit data-changing stages after confirmation", async () => {
  let confirmationPrompt = "";
  const dependencies = baseDependencies({
    confirm: async (message) => {
      confirmationPrompt = message;
      return true;
    },
  });

  const result = await runSetupLocalDatabase(baseOptions({
    commitProducts: true,
    importInventory: true,
    syncCurrentStock: true,
  }), dependencies);

  assert.equal(result.ok, true);
  assert.match(confirmationPrompt, /mengubah data/);
  assert.deepEqual(
    dependencies.runner.calls.map((call) => call.scriptName),
    [
      "db:migrate",
      "db:seed",
      "bootstrap:products",
      "bootstrap:products",
      "import:inventory",
      "sync:current-stock",
      "db:check",
    ],
  );
  assert.equal(dependencies.runner.calls[3].scriptArgs.includes("--commit"), true);
  assert.equal(dependencies.runner.calls[4].scriptArgs.includes("--dry-run"), false);
  assert.equal(dependencies.runner.calls[5].scriptArgs.includes("--commit"), true);
});

test("buildSetupStages requires inventory file for bootstrap dry-run", () => {
  assert.throws(
    () => buildSetupStages(baseOptions({ inventoryFile: "" })),
    /inventory/,
  );
});
