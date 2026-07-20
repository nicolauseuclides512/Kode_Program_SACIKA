class CurrentStockSyncError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function formatPeriod(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildCurrentStockSyncPlan(products = [], snapshots = []) {
  const snapshotByProduct = new Map(
    snapshots.map((row) => [Number(row.produk_id), row]),
  );

  return products.map((product) => {
    const produkId = Number(product.id || product.produk_id);
    const oldStock = toNumber(product.stok);
    const snapshot = snapshotByProduct.get(produkId) || null;
    const snapshotStock = snapshot ? toNumber(snapshot.stok_akhir) : null;

    if (!snapshot || snapshotStock === null) {
      return {
        produk_id: produkId,
        nama_produk: product.nama_produk,
        stok_lama: oldStock,
        stok_snapshot: null,
        periode_snapshot: null,
        selisih: null,
        action: "skip",
        reason: "Tidak ada snapshot observed/corrected yang valid",
      };
    }

    return {
      produk_id: produkId,
      nama_produk: product.nama_produk,
      stok_lama: oldStock,
      stok_snapshot: snapshotStock,
      periode_snapshot: formatPeriod(snapshot.periode),
      status_snapshot: snapshot.status_data,
      selisih: snapshotStock - oldStock,
      action: snapshotStock === oldStock ? "unchanged" : "update",
      reason: snapshotStock === oldStock ? "Stok sudah sama" : null,
    };
  });
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch (error) {
    console.error("Rollback sinkronisasi stok gagal:", error.message);
  }
}

async function syncCurrentStockFromSnapshots(db, options = {}) {
  const dryRun = options.commit !== true;
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const productResult = await client.query(
      `
        SELECT id, nama_produk, stok
        FROM produk
        ORDER BY id
        FOR UPDATE
      `,
    );

    const snapshotResult = await client.query(
      `
        SELECT DISTINCT ON (produk_id)
          produk_id,
          periode,
          stok_akhir,
          status_data
        FROM inventory_snapshot_monthly
        WHERE status_data IN ('observed', 'corrected')
          AND stok_akhir IS NOT NULL
        ORDER BY produk_id, periode DESC, updated_at DESC, id DESC
      `,
    );

    const plan = buildCurrentStockSyncPlan(
      productResult.rows,
      snapshotResult.rows,
    );

    if (!dryRun) {
      for (const row of plan) {
        if (row.action !== "update") continue;

        const result = await client.query(
          `
            UPDATE produk
            SET stok=$1
            WHERE id=$2
            RETURNING id
          `,
          [row.stok_snapshot, row.produk_id],
        );

        if (result.rows.length === 0) {
          throw new CurrentStockSyncError(
            404,
            `Produk ${row.produk_id} tidak ditemukan saat sinkronisasi`,
          );
        }
      }

      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }

    const counts = plan.reduce((result, row) => {
      result[row.action] += 1;
      return result;
    }, { update: 0, unchanged: 0, skip: 0 });

    return {
      mode: dryRun ? "dry-run" : "commit",
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
  CurrentStockSyncError,
  buildCurrentStockSyncPlan,
  syncCurrentStockFromSnapshots,
};
