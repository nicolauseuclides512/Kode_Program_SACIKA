const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  listUpMigrations,
  sha256,
  stripOuterTransaction,
} = require("../scripts/lib/migrationUtils");

test("stripOuterTransaction removes legacy BEGIN and COMMIT", () => {
  const sql = "BEGIN;\nCREATE TABLE example(id INTEGER);\nCOMMIT;";
  assert.equal(
    stripOuterTransaction(sql),
    "CREATE TABLE example(id INTEGER);",
  );
});

test("listUpMigrations returns timestamped migrations in order", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sacika-migrations-"));

  try {
    fs.writeFileSync(
      path.join(directory, "202607180002_second.up.sql"),
      "SELECT 2;",
    );
    fs.writeFileSync(
      path.join(directory, "202607170001_first.up.sql"),
      "SELECT 1;",
    );
    fs.writeFileSync(
      path.join(directory, "202607170001_first.down.sql"),
      "SELECT 0;",
    );

    const migrations = listUpMigrations(directory);
    assert.deepEqual(
      migrations.map((migration) => migration.name),
      ["202607170001_first", "202607180002_second"],
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("sha256 returns a stable lowercase checksum", () => {
  assert.equal(
    sha256("SACIKA"),
    "2c555e6bb2ad6ebe8c42919bda20ab6a5d8e23cd5534069a33f1e8ab7fe215ba",
  );
});
