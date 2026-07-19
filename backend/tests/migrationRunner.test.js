const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateChecksum,
  getMigrationStatus,
  readMigrationFiles,
  rollbackLastMigration,
  runPendingMigrations,
  sanitizeMessage,
} = require("../scripts/migrationRunner");

function createTempMigrations(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sacika-migrations-"));

  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, fileName), content, "utf8");
  }

  return dir;
}

function createFakePool(initialApplied = [], options = {}) {
  const state = {
    applied: initialApplied.map((migration, index) => ({ id: index + 1, applied_at: new Date("2026-01-01"), ...migration })),
    queries: [],
    released: false,
    nextId: initialApplied.length + 1,
  };

  const pool = {
    state,
    async connect() {
      return {
        async query(sql, params = []) {
          state.queries.push({ sql, params });

          if (sql.includes("pg_advisory_lock") || sql.includes("pg_advisory_unlock")) {
            return { rows: [] };
          }

          if (sql.includes("CREATE TABLE IF NOT EXISTS schema_migrations")) {
            return { rows: [] };
          }

          if (sql.includes("FROM schema_migrations") && sql.includes("ORDER BY migration_name")) {
            return { rows: [...state.applied].sort((a, b) => a.migration_name.localeCompare(b.migration_name)) };
          }

          if (sql.includes("FROM schema_migrations") && sql.includes("ORDER BY id DESC")) {
            const latest = [...state.applied].sort((a, b) => b.id - a.id)[0];
            return { rows: latest ? [latest] : [] };
          }

          if (sql.includes("INSERT INTO schema_migrations")) {
            state.applied.push({
              id: state.nextId,
              migration_name: params[0],
              checksum: params[1],
              applied_at: new Date("2026-01-02"),
            });
            state.nextId += 1;
            return { rows: [] };
          }

          if (sql.includes("DELETE FROM schema_migrations")) {
            state.applied = state.applied.filter((migration) => migration.id !== params[0]);
            return { rows: [], rowCount: 1 };
          }

          if (options.failSql && sql.includes(options.failSql)) {
            throw new Error("simulated SQL failure");
          }

          return { rows: [] };
        },
        release() {
          state.released = true;
        },
      };
    },
  };

  return pool;
}

test("readMigrationFiles sorts up migrations by timestamp name", () => {
  const dir = createTempMigrations({
    "202607190001_c.up.sql": "SELECT 3;",
    "202607170001_a.up.sql": "SELECT 1;",
    "202607180001_b.up.sql": "SELECT 2;",
    "202607180001_b.down.sql": "SELECT -2;",
  });

  const files = readMigrationFiles(dir, "up").map((migration) => migration.migrationName);

  assert.deepEqual(files, [
    "202607170001_a.up.sql",
    "202607180001_b.up.sql",
    "202607190001_c.up.sql",
  ]);
});

test("runPendingMigrations applies only migrations not yet recorded", async () => {
  const dir = createTempMigrations({
    "202607170001_a.up.sql": "BEGIN; SELECT 1; COMMIT;",
    "202607180001_b.up.sql": "BEGIN; SELECT 2; COMMIT;",
  });
  const firstChecksum = calculateChecksum("BEGIN; SELECT 1; COMMIT;");
  const pool = createFakePool([{ migration_name: "202607170001_a.up.sql", checksum: firstChecksum }]);

  const result = await runPendingMigrations({ pool, migrationsDir: dir, logger: null });

  assert.deepEqual(result.applied, ["202607180001_b.up.sql"]);
  assert.equal(result.skipped, 1);
  assert.equal(pool.state.applied.length, 2);
  assert.ok(pool.state.queries.some(({ sql }) => sql.includes("pg_advisory_lock")));
  assert.ok(pool.state.queries.some(({ sql }) => sql.includes("pg_advisory_unlock")));
});

test("runPendingMigrations skips migrations already applied with matching checksum", async () => {
  const sql = "SELECT 1;";
  const dir = createTempMigrations({ "202607170001_a.up.sql": sql });
  const pool = createFakePool([{ migration_name: "202607170001_a.up.sql", checksum: calculateChecksum(sql) }]);

  const result = await runPendingMigrations({ pool, migrationsDir: dir, logger: null });

  assert.deepEqual(result.applied, []);
  assert.equal(result.skipped, 1);
  assert.equal(pool.state.applied.length, 1);
});

test("runPendingMigrations rejects an applied migration whose checksum changed", async () => {
  const dir = createTempMigrations({ "202607170001_a.up.sql": "SELECT changed;" });
  const pool = createFakePool([{ migration_name: "202607170001_a.up.sql", checksum: "old-checksum" }]);

  await assert.rejects(
    runPendingMigrations({ pool, migrationsDir: dir, logger: null }),
    /Checksum migration berubah: 202607170001_a\.up\.sql/,
  );
});

test("runPendingMigrations stops and does not record the failing migration", async () => {
  const dir = createTempMigrations({
    "202607170001_a.up.sql": "SELECT 1;",
    "202607180001_b.up.sql": "SELECT FAIL;",
  });
  const pool = createFakePool([], { failSql: "FAIL" });

  await assert.rejects(
    runPendingMigrations({ pool, migrationsDir: dir, logger: null }),
    /Migration gagal: 202607180001_b\.up\.sql/,
  );

  assert.deepEqual(pool.state.applied.map((migration) => migration.migration_name), ["202607170001_a.up.sql"]);
});

test("getMigrationStatus reports pending and applied migrations", async () => {
  const sql = "SELECT 1;";
  const dir = createTempMigrations({
    "202607170001_a.up.sql": sql,
    "202607180001_b.up.sql": "SELECT 2;",
  });
  const pool = createFakePool([{ migration_name: "202607170001_a.up.sql", checksum: calculateChecksum(sql) }]);

  const rows = await getMigrationStatus({ pool, migrationsDir: dir });

  assert.deepEqual(rows.map((row) => [row.migration_name, row.status]), [
    ["202607170001_a.up.sql", "applied"],
    ["202607180001_b.up.sql", "pending"],
  ]);
});

test("rollbackLastMigration runs the latest down migration and removes its record", async () => {
  const upSqlA = "SELECT 1;";
  const upSqlB = "SELECT 2;";
  const downSqlB = "SELECT rollback_2;";
  const dir = createTempMigrations({
    "202607170001_a.up.sql": upSqlA,
    "202607170001_a.down.sql": "SELECT rollback_1;",
    "202607180001_b.up.sql": upSqlB,
    "202607180001_b.down.sql": downSqlB,
  });
  const pool = createFakePool([
    { id: 1, migration_name: "202607170001_a.up.sql", checksum: calculateChecksum(upSqlA) },
    { id: 2, migration_name: "202607180001_b.up.sql", checksum: calculateChecksum(upSqlB) },
  ]);

  const result = await rollbackLastMigration({ pool, migrationsDir: dir, logger: null });

  assert.equal(result.rolledBack, "202607180001_b.up.sql");
  assert.deepEqual(pool.state.applied.map((migration) => migration.migration_name), ["202607170001_a.up.sql"]);
  assert.ok(pool.state.queries.some(({ sql }) => sql === downSqlB));
});

test("rollbackLastMigration rejects when the down file is missing", async () => {
  const upSql = "SELECT 1;";
  const dir = createTempMigrations({ "202607170001_a.up.sql": upSql });
  const pool = createFakePool([{ id: 1, migration_name: "202607170001_a.up.sql", checksum: calculateChecksum(upSql) }]);

  await assert.rejects(
    rollbackLastMigration({ pool, migrationsDir: dir, logger: null }),
    /File rollback tidak ditemukan untuk 202607170001_a\.up\.sql/,
  );

  assert.equal(pool.state.applied.length, 1);
});

test("sanitizeMessage hides database credentials", () => {
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://user:secret@localhost:5432/db";

  assert.equal(
    sanitizeMessage("failed for postgresql://user:secret@localhost:5432/db"),
    "failed for [DATABASE_URL disembunyikan]",
  );
  assert.equal(
    sanitizeMessage("connect postgresql://other:password@example.test/db"),
    "connect postgresql://[credential disembunyikan]@example.test/db",
  );

  if (previousUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousUrl;
  }
});
