const path = require("node:path");
const {
  backendRoot,
} = require("../scripts/lib/database");
const {
  listUpMigrations,
} = require("../scripts/lib/migrationUtils");

const REQUIRED_TABLES = [
  "schema_migrations",
  "pengguna",
  "kategori",
  "produk",
  "transaksi",
  "dataset_mingguan",
  "inventory_snapshot_monthly",
  "product_alias",
  "forecast_run",
  "forecast_result",
  "forecast_backtest",
  "import_batch",
  "penjualan_bulanan",
  "product_mapping_issue",
];

const REQUIRED_COLUMNS = {
  pengguna: ["id", "nama", "username", "password_hash", "role", "is_active"],
  kategori: ["id", "nama_kategori", "is_active", "deleted_at"],
  produk: [
    "id", "kode_produk", "nama_produk", "kategori_id", "harga", "stok",
    "stok_minimum", "is_active", "active_from", "active_until", "deleted_at",
  ],
  transaksi: ["id", "produk_id", "jenis_transaksi", "jumlah", "harga", "total", "tanggal"],
  inventory_snapshot_monthly: [
    "id", "produk_id", "periode", "stok_akhir", "status_data", "sumber_file",
  ],
  forecast_run: [
    "id", "produk_id", "target", "model_used", "data_cutoff", "mae", "rmse",
    "wape", "test_points", "candidate_models", "status",
  ],
  forecast_result: [
    "id", "forecast_run_id", "forecast_period", "forecast_value", "lower_bound",
    "upper_bound", "actual_value", "evaluated_at",
  ],
};

function createCheck(id, status, message, details = null, critical = false) {
  return { id, status, message, details, critical };
}

function summarizeChecks(checks) {
  const counts = checks.reduce(
    (summary, check) => {
      summary[check.status.toLowerCase()] += 1;
      if (check.status === "FAIL" && check.critical) summary.critical_failures += 1;
      return summary;
    },
    { pass: 0, warning: 0, fail: 0, critical_failures: 0 },
  );

  return {
    ...counts,
    ok: counts.critical_failures === 0,
  };
}

async function relationExists(db, relationName) {
  const result = await db.query("SELECT TO_REGCLASS($1) AS relation", [`public.${relationName}`]);
  return Boolean(result.rows[0]?.relation);
}

async function getExistingColumns(db, tableName) {
  const result = await db.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1
      ORDER BY ordinal_position
    `,
    [tableName],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function countQuery(db, sql, params = []) {
  const result = await db.query(sql, params);
  return Number(result.rows[0]?.total || 0);
}

async function runDatabaseHealthChecks(db, options = {}) {
  const checks = [];
  const migrationsDir = options.migrationsDir || path.join(backendRoot, "migrations");
  let existingTables = new Set();

  try {
    const result = await db.query(`
      SELECT
        CURRENT_DATABASE() AS database_name,
        CURRENT_USER AS database_user,
        CURRENT_SETTING('server_version') AS server_version
    `);
    checks.push(createCheck(
      "database_connection",
      "PASS",
      "Koneksi PostgreSQL berhasil",
      result.rows[0],
      true,
    ));
  } catch (error) {
    checks.push(createCheck(
      "database_connection",
      "FAIL",
      "Koneksi PostgreSQL gagal",
      { error: error.message },
      true,
    ));
    return { checks, summary: summarizeChecks(checks) };
  }

  try {
    const tableResult = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
    `);
    existingTables = new Set(tableResult.rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((table) => !existingTables.has(table));
    checks.push(createCheck(
      "required_tables",
      missing.length === 0 ? "PASS" : "FAIL",
      missing.length === 0
        ? "Seluruh tabel wajib tersedia"
        : `Tabel wajib belum tersedia: ${missing.join(", ")}`,
      { missing, existing_count: existingTables.size },
      true,
    ));
  } catch (error) {
    checks.push(createCheck("required_tables", "FAIL", "Pemeriksaan tabel gagal", {
      error: error.message,
    }, true));
  }

  if (existingTables.has("schema_migrations")) {
    try {
      const expected = listUpMigrations(migrationsDir);
      const appliedResult = await db.query(`
        SELECT migration_name, checksum
        FROM schema_migrations
        ORDER BY migration_name
      `);
      const applied = new Map(
        appliedResult.rows.map((row) => [row.migration_name, row.checksum]),
      );
      const pending = expected.filter((migration) => !applied.has(migration.name));
      const changed = expected.filter(
        (migration) => applied.has(migration.name)
          && applied.get(migration.name) !== migration.checksum,
      );
      const status = changed.length > 0 ? "FAIL" : pending.length > 0 ? "WARNING" : "PASS";
      checks.push(createCheck(
        "migration_status",
        status,
        changed.length > 0
          ? "Checksum migration yang sudah diterapkan berubah"
          : pending.length > 0
            ? `${pending.length} migration belum diterapkan`
            : "Seluruh migration sudah diterapkan dan checksumnya sesuai",
        {
          pending: pending.map((item) => item.name),
          changed: changed.map((item) => item.name),
        },
        changed.length > 0,
      ));
    } catch (error) {
      checks.push(createCheck("migration_status", "FAIL", "Pemeriksaan migration gagal", {
        error: error.message,
      }, true));
    }
  }

  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    if (!existingTables.has(tableName)) continue;
    try {
      const existingColumns = await getExistingColumns(db, tableName);
      const missing = requiredColumns.filter((column) => !existingColumns.has(column));
      checks.push(createCheck(
        `columns_${tableName}`,
        missing.length === 0 ? "PASS" : "FAIL",
        missing.length === 0
          ? `Kolom wajib tabel ${tableName} tersedia`
          : `Kolom tabel ${tableName} belum lengkap`,
        { missing },
        true,
      ));
    } catch (error) {
      checks.push(createCheck(`columns_${tableName}`, "FAIL", `Pemeriksaan ${tableName} gagal`, {
        error: error.message,
      }, true));
    }
  }

  if (existingTables.has("produk") && existingTables.has("kategori")) {
    const orphanProducts = await countQuery(db, `
      SELECT COUNT(*) AS total
      FROM produk p
      LEFT JOIN kategori k ON k.id=p.kategori_id
      WHERE k.id IS NULL
    `);
    checks.push(createCheck(
      "orphan_products",
      orphanProducts === 0 ? "PASS" : "FAIL",
      orphanProducts === 0 ? "Tidak ada produk tanpa kategori" : "Ditemukan produk tanpa kategori",
      { total: orphanProducts },
      true,
    ));
  }

  const orphanDefinitions = [
    ["orphan_transactions", "transaksi", "produk", "produk_id"],
    ["orphan_aliases", "product_alias", "produk", "produk_id"],
    ["orphan_snapshots", "inventory_snapshot_monthly", "produk", "produk_id"],
    ["orphan_forecast_runs", "forecast_run", "produk", "produk_id"],
    ["orphan_forecast_results", "forecast_result", "forecast_run", "forecast_run_id"],
    ["orphan_forecast_backtests", "forecast_backtest", "forecast_run", "forecast_run_id"],
  ];

  for (const [id, child, parent, foreignKey] of orphanDefinitions) {
    if (!existingTables.has(child) || !existingTables.has(parent)) continue;
    const total = await countQuery(db, `
      SELECT COUNT(*) AS total
      FROM ${child} child
      LEFT JOIN ${parent} parent ON parent.id=child.${foreignKey}
      WHERE parent.id IS NULL
    `);
    checks.push(createCheck(
      id,
      total === 0 ? "PASS" : "FAIL",
      total === 0 ? `Tidak ada orphan pada ${child}` : `Ditemukan orphan pada ${child}`,
      { total },
      true,
    ));
  }

  if (existingTables.has("produk")) {
    const invalidProducts = await countQuery(db, `
      SELECT COUNT(*) AS total
      FROM produk
      WHERE harga < 0 OR stok < 0 OR stok_minimum < 0
         OR BTRIM(nama_produk)=''
    `);
    checks.push(createCheck(
      "invalid_product_values",
      invalidProducts === 0 ? "PASS" : "FAIL",
      invalidProducts === 0 ? "Nilai produk valid" : "Ditemukan nilai produk tidak valid",
      { total: invalidProducts },
      true,
    ));
  }

  if (existingTables.has("transaksi")) {
    const invalidTransactions = await countQuery(db, `
      SELECT COUNT(*) AS total
      FROM transaksi
      WHERE jumlah <= 0 OR harga < 0 OR total < 0
         OR jenis_transaksi NOT IN ('masuk', 'keluar')
    `);
    checks.push(createCheck(
      "invalid_transaction_values",
      invalidTransactions === 0 ? "PASS" : "FAIL",
      invalidTransactions === 0 ? "Nilai transaksi valid" : "Ditemukan transaksi tidak valid",
      { total: invalidTransactions },
      true,
    ));
  }

  if (existingTables.has("inventory_snapshot_monthly")) {
    const invalidSnapshots = await countQuery(db, `
      SELECT COUNT(*) AS total
      FROM inventory_snapshot_monthly
      WHERE
        (status_data IN ('observed', 'corrected') AND (stok_akhir IS NULL OR stok_akhir < 0))
        OR
        (status_data IN ('missing', 'not_listed', 'not_active') AND stok_akhir IS NOT NULL)
    `);
    checks.push(createCheck(
      "invalid_snapshot_values",
      invalidSnapshots === 0 ? "PASS" : "FAIL",
      invalidSnapshots === 0 ? "Status dan nilai snapshot konsisten" : "Snapshot tidak konsisten",
      { total: invalidSnapshots },
      true,
    ));

    const rangeResult = await db.query(`
      SELECT MIN(periode)::TEXT AS min_period,
             MAX(periode)::TEXT AS max_period,
             COUNT(*)::INTEGER AS total
      FROM inventory_snapshot_monthly
    `);
    const history = rangeResult.rows[0];
    checks.push(createCheck(
      "inventory_history_range",
      Number(history.total) > 0 ? "PASS" : "WARNING",
      Number(history.total) > 0 ? "Rentang histori persediaan tersedia" : "Histori persediaan masih kosong",
      history,
      false,
    ));

    const qualityResult = await db.query(`
      WITH product_quality AS (
        SELECT
          p.id,
          COUNT(s.id) FILTER (
            WHERE s.status_data IN ('observed', 'corrected') AND s.stok_akhir IS NOT NULL
          )::INTEGER AS valid_observations
        FROM produk p
        LEFT JOIN inventory_snapshot_monthly s ON s.produk_id=p.id
        WHERE p.deleted_at IS NULL
        GROUP BY p.id
      )
      SELECT
        COUNT(*) FILTER (WHERE valid_observations >= 18)::INTEGER AS eligible,
        COUNT(*) FILTER (WHERE valid_observations BETWEEN 1 AND 17)::INTEGER AS warning,
        COUNT(*) FILTER (WHERE valid_observations = 0)::INTEGER AS not_eligible
      FROM product_quality
    `);
    checks.push(createCheck(
      "inventory_quality_overview",
      "PASS",
      "Ringkasan kelayakan histori berhasil dihitung",
      qualityResult.rows[0],
      false,
    ));
  }

  if (existingTables.has("pengguna")) {
    const adminResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE role='admin' AND is_active=TRUE)::INTEGER AS active_admins,
        COUNT(*) FILTER (
          WHERE password_hash !~ '^\\$2[aby]\\$[0-9]{2}\\$'
        )::INTEGER AS suspicious_password_hashes
      FROM pengguna
    `);
    const admin = adminResult.rows[0];
    checks.push(createCheck(
      "active_administrator",
      Number(admin.active_admins) > 0 ? "PASS" : "FAIL",
      Number(admin.active_admins) > 0
        ? "Administrator aktif tersedia"
        : "Administrator aktif belum tersedia",
      { total: Number(admin.active_admins) },
      true,
    ));
    checks.push(createCheck(
      "password_hash_format",
      Number(admin.suspicious_password_hashes) === 0 ? "PASS" : "FAIL",
      Number(admin.suspicious_password_hashes) === 0
        ? "Format password hash pengguna sesuai bcrypt"
        : "Ditemukan password yang tidak menggunakan format bcrypt",
      { total: Number(admin.suspicious_password_hashes) },
      true,
    ));
  }

  try {
    const foreignKeyResult = await db.query(`
      SELECT COUNT(*)::INTEGER AS total
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid=c.connamespace
      WHERE n.nspname='public' AND c.contype='f'
    `);
    const total = Number(foreignKeyResult.rows[0].total);
    checks.push(createCheck(
      "foreign_keys",
      total >= 8 ? "PASS" : "WARNING",
      `${total} foreign key terdeteksi`,
      { total, expected_minimum: 8 },
      false,
    ));
  } catch (error) {
    checks.push(createCheck("foreign_keys", "WARNING", "Foreign key tidak dapat diperiksa", {
      error: error.message,
    }));
  }

  return {
    checks,
    summary: summarizeChecks(checks),
  };
}

module.exports = {
  REQUIRED_COLUMNS,
  REQUIRED_TABLES,
  createCheck,
  relationExists,
  runDatabaseHealthChecks,
  summarizeChecks,
};
