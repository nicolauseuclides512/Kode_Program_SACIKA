const path = require("node:path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

const backendRoot = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(backendRoot, ".env") });

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL belum diatur. Salin .env.example menjadi .env lalu isi koneksi PostgreSQL.",
    );
  }

  return databaseUrl;
}

function createScriptPool() {
  return new Pool({
    connectionString: requireDatabaseUrl(),
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
    application_name: "sacika-database-script",
  });
}

module.exports = {
  backendRoot,
  createScriptPool,
  requireDatabaseUrl,
};
