const fs = require("node:fs");
const path = require("node:path");
const { createScriptPool, backendRoot } = require("./lib/database");
const {
  acquireMigrationLock,
  ensureSchemaMigrations,
  getDownMigrationPath,
  releaseMigrationLock,
  rollbackMigration,
} = require("./lib/migrationUtils");

async function main() {
  const migrationsDir = path.join(backendRoot, "migrations");
  const pool = createScriptPool();
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    await acquireMigrationLock(client);
    lockAcquired = true;
    await ensureSchemaMigrations(client);

    const latestResult = await client.query(`
      SELECT migration_name
      FROM schema_migrations
      ORDER BY id DESC
      LIMIT 1
    `);

    if (latestResult.rows.length === 0) {
      console.log("Belum ada migration yang dapat di-rollback.");
      return;
    }

    const migrationName = latestResult.rows[0].migration_name;
    const downPath = getDownMigrationPath(migrationsDir, migrationName);

    if (!fs.existsSync(downPath)) {
      throw new Error(
        `File rollback tidak ditemukan: ${path.basename(downPath)}`,
      );
    }

    const downSql = fs.readFileSync(downPath, "utf8");
    console.log(`[DOWN] ${path.basename(downPath)}`);
    await rollbackMigration(client, migrationName, downSql);
    console.log(`[ OK ] ${migrationName} berhasil di-rollback.`);
  } finally {
    if (lockAcquired) {
      await releaseMigrationLock(client).catch((error) => {
        console.error("Gagal melepaskan migration lock:", error.message);
      });
    }

    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Rollback migration gagal:", error.message);
  process.exitCode = 1;
});
