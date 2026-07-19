const fs = require("fs");
const path = require("path");

const VALID_SNAPSHOT_STATUSES = new Set(["observed", "corrected"]);

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function formatPeriod(value) {
  if (!value) return null;

  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function compareSnapshotDescending(left, right) {
  const leftPeriod = formatPeriod(left.periode) || "";
  const rightPeriod = formatPeriod(right.periode) || "";
  if (leftPeriod !== rightPeriod) return rightPeriod.localeCompare(leftPeriod);

  const leftUpdatedAt = left.updated_at ? new Date(left.updated_at).getTime() : 0;
  const rightUpdatedAt = right.updated_at ? new Date(right.updated_at).getTime() : 0;
  if (leftUpdatedAt !== rightUpdatedAt) return rightUpdatedAt - leftUpdatedAt;

  return Number(right.id || 0) - Number(left.id || 0);
}

function selectLatestValidSnapshots(snapshotRows = []) {
  const latestByProduct = new Map();

  for (const snapshot of [...snapshotRows].sort(compareSnapshotDescending)) {
    const status = String(snapshot.status_data || "").toLowerCase();
    const stock = toNumber(snapshot.stok_akhir);

    if (!VALID_SNAPSHOT_STATUSES.has(status) || stock === null) continue;

    const productId = Number(snapshot.produk_id);
    if (!Number.isFinite(productId) || latestByProduct.has(productId)) continue;

    latestByProduct.set(productId, {
      ...snapshot,
      produk_id: productId,
      stok_akhir: stock,
      periode: formatPeriod(snapshot.periode),
      status_data: status,
    });
  }

  return latestByProduct;
}

function buildCurrentStockSyncReport(productRows = [], snapshotRows = [], options = {}) {
  const latestByProduct = selectLatestValidSnapshots(snapshotRows);
  const rows = [];
  const skippedProducts = [];

  for (const product of productRows) {
    const productId = Number(product.id);
    const latestSnapshot = latestByProduct.get(productId);

    if (!latestSnapshot) {
      skippedProducts.push({
        produk_id: productId,
        nama_produk: product.nama_produk,
        reason: "no_valid_snapshot",
      });
      continue;
    }

    const oldStock = toNumber(product.stok) ?? 0;
    const snapshotStock = toNumber(latestSnapshot.stok_akhir) ?? 0;

    rows.push({
      produk_id: productId,
      nama_produk: product.nama_produk,
      stok_lama: oldStock,
      stok_snapshot_terbaru: snapshotStock,
      periode_snapshot: latestSnapshot.periode,
      selisih: snapshotStock - oldStock,
    });
  }

  const totalDifference = rows.reduce((sum, row) => sum + row.selisih, 0);

  return {
    mode: options.commit ? "commit" : "dry-run",
    saved: Boolean(options.commit),
    updated_count: options.commit ? rows.length : 0,
    skipped_count: skippedProducts.length,
    summary: {
      product_count: productRows.length,
      valid_snapshot_product_count: rows.length,
      skipped_without_snapshot: skippedProducts.length,
      total_difference: totalDifference,
    },
    rows,
    skipped_products: skippedProducts,
  };
}

async function fetchProducts(client) {
  const result = await client.query(`
    SELECT id, nama_produk, stok
    FROM produk
    ORDER BY id ASC
  `);

  return result.rows;
}

async function fetchValidSnapshots(client) {
  const result = await client.query(`
    SELECT id, produk_id, periode, stok_akhir, status_data, updated_at
    FROM inventory_snapshot_monthly
    WHERE status_data IN ('observed', 'corrected')
      AND stok_akhir IS NOT NULL
    ORDER BY produk_id ASC, periode DESC, updated_at DESC, id DESC
  `);

  return result.rows;
}

async function updateProductStock(client, row) {
  const result = await client.query(
    `
      UPDATE produk
      SET stok = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING id
    `,
    [row.stok_snapshot_terbaru, row.produk_id],
  );

  if (result.rowCount !== 1) {
    throw new Error(`Produk tidak ditemukan saat update stok: ${row.produk_id}`);
  }
}

async function syncCurrentStockFromSnapshots(db, options = {}) {
  if (!db || typeof db.connect !== "function") {
    throw new Error("Koneksi database wajib menyediakan method connect()");
  }

  const commit = Boolean(options.commit);
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const [productRows, snapshotRows] = await Promise.all([
      fetchProducts(client),
      fetchValidSnapshots(client),
    ]);
    const report = buildCurrentStockSyncReport(productRows, snapshotRows, { commit });

    if (commit) {
      for (const row of report.rows) {
        await updateProductStock(client, row);
      }
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }

    return report;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
}

function writeSyncReport(report, outputPath) {
  if (!outputPath) return null;

  const resolvedPath = path.resolve(outputPath);
  fs.writeFileSync(resolvedPath, JSON.stringify(report, null, 2));
  return resolvedPath;
}

module.exports = {
  buildCurrentStockSyncReport,
  formatPeriod,
  selectLatestValidSnapshots,
  syncCurrentStockFromSnapshots,
  writeSyncReport,
};
