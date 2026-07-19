const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const dotenv = require("dotenv");
const { Pool } = require("pg");

const BACKEND_DIR = path.join(__dirname, "..");
const DEFAULT_MIGRATIONS_DIR = path.join(BACKEND_DIR, "migrations");
const ADVISORY_LOCK_KEY = "170001202607";

function loadBackendEnv(envPath = path.join(BACKEND_DIR, ".env")) {
  dotenv.config({ path: envPath, quiet: true });
}

function createPoolFromEnv() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL belum diatur untuk menjalankan migration");
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
}

function sanitizeMessage(message = "") {
  let sanitized = String(message);

  if (process.env.DATABASE_URL) {
    sanitized = sanitized.split(process.env.DATABASE_URL).join("[DATABASE_URL disembunyikan]");
  }

  return sanitized.replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://[credential disembunyikan]@");
}

function calculateChecksum(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function readMigrationFiles(migrationsDir = DEFAULT_MIGRATIONS_DIR, direction = "up") {
  const suffix = `.${direction}.sql`;

  return fs.readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(suffix))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => {
      const filePath = path.join(migrationsDir, fileName);
      const sql = fs.readFileSync(filePath, "utf8");

      return {
        migrationName: fileName,
        fileName,
        filePath,
        sql,
        checksum: calculateChecksum(sql),
      };
    });
}

async function ensureSchemaMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      migration_name TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_schema_migrations_name_not_empty
        CHECK (BTRIM(migration_name) <> ''),
      CONSTRAINT chk_schema_migrations_checksum_not_empty
        CHECK (BTRIM(checksum) <> '')
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(`
    SELECT id, migration_name, checksum, applied_at
    FROM schema_migrations
    ORDER BY migration_name ASC
  `);

  return result.rows;
}

async function getLastAppliedMigration(client) {
  const result = await client.query(`
    SELECT id, migration_name, checksum, applied_at
    FROM schema_migrations
    ORDER BY id DESC
    LIMIT 1
  `);

  return result.rows[0] || null;
}

function toAppliedMap(appliedMigrations) {
  return new Map(appliedMigrations.map((migration) => [migration.migration_name, migration]));
}

function assertAppliedChecksumsUnchanged(localMigrations, appliedMigrations) {
  const appliedByName = Array.isArray(appliedMigrations)
    ? toAppliedMap(appliedMigrations)
    : appliedMigrations;

  for (const migration of localMigrations) {
    const applied = appliedByName.get(migration.migrationName);

    if (applied && applied.checksum !== migration.checksum) {
      throw new Error(`Checksum migration berubah: ${migration.migrationName}`);
    }
  }
}

async function withMigrationLock(pool, callback) {
  const client = await pool.connect();
  let hasLock = false;
  let originalError = null;

  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_KEY]);
    hasLock = true;
    return await callback(client);
  } catch (error) {
    originalError = error;
    throw error;
  } finally {
    if (hasLock) {
      try {
        await client.query("SELECT pg_advisory_unlock($1::bigint)", [ADVISORY_LOCK_KEY]);
      } catch (unlockError) {
        if (!originalError) throw unlockError;
      }
    }

    client.release();
  }
}

async function runPendingMigrations({ pool, migrationsDir = DEFAULT_MIGRATIONS_DIR, logger = console } = {}) {
  if (!pool) throw new Error("Pool database wajib diberikan");

  return withMigrationLock(pool, async (client) => {
    await ensureSchemaMigrations(client);

    const localMigrations = readMigrationFiles(migrationsDir, "up");
    const appliedMigrations = await getAppliedMigrations(client);
    const appliedByName = toAppliedMap(appliedMigrations);

    assertAppliedChecksumsUnchanged(localMigrations, appliedByName);

    const pendingMigrations = localMigrations.filter((migration) => !appliedByName.has(migration.migrationName));
    const appliedNow = [];

    for (const migration of pendingMigrations) {
      logger?.info?.(`Menjalankan migration ${migration.migrationName}`);

      try {
        await client.query(migration.sql);
        await client.query(
          `
            INSERT INTO schema_migrations (migration_name, checksum)
            VALUES ($1, $2)
          `,
          [migration.migrationName, migration.checksum],
        );
        appliedNow.push(migration.migrationName);
      } catch (error) {
        throw new Error(`Migration gagal: ${migration.migrationName}: ${sanitizeMessage(error.message)}`);
      }
    }

    return {
      total: localMigrations.length,
      applied: appliedNow,
      skipped: localMigrations.length - pendingMigrations.length,
    };
  });
}

async function getMigrationStatus({ pool, migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  if (!pool) throw new Error("Pool database wajib diberikan");

  return withMigrationLock(pool, async (client) => {
    await ensureSchemaMigrations(client);

    const localMigrations = readMigrationFiles(migrationsDir, "up");
    const appliedMigrations = await getAppliedMigrations(client);
    const appliedByName = toAppliedMap(appliedMigrations);

    assertAppliedChecksumsUnchanged(localMigrations, appliedByName);

    const localNames = new Set(localMigrations.map((migration) => migration.migrationName));
    const rows = localMigrations.map((migration) => {
      const applied = appliedByName.get(migration.migrationName);

      return {
        migration_name: migration.migrationName,
        checksum: migration.checksum,
        applied_at: applied?.applied_at || null,
        status: applied ? "applied" : "pending",
      };
    });

    for (const applied of appliedMigrations) {
      if (!localNames.has(applied.migration_name)) {
        rows.push({
          migration_name: applied.migration_name,
          checksum: applied.checksum,
          applied_at: applied.applied_at,
          status: "missing_file",
        });
      }
    }

    return rows;
  });
}

function getDownMigrationPath(migrationsDir, upMigrationName) {
  if (!upMigrationName.endsWith(".up.sql")) {
    throw new Error(`Nama migration tidak valid untuk rollback: ${upMigrationName}`);
  }

  return path.join(migrationsDir, upMigrationName.replace(/\.up\.sql$/, ".down.sql"));
}

async function rollbackLastMigration({ pool, migrationsDir = DEFAULT_MIGRATIONS_DIR, logger = console } = {}) {
  if (!pool) throw new Error("Pool database wajib diberikan");

  return withMigrationLock(pool, async (client) => {
    await ensureSchemaMigrations(client);

    const lastMigration = await getLastAppliedMigration(client);
    if (!lastMigration) {
      return { rolledBack: null };
    }

    const localUpPath = path.join(migrationsDir, lastMigration.migration_name);
    if (fs.existsSync(localUpPath)) {
      const currentChecksum = calculateChecksum(fs.readFileSync(localUpPath, "utf8"));
      if (currentChecksum !== lastMigration.checksum) {
        throw new Error(`Checksum migration berubah: ${lastMigration.migration_name}`);
      }
    }

    const downPath = getDownMigrationPath(migrationsDir, lastMigration.migration_name);
    if (!fs.existsSync(downPath)) {
      throw new Error(`File rollback tidak ditemukan untuk ${lastMigration.migration_name}`);
    }

    const downSql = fs.readFileSync(downPath, "utf8");
    logger?.info?.(`Rollback migration ${lastMigration.migration_name}`);

    try {
      await client.query(downSql);
      await client.query("DELETE FROM schema_migrations WHERE id=$1", [lastMigration.id]);
    } catch (error) {
      throw new Error(`Rollback gagal: ${lastMigration.migration_name}: ${sanitizeMessage(error.message)}`);
    }

    return {
      rolledBack: lastMigration.migration_name,
      downFile: path.basename(downPath),
    };
  });
}

module.exports = {
  ADVISORY_LOCK_KEY,
  DEFAULT_MIGRATIONS_DIR,
  assertAppliedChecksumsUnchanged,
  calculateChecksum,
  createPoolFromEnv,
  ensureSchemaMigrations,
  getAppliedMigrations,
  getDownMigrationPath,
  getLastAppliedMigration,
  getMigrationStatus,
  loadBackendEnv,
  readMigrationFiles,
  rollbackLastMigration,
  runPendingMigrations,
  sanitizeMessage,
  withMigrationLock,
};
