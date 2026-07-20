const { createHttpError } = require("../utils/httpError");
const { getInventoryRiskSummary } = require("./inventoryForecastService");

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

function parsePeriod(value) {
  const period = String(value || new Date().toISOString().slice(0, 7)).trim();
  const match = period.match(PERIOD_PATTERN);
  if (!match) {
    throw createHttpError(400, "period harus berformat YYYY-MM", {
      code: "INVALID_DASHBOARD_PERIOD",
    });
  }
  return period;
}

function periodBounds(period) {
  const [year, month] = period.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const previousStart = new Date(Date.UTC(year, month - 2, 1));

  return {
    period,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    previous_start: previousStart.toISOString().slice(0, 10),
    previous_period: previousStart.toISOString().slice(0, 7),
  };
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trend(current, previous) {
  const currentValue = number(current);
  const previousValue = number(previous);
  if (previousValue === 0) return currentValue === 0 ? 0 : null;
  return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
}

async function getDashboardSummary(db, periodInput) {
  const bounds = periodBounds(parsePeriod(periodInput));

  const [catalogResult, flowResult, weeklyResult, recentResult, criticalResult, risks] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active=TRUE)::INTEGER AS active_products,
        COALESCE(SUM(stok) FILTER (WHERE is_active=TRUE), 0)::NUMERIC AS total_stock,
        COUNT(*) FILTER (
          WHERE is_active=TRUE AND stok <= stok_minimum
        )::INTEGER AS critical_products
      FROM produk
      WHERE deleted_at IS NULL
    `),
    db.query(
      `
        SELECT
          COALESCE(SUM(jumlah) FILTER (
            WHERE tanggal >= $1 AND tanggal < $2 AND jenis_transaksi='masuk'
          ), 0)::NUMERIC AS incoming_quantity,
          COALESCE(SUM(jumlah) FILTER (
            WHERE tanggal >= $1 AND tanggal < $2 AND jenis_transaksi='keluar'
          ), 0)::NUMERIC AS outgoing_quantity,
          COUNT(*) FILTER (WHERE tanggal >= $1 AND tanggal < $2)::INTEGER AS transaction_count,
          COALESCE(SUM(jumlah) FILTER (
            WHERE tanggal >= $3 AND tanggal < $1 AND jenis_transaksi='masuk'
          ), 0)::NUMERIC AS previous_incoming_quantity,
          COALESCE(SUM(jumlah) FILTER (
            WHERE tanggal >= $3 AND tanggal < $1 AND jenis_transaksi='keluar'
          ), 0)::NUMERIC AS previous_outgoing_quantity,
          COUNT(*) FILTER (WHERE tanggal >= $3 AND tanggal < $1)::INTEGER AS previous_transaction_count
        FROM transaksi
      `,
      [bounds.start, bounds.end, bounds.previous_start],
    ),
    db.query(
      `
        SELECT
          LEAST(4, ((EXTRACT(DAY FROM tanggal)::INTEGER - 1) / 7) + 1)::INTEGER AS week,
          COALESCE(SUM(jumlah) FILTER (WHERE jenis_transaksi='masuk'), 0)::NUMERIC AS incoming_quantity,
          COALESCE(SUM(jumlah) FILTER (WHERE jenis_transaksi='keluar'), 0)::NUMERIC AS outgoing_quantity
        FROM transaksi
        WHERE tanggal >= $1 AND tanggal < $2
        GROUP BY week
        ORDER BY week
      `,
      [bounds.start, bounds.end],
    ),
    db.query(
      `
        SELECT t.id, t.tanggal, t.jenis_transaksi, t.jumlah, t.harga, t.total,
               p.id AS produk_id, p.nama_produk
        FROM transaksi t
        JOIN produk p ON p.id=t.produk_id
        WHERE t.tanggal >= $1 AND t.tanggal < $2
          AND p.deleted_at IS NULL
        ORDER BY t.tanggal DESC, t.id DESC
        LIMIT 5
      `,
      [bounds.start, bounds.end],
    ),
    db.query(`
      SELECT id, nama_produk, stok, stok_minimum
      FROM produk
      WHERE deleted_at IS NULL
        AND is_active=TRUE
        AND stok <= stok_minimum
      ORDER BY (stok_minimum - stok) DESC, nama_produk ASC
      LIMIT 20
    `),
    getInventoryRiskSummary(db),
  ]);

  const catalog = catalogResult.rows[0];
  const flow = flowResult.rows[0];
  const weeklyByNumber = new Map(weeklyResult.rows.map((row) => [Number(row.week), row]));
  const weekly = [1, 2, 3, 4].map((week) => {
    const row = weeklyByNumber.get(week) || {};
    return {
      week,
      incoming_quantity: number(row.incoming_quantity),
      outgoing_quantity: number(row.outgoing_quantity),
    };
  });

  const activeProducts = number(catalog.active_products);
  const criticalProducts = number(catalog.critical_products);
  const incoming = number(flow.incoming_quantity);
  const outgoing = number(flow.outgoing_quantity);
  const highRisks = risks.filter((item) => item.risk === "high");
  const staleRisks = risks.filter((item) => item.freshness === "stale");
  const currentRisks = risks.filter((item) => item.freshness === "current");
  const cutoffs = risks.map((item) => item.data_cutoff).filter(Boolean).sort();

  return {
    period: bounds.period,
    previous_period: bounds.previous_period,
    generated_at: new Date().toISOString(),
    catalog: {
      active_products: activeProducts,
      total_stock: number(catalog.total_stock),
      critical_products: criticalProducts,
      critical_ratio: activeProducts > 0
        ? Number(((criticalProducts / activeProducts) * 100).toFixed(1))
        : 0,
    },
    flow: {
      incoming_quantity: incoming,
      outgoing_quantity: outgoing,
      transaction_count: number(flow.transaction_count),
      previous_incoming_quantity: number(flow.previous_incoming_quantity),
      previous_outgoing_quantity: number(flow.previous_outgoing_quantity),
      previous_transaction_count: number(flow.previous_transaction_count),
      incoming_trend_percent: trend(incoming, flow.previous_incoming_quantity),
      outgoing_trend_percent: trend(outgoing, flow.previous_outgoing_quantity),
      distribution_efficiency_percent: incoming > 0
        ? Number(((outgoing / incoming) * 100).toFixed(1))
        : 0,
    },
    weekly,
    recent_transactions: recentResult.rows.map((row) => ({
      ...row,
      jumlah: number(row.jumlah),
      harga: number(row.harga),
      total: number(row.total),
    })),
    critical_products: criticalResult.rows.map((row) => ({
      ...row,
      stok: number(row.stok),
      stok_minimum: number(row.stok_minimum),
    })),
    forecast_risk: {
      available_count: risks.length,
      high_count: highRisks.length,
      current_count: currentRisks.length,
      stale_count: staleRisks.length,
      oldest_data_cutoff: cutoffs[0] || null,
      newest_data_cutoff: cutoffs[cutoffs.length - 1] || null,
      items: highRisks.slice(0, 6),
    },
  };
}

module.exports = {
  getDashboardSummary,
  parsePeriod,
  periodBounds,
  trend,
};
