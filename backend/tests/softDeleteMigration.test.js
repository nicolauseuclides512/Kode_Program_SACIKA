const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const up = fs.readFileSync(path.join(__dirname, "../migrations/202607200003_add_soft_delete_and_indexes.up.sql"), "utf8");
const down = fs.readFileSync(path.join(__dirname, "../migrations/202607200003_add_soft_delete_and_indexes.down.sql"), "utf8");

test("soft delete migration adds lifecycle archive columns and partial unique indexes", () => {
  assert.match(up, /ALTER TABLE kategori[\s\S]*deleted_at TIMESTAMPTZ/i);
  assert.match(up, /ALTER TABLE produk[\s\S]*deleted_at TIMESTAMPTZ/i);
  assert.match(up, /WHERE deleted_at IS NULL/i);
  assert.match(up, /uq_produk_nama_lower_active/i);
});

test("soft delete migration has a rollback", () => {
  assert.match(down, /DROP COLUMN IF EXISTS deleted_at/i);
  assert.match(down, /CREATE UNIQUE INDEX IF NOT EXISTS uq_produk_nama_lower/i);
});
