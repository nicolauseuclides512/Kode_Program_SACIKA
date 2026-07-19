const {
  createPoolFromEnv,
  getMigrationStatus,
  loadBackendEnv,
  sanitizeMessage,
} = require("./migrationRunner");

async function main() {
  loadBackendEnv();
  const pool = createPoolFromEnv();

  try {
    const rows = await getMigrationStatus({ pool });
    console.log("Status migration:");

    for (const row of rows) {
      console.log(`${row.status.padEnd(12)} ${row.migration_name}`);
    }
  } catch (error) {
    console.error(sanitizeMessage(error.message));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
