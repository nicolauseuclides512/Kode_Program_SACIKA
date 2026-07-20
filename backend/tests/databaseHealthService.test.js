const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runDatabaseHealthChecks,
  summarizeChecks,
} = require("../services/databaseHealthService");

test("summary health check membedakan warning dan kegagalan kritis", () => {
  const summary = summarizeChecks([
    { status: "PASS", critical: true },
    { status: "WARNING", critical: false },
    { status: "FAIL", critical: false },
  ]);
  assert.deepEqual(summary, {
    pass: 1,
    warning: 1,
    fail: 1,
    critical_failures: 0,
    ok: true,
  });

  const failed = summarizeChecks([{ status: "FAIL", critical: true }]);
  assert.equal(failed.ok, false);
  assert.equal(failed.critical_failures, 1);
});

test("health check berhenti dengan aman ketika koneksi database gagal", async () => {
  const db = {
    async query() {
      throw new Error("connection refused");
    },
  };

  const result = await runDatabaseHealthChecks(db);
  assert.equal(result.summary.ok, false);
  assert.equal(result.checks[0].id, "database_connection");
  assert.equal(result.checks[0].status, "FAIL");
});
