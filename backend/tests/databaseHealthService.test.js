const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateChecksum,
} = require("../scripts/migrationRunner");
const {
  REQUIRED_COLUMNS,
  REQUIRED_FOREIGN_KEYS,
  REQUIRED_TABLES,
  REQUIRED_UNIQUE_INDEXES,
  formatHealthCheckLine,
  runDatabaseHealthCheck,
} = require("../services/databaseHealthService");

function makeMigrationFixture(files = [
  {
    name: "202607170001_test.up.sql",
    sql: "SELECT 1;",
  },
]) {
  const migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sacika-health-migrations-"));

  for (const file of files) {
    fs.writeFileSync(path.join(migrationsDir, file.name), file.sql);
  }

  return {
    migrationsDir,
    rows: files.map((file) => ({
      migration_name: file.name,
      checksum: calculateChecksum(file.sql),
    })),
  };
}

function makeColumnRows(columnsByTable = REQUIRED_COLUMNS) {
  return Object.entries(columnsByTable).flatMap(([tableName, columnNames]) => {
    return columnNames.map((columnName) => ({
      table_name: tableName,
      column_name: columnName,
    }));
  });
}

function makeForeignKeyRows(foreignKeys = REQUIRED_FOREIGN_KEYS) {
  return foreignKeys.map((key) => ({
    table_name: key.table,
    column_name: key.column,
    foreign_table_name: key.foreignTable,
    foreign_column_name: key.foreignColumn,
  }));
}

function createObservedHistory(productId = 1, count = 18) {
  return Array.from({ length: count }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return {
      id: index + 1,
      produk_id: productId,
      periode: `2024-${month}-01`,
      stok_akhir: 10 + index,
      status_data: "observed",
      updated_at: `2024-${month}-02`,
    };
  });
}

function createHealthPool(options = {}) {
  const state = {
    hasSchemaMigrations: options.hasSchemaMigrations ?? true,
    migrationRows: options.migrationRows || [],
    tableRows: (options.tableNames || REQUIRED_TABLES).map((tableName) => ({
      table_name: tableName,
    })),
    columnRows: options.columnRows || makeColumnRows(options.columnsByTable || REQUIRED_COLUMNS),
    foreignKeyRows: options.foreignKeyRows || makeForeignKeyRows(options.foreignKeys || REQUIRED_FOREIGN_KEYS),
    uniqueRows: (options.uniqueIndexes || REQUIRED_UNIQUE_INDEXES).map((indexName) => ({
      index_name: indexName,
    })),
    counts: options.counts || {},
    snapshotRange: options.snapshotRange || {
      min_period: "2024-01-01",
      max_period: "2025-12-01",
      snapshot_count: 24,
      valid_snapshot_count: 24,
    },
    products: options.products || [{ id: 1, nama_produk: "Aqua Botol 600 ml" }],
    historyRows: options.historyRows || createObservedHistory(1, 18),
    duplicateRows: options.duplicateRows || [],
    adminCount: options.adminCount ?? 1,
    activeUserCount: options.activeUserCount ?? 1,
    passwordStats: options.passwordStats || {
      total_users: 1,
      suspicious_count: 0,
    },
    queries: [],
  };

  function countRow(key) {
    return { rows: [{ count: state.counts[key] || 0 }] };
  }

  return {
    state,
    async connect() {
      return {
        async query(sql) {
          state.queries.push(sql);
          const normalizedSql = sql.replace(/\s+/g, " ").trim();

          if (normalizedSql === "SELECT 1 AS ok") {
            return { rows: [{ ok: 1 }] };
          }

          if (normalizedSql === "SHOW server_version") {
            return { rows: [{ server_version: "16.3" }] };
          }

          if (normalizedSql.includes("to_regclass")) {
            return {
              rows: [{
                table_name: state.hasSchemaMigrations ? "schema_migrations" : null,
              }],
            };
          }

          if (normalizedSql.includes("FROM schema_migrations")) {
            return { rows: state.migrationRows };
          }

          if (normalizedSql.includes("FROM information_schema.tables")) {
            return { rows: state.tableRows };
          }

          if (normalizedSql.includes("FROM information_schema.columns")) {
            return { rows: state.columnRows };
          }

          if (normalizedSql.includes("FROM information_schema.table_constraints")) {
            return { rows: state.foreignKeyRows };
          }

          if (normalizedSql.includes("FROM pg_indexes")) {
            return { rows: state.uniqueRows };
          }

          if (normalizedSql.includes("FROM produk p LEFT JOIN kategori")) {
            return countRow("products_without_category");
          }

          if (normalizedSql.includes("FROM transaksi t LEFT JOIN produk")) {
            return countRow("transactions_without_product");
          }

          if (normalizedSql.includes("FROM product_alias a LEFT JOIN produk")) {
            return countRow("aliases_without_product");
          }

          if (normalizedSql.includes("FROM inventory_snapshot_monthly s LEFT JOIN produk")) {
            return countRow("snapshots_without_product");
          }

          if (normalizedSql.includes("FROM forecast_result f LEFT JOIN produk")) {
            return countRow("forecasts_without_product");
          }

          if (normalizedSql.includes("FROM penjualan_bulanan pb LEFT JOIN produk")) {
            return countRow("monthly_sales_without_product");
          }

          if (normalizedSql.includes("FROM produk WHERE stok < 0")) {
            return countRow("negative_product_stock");
          }

          if (normalizedSql.includes("FROM transaksi WHERE jumlah <= 0")) {
            return countRow("invalid_transaction_quantity");
          }

          if (normalizedSql.includes("status_data = 'observed'")) {
            return countRow("observed_snapshot_null_stock");
          }

          if (normalizedSql.includes("status_data = 'missing'")) {
            return countRow("missing_snapshot_with_stock");
          }

          if (normalizedSql.includes("MIN(periode)::text")) {
            return { rows: [state.snapshotRange] };
          }

          if (normalizedSql === "SELECT id, nama_produk FROM produk ORDER BY id") {
            return { rows: state.products };
          }

          if (normalizedSql.includes("GROUP BY produk_id, periode")) {
            return { rows: state.duplicateRows };
          }

          if (
            normalizedSql.includes("FROM inventory_snapshot_monthly")
            && normalizedSql.includes("ORDER BY produk_id ASC, periode ASC")
          ) {
            return { rows: state.historyRows };
          }

          if (normalizedSql.includes("LOWER(BTRIM(username))")) {
            return { rows: [{ count: state.adminCount }] };
          }

          if (normalizedSql.includes("WHERE is_active = TRUE")) {
            return { rows: [{ count: state.activeUserCount }] };
          }

          if (normalizedSql.includes("suspicious_count")) {
            return { rows: [state.passwordStats] };
          }

          throw new Error(`Unexpected query: ${normalizedSql}`);
        },
        release() {},
      };
    },
  };
}

test("runDatabaseHealthCheck returns PASS checks for a healthy database", async () => {
  const fixture = makeMigrationFixture();
  const pool = createHealthPool({
    migrationRows: fixture.rows,
  });

  const report = await runDatabaseHealthCheck(pool, {
    migrationsDir: fixture.migrationsDir,
    env: { ADMIN_USERNAME: "admin" },
  });

  assert.equal(report.exit_code, 0);
  assert.equal(report.summary.fail, 0);
  assert.equal(report.checks.find((check) => check.code === "connection").status, "PASS");
  assert.equal(report.checks.find((check) => check.code === "migrations.applied").status, "PASS");
  assert.equal(report.checks.find((check) => check.code === "schema.tables").status, "PASS");
  assert.equal(report.checks.find((check) => check.code === "auth.admin_user").status, "PASS");
  assert.equal(report.checks.find((check) => check.code === "auth.password_hashes").status, "PASS");
});

test("runDatabaseHealthCheck reports critical failures and exit code 1", async () => {
  const fixture = makeMigrationFixture();
  const pool = createHealthPool({
    migrationRows: [],
    tableNames: REQUIRED_TABLES.filter((tableName) => tableName !== "forecast_result"),
    counts: {
      negative_product_stock: 2,
      observed_snapshot_null_stock: 1,
    },
    adminCount: 0,
    passwordStats: {
      total_users: 1,
      suspicious_count: 1,
    },
  });

  const report = await runDatabaseHealthCheck(pool, {
    migrationsDir: fixture.migrationsDir,
    env: { ADMIN_USERNAME: "admin" },
  });
  const failedCodes = report.checks
    .filter((check) => check.status === "FAIL")
    .map((check) => check.code);

  assert.equal(report.exit_code, 1);
  assert.equal(report.ok, false);
  assert.match(failedCodes.join(","), /migrations\.applied/);
  assert.match(failedCodes.join(","), /schema\.tables/);
  assert.match(failedCodes.join(","), /integrity\.negative_product_stock/);
  assert.match(failedCodes.join(","), /integrity\.observed_snapshot_null_stock/);
  assert.match(failedCodes.join(","), /auth\.admin_user/);
  assert.match(failedCodes.join(","), /auth\.password_hashes/);
});

test("runDatabaseHealthCheck keeps WARNING non-critical with exit code 0", async () => {
  const fixture = makeMigrationFixture();
  const pool = createHealthPool({
    migrationRows: [
      ...fixture.rows,
      {
        migration_name: "202607999999_missing_local_file.up.sql",
        checksum: "old-checksum",
      },
    ],
    snapshotRange: {
      min_period: null,
      max_period: null,
      snapshot_count: 0,
      valid_snapshot_count: 0,
    },
  });

  const report = await runDatabaseHealthCheck(pool, {
    migrationsDir: fixture.migrationsDir,
    env: {},
  });
  const warningCodes = report.checks
    .filter((check) => check.status === "WARNING")
    .map((check) => check.code);

  assert.equal(report.exit_code, 0);
  assert.equal(report.summary.fail, 0);
  assert.match(warningCodes.join(","), /migrations\.applied/);
  assert.match(warningCodes.join(","), /snapshot\.range/);
  assert.match(warningCodes.join(","), /auth\.admin_user/);
});

test("formatHealthCheckLine includes status code and message without password fields", () => {
  const line = formatHealthCheckLine({
    status: "PASS",
    code: "auth.password_hashes",
    message: "Password pengguna tidak tampak sebagai plaintext",
    details: { total_users: 1 },
  });

  assert.match(line, /^\[PASS\] auth\.password_hashes:/);
  assert.equal(line.includes("$2b$"), false);
  assert.equal(line.includes("secret"), false);
});

