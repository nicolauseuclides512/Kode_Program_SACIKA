const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MIGRATION_LOCK_KEY = 512202607;
const UP_SUFFIX = ".up.sql";
const DOWN_SUFFIX = ".down.sql";

function sha256(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function isUpMigrationFile(filename) {
  return /^\d{12,}_[a-z0-9_\-]+\.up\.sql$/i.test(filename);
}

function listUpMigrations(migrationsDir) {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isUpMigrationFile(entry.name))
    .map((entry) => {
      const fullPath = path.join(migrationsDir, entry.name);
      const sql = fs.readFileSync(fullPath, "utf8");

      return {
        filename: entry.name,
        name: entry.name.slice(0, -UP_SUFFIX.length),
        fullPath,
        sql,
        checksum: sha256(sql),
      };
    })
    .sort((left, right) => left.filename.localeCompare(right.filename));
}

function getDownMigrationPath(migrationsDir, migrationName) {
  return path.join(migrationsDir, `${migrationName}${DOWN_SUFFIX}`);
}

function stripOuterTransaction(sql) {
  let body = String(sql ?? "").trim();

  if (/^BEGIN\s*;/i.test(body)) {
    body = body.replace(/^BEGIN\s*;/i, "").trim();
  }

  if (/COMMIT\s*;?\s*$/i.test(body)) {
    body = body.replace(/COMMIT\s*;?\s*$/i, "").trim();
  }

  return body;
}

async function ensureSchemaMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      migration_name TEXT NOT NULL UNIQUE,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_schema_migrations_name_not_empty
        CHECK (BTRIM(migration_name) <> ''),
      CONSTRAINT chk_schema_migrations_checksum_sha256
        CHECK (checksum ~ '^[0-9a-f]{64}$')
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
      ON schema_migrations (applied_at DESC, id DESC)
  `);
}

async function acquireMigrationLock(client) {
  await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
}

async function releaseMigrationLock(client) {
  await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
}

async function readAppliedMigrations(client) {
  const result = await client.query(`
    SELECT id, migration_name, checksum, applied_at
    FROM schema_migrations
    ORDER BY migration_name ASC
  `);

  return result.rows;
}

async function applyMigration(client, migration) {
  const body = stripOuterTransaction(migration.sql);

  if (!body) {
    throw new Error(`Migration ${migration.filename} kosong.`);
  }

  await client.query("BEGIN");

  try {
    await client.query(body);
    await client.query(
      `
        INSERT INTO schema_migrations (migration_name, checksum)
        VALUES ($1, $2)
      `,
      [migration.name, migration.checksum],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function rollbackMigration(client, migrationName, downSql) {
  const body = stripOuterTransaction(downSql);

  if (!body) {
    throw new Error(`Rollback migration ${migrationName} kosong.`);
  }

  await client.query("BEGIN");

  try {
    await client.query(body);
    await client.query(
      "DELETE FROM schema_migrations WHERE migration_name = $1",
      [migrationName],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

module.exports = {
  MIGRATION_LOCK_KEY,
  acquireMigrationLock,
  applyMigration,
  ensureSchemaMigrations,
  getDownMigrationPath,
  isUpMigrationFile,
  listUpMigrations,
  readAppliedMigrations,
  releaseMigrationLock,
  rollbackMigration,
  sha256,
  stripOuterTransaction,
};
