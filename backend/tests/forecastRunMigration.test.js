const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const migrationDir = path.join(__dirname, "..", "migrations");
const up = fs.readFileSync(
  path.join(migrationDir, "202607200002_refactor_forecast_runs.up.sql"),
  "utf8",
);
const down = fs.readFileSync(
  path.join(migrationDir, "202607200002_refactor_forecast_runs.down.sql"),
  "utf8",
);

test("forecast migration separates run metadata from period results", () => {
  assert.match(up, /CREATE TABLE IF NOT EXISTS forecast_run/i);
  assert.match(up, /ADD COLUMN IF NOT EXISTS forecast_run_id BIGINT/i);
  assert.match(up, /DROP COLUMN produk_id/i);
  assert.match(up, /DROP COLUMN model_used/i);
  assert.match(up, /uq_forecast_result_run_period/i);
});

test("forecast run identity includes target and supports freshness statuses", () => {
  assert.match(up, /UNIQUE \(produk_id, target, data_cutoff, model_used\)/i);
  assert.match(up, /'current', 'stale', 'superseded'/i);
  assert.match(up, /uq_forecast_run_current_per_target/i);
});

test("forecast migration persists candidate models, backtest and realized evaluation", () => {
  assert.match(up, /candidate_models JSONB/i);
  assert.match(up, /test_points INTEGER/i);
  assert.match(up, /CREATE TABLE IF NOT EXISTS forecast_backtest/i);
  assert.match(up, /actual_value NUMERIC/i);
  assert.match(up, /absolute_error NUMERIC/i);
  assert.match(up, /evaluated_at TIMESTAMPTZ/i);
  assert.match(up, /lower_bound NUMERIC/i);
  assert.match(up, /upper_bound NUMERIC/i);
});

test("forecast migration rollback restores legacy forecast_result columns", () => {
  assert.match(down, /ADD COLUMN produk_id INTEGER/i);
  assert.match(down, /ADD COLUMN target TEXT/i);
  assert.match(down, /DROP TABLE IF EXISTS forecast_backtest/i);
  assert.match(down, /DROP TABLE IF EXISTS forecast_run/i);
});
