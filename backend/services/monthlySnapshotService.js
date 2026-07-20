const SYSTEM_SNAPSHOT_SOURCE = "system:monthly-stock-snapshot";

class MonthlySnapshotError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function formatMonthStart(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return null;

  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  return `${match[1]}-${match[2]}-01`;
}

function previousMonthStart(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = new Date(Date.UTC(year, month - 1, 1));
  return formatMonthStart(date);
}

function currentMonthStart(now = new Date()) {
  return formatMonthStart(new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    1,
  )));
}

function resolveSnapshotPeriod(periodInput, now = new Date()) {
  const period = periodInput
    ? formatMonthStart(periodInput)
    : previousMonthStart(now);

  if (!period) {
    throw new MonthlySnapshotError(
      400,
      "Periode snapshot harus berformat YYYY-MM atau YYYY-MM-DD",
    );
  }

  if (period > currentMonthStart(now)) {
    throw new MonthlySnapshotError(400, "Periode snapshot tidak boleh di masa depan");
  }

  return period;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildSnapshotPlan(products = [], existingRows = [], options = {}) {
  const force = options.force === true;
  const existingByProduct = new Map(
    existingRows.map((row) => [Number(row.produk_id), row]),
  );

  return products.map((product) => {
    const produkId = Number(product.id || product.produk_id);
    const stok = toNumber(product.stok);
    const harga = toNumber(product.harga);
    const existing = existingByProduct.get(produkId) || null;
    let action = "insert";
    let reason = null;

    if (existing) {
      if (existing.status_data === "corrected" && !force) {
        action = "skip";
        reason = "Snapshot terkoreksi tidak boleh ditimpa tanpa --force";
      } else if (existing.sumber_file !== SYSTEM_SNAPSHOT_SOURCE && !force) {
        action = "skip";
        reason = "Snapshot dari sumber lain tidak boleh ditimpa tanpa --force";
      } else {
        action = "update";
      }
    }

    return {
      produk_id: produkId,
      nama_produk: product.nama_produk,
      stok_akhir: stok,
      harga_rata_rata: harga,
      nilai_aset: stok * harga,
      existing_status: existing?.status_data || null,
      existing_source: existing?.sumber_file || null,
      action,
      reason,
    };
  });
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch (error) {
    console.error("Rollback snapshot bulanan gagal:", error.message);
  }
}

async function createMonthlySnapshots(db, options = {}) {
  const period = resolveSnapshotPeriod(options.period, options.now || new Date());
  const dryRun = options.commit !== true;
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const productResult = await client.query(
      `
        SELECT id, nama_produk, stok, harga, is_active, active_from, active_until
        FROM produk
        WHERE (active_from IS NULL OR active_from <= $1)
          AND (active_until IS NULL OR active_until >= $1)
        ORDER BY id
        FOR UPDATE
      `,
      [period],
    );

    const existingResult = await client.query(
      `
        SELECT produk_id, status_data, sumber_file, stok_akhir
        FROM inventory_snapshot_monthly
        WHERE periode=$1
        ORDER BY produk_id
        FOR UPDATE
      `,
      [period],
    );

    const plan = buildSnapshotPlan(productResult.rows, existingResult.rows, options);

    if (!dryRun) {
      for (const row of plan) {
        if (row.action === "skip") continue;

        await client.query(
          `
            INSERT INTO inventory_snapshot_monthly (
              produk_id,
              periode,
              stok_akhir,
              harga_rata_rata,
              nilai_aset,
              nama_barang_sumber,
              sumber_file,
              status_data
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'observed')
            ON CONFLICT (produk_id, periode)
            DO UPDATE SET
              stok_akhir = EXCLUDED.stok_akhir,
              harga_rata_rata = EXCLUDED.harga_rata_rata,
              nilai_aset = EXCLUDED.nilai_aset,
              nama_barang_sumber = EXCLUDED.nama_barang_sumber,
              sumber_file = EXCLUDED.sumber_file,
              status_data = EXCLUDED.status_data
          `,
          [
            row.produk_id,
            period,
            row.stok_akhir,
            row.harga_rata_rata,
            row.nilai_aset,
            row.nama_produk,
            SYSTEM_SNAPSHOT_SOURCE,
          ],
        );
      }

      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }

    const counts = plan.reduce((result, row) => {
      result[row.action] += 1;
      return result;
    }, { insert: 0, update: 0, skip: 0 });

    return {
      mode: dryRun ? "dry-run" : "commit",
      period,
      source: SYSTEM_SNAPSHOT_SOURCE,
      product_count: productResult.rows.length,
      counts,
      rows: plan,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  MonthlySnapshotError,
  SYSTEM_SNAPSHOT_SOURCE,
  buildSnapshotPlan,
  createMonthlySnapshots,
  currentMonthStart,
  formatMonthStart,
  previousMonthStart,
  resolveSnapshotPeriod,
};
