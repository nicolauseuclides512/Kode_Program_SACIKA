const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const migrationDir = path.join(__dirname, "..", "migrations");
const up = fs.readFileSync(
  path.join(migrationDir, "202607200001_add_product_lifecycle_and_mapping_issues.up.sql"),
  "utf8",
);
const down = fs.readFileSync(
  path.join(migrationDir, "202607200001_add_product_lifecycle_and_mapping_issues.down.sql"),
  "utf8",
);

test("product lifecycle migration adds active status and active period", () => {
  assert.match(up, /ADD COLUMN IF NOT EXISTS is_active BOOLEAN/i);
  assert.match(up, /ADD COLUMN IF NOT EXISTS active_from DATE/i);
  assert.match(up, /ADD COLUMN IF NOT EXISTS active_until DATE/i);
  assert.match(up, /chk_produk_active_period_order/i);
  assert.match(up, /chk_produk_inactive_requires_end/i);
});

test("inventory status migration distinguishes missing, not listed, and not active", () => {
  assert.match(up, /'missing'/i);
  assert.match(up, /'not_listed'/i);
  assert.match(up, /'not_active'/i);
  assert.match(up, /status_data IN \('missing', 'not_listed', 'not_active'\)/i);
});

test("mapping issue table supports unresolved and collision review", () => {
  assert.match(up, /CREATE TABLE IF NOT EXISTS product_mapping_issue/i);
  assert.match(up, /'unresolved'/i);
  assert.match(up, /'collision'/i);
  assert.match(up, /resolved_product_id/i);
});

test("lifecycle migration has rollback for all new objects", () => {
  assert.match(down, /DROP TABLE IF EXISTS product_mapping_issue/i);
  assert.match(down, /DROP COLUMN IF EXISTS active_until/i);
  assert.match(down, /DROP COLUMN IF EXISTS active_from/i);
  assert.match(down, /DROP COLUMN IF EXISTS is_active/i);
});
