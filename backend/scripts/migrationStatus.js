const path = require("node:path");
const { createScriptPool, backendRoot } = require("./lib/database");
const {
  ensureSchemaMigrations,
  listUpMigrations,
  readAppliedMigrations,
} = require("./lib/migrationUtils");

async function main() {
  const migrationsDir = path.join(backendRoot, "migrations");
  const migrations = listUpMigrations(migrationsDir);
  const pool = createScriptPool();
  const client = await pool.connect();

  try {
    await ensureSchemaMigrations(client);
    const appliedRows = await readAppliedMigrations(client);
    const appliedByName = new Map(
      appliedRows.map((row) => [row.migration_name, row]),
    );

    let hasProblem = false;

    console.log("STATUS\tMIGRATION");

    for (const migration of migrations) {
      const existing = appliedByName.get(migration.name);

      if (!existing) {
        console.log(`PENDING\t${migration.name}`);
        continue;
      }

      if (existing.checksum !== migration.checksum) {
        console.log(`CHANGED\t${migration.name}`);
        hasProblem = true;
        continue;
      }

      console.log(`APPLIED\t${migration.name}`);
    }

    const localNames = new Set(migrations.map((migration) => migration.name));
    for (const row of appliedRows) {
      if (!localNames.has(row.migration_name)) {
        console.log(`MISSING_FILE\t${row.migration_name}`);
        hasProblem = true;
      }
    }

    if (hasProblem) {
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Pemeriksaan migration gagal:", error.message);
  process.exitCode = 1;
});
