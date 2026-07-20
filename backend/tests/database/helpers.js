const path = require("node:path");
const { Pool } = require("pg");
const {
  acquireMigrationLock,
  applyMigration,
  ensureSchemaMigrations,
  listUpMigrations,
  readAppliedMigrations,
  releaseMigrationLock,
  rollbackMigration,
  getDownMigrationPath,
} = require("../../scripts/lib/migrationUtils");
const fs = require("node:fs");

const backendRoot = path.resolve(__dirname, "../..");
const migrationsDir = path.join(backendRoot, "migrations");

function parseDatabaseName(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

function requireTestDatabaseUrl(env = process.env) {
  const testUrl = env.TEST_DATABASE_URL?.trim();
  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL belum diisi. Gunakan database terpisah yang namanya mengandung 'test'.",
    );
  }

  const testName = parseDatabaseName(testUrl).toLowerCase();
  if (!testName || !testName.includes("test")) {
    throw new Error("Nama database TEST_DATABASE_URL wajib mengandung kata 'test'.");
  }

  const developmentUrl = env.DATABASE_URL?.trim();
  if (developmentUrl && developmentUrl === testUrl) {
    throw new Error("TEST_DATABASE_URL tidak boleh sama dengan DATABASE_URL.");
  }

  return testUrl;
}

function createTestPool(env = process.env) {
  return new Pool({
    connectionString: requireTestDatabaseUrl(env),
    ssl: false,
    max: 4,
    application_name: "sacika-integration-tests",
  });
}

async function resetPublicSchema(pool) {
  const client = await pool.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
    await client.query("GRANT ALL ON SCHEMA public TO public");
  } finally {
    client.release();
  }
}

async function applyAllMigrations(pool) {
  const client = await pool.connect();
  let locked = false;
  try {
    await acquireMigrationLock(client);
    locked = true;
    await ensureSchemaMigrations(client);
    const appliedRows = await readAppliedMigrations(client);
    const applied = new Map(appliedRows.map((row) => [row.migration_name, row]));
    const migrations = listUpMigrations(migrationsDir);

    for (const migration of migrations) {
      const existing = applied.get(migration.name);
      if (existing) {
        if (existing.checksum !== migration.checksum) {
          throw new Error(`Checksum migration berubah: ${migration.name}`);
        }
        continue;
      }
      await applyMigration(client, migration);
    }

    return migrations;
  } finally {
    if (locked) await releaseMigrationLock(client);
    client.release();
  }
}

async function rollbackLatestMigration(pool) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT migration_name
      FROM schema_migrations
      ORDER BY migration_name DESC
      LIMIT 1
    `);
    const migrationName = result.rows[0]?.migration_name;
    if (!migrationName) return null;

    const downPath = getDownMigrationPath(migrationsDir, migrationName);
    if (!fs.existsSync(downPath)) {
      throw new Error(`Down migration tidak ditemukan: ${migrationName}`);
    }
    await rollbackMigration(client, migrationName, fs.readFileSync(downPath, "utf8"));
    return migrationName;
  } finally {
    client.release();
  }
}

async function createCategory(pool, name = "Kategori Test") {
  const result = await pool.query(
    "INSERT INTO kategori(nama_kategori) VALUES($1) RETURNING id",
    [name],
  );
  return Number(result.rows[0].id);
}

async function createProduct(pool, categoryId, options = {}) {
  const result = await pool.query(
    `
      INSERT INTO produk(
        kode_produk, nama_produk, kategori_id, harga, stok, stok_minimum,
        is_active, active_from
      )
      VALUES($1, $2, $3, $4, $5, $6, TRUE, $7)
      RETURNING id
    `,
    [
      options.code || null,
      options.name || "Produk Test",
      categoryId,
      options.price ?? 1000,
      options.stock ?? 10,
      options.minimumStock ?? 2,
      options.activeFrom || "2024-01-01",
    ],
  );
  return Number(result.rows[0].id);
}

module.exports = {
  applyAllMigrations,
  backendRoot,
  createCategory,
  createProduct,
  createTestPool,
  migrationsDir,
  parseDatabaseName,
  requireTestDatabaseUrl,
  resetPublicSchema,
  rollbackLatestMigration,
};
