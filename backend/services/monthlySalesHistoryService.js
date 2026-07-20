const { createMonthRange } = require("./inventoryHistoryQualityService");
const { FORECAST_TARGETS } = require("./forecastTargets");

class MonthlySalesHistoryError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function parseProdukId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new MonthlySalesHistoryError(400, "produk_id harus integer positif");
  }
  return id;
}

function formatDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = String(value).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

function formatMonth(value) {
  const date = formatDate(value);
  return date ? date.slice(0, 7) : null;
}

function previousCompleteMonth(referenceDate = new Date()) {
  const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  if (Number.isNaN(date.getTime())) {
    throw new MonthlySalesHistoryError(400, "referenceDate tidak valid");
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10);
}

function monthAfter(period) {
  const normalized = formatDate(period);
  const [year, month] = normalized.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function minPeriod(first, second) {
  if (!first) return second;
  if (!second) return first;
  return first < second ? first : second;
}

function buildMonthlySalesSeries(rows = [], startPeriod, endPeriod) {
  const start = formatDate(startPeriod);
  const end = formatDate(endPeriod);
  if (!start || !end || start > end) {
    return { periods: [], values: [], observed_periods: [], zero_filled_periods: [] };
  }

  const valuesByPeriod = new Map(
    rows.map((row) => [formatDate(row.periode), Number(row.total_penjualan || 0)]),
  );
  const periods = createMonthRange(start, end);
  const observedPeriods = [];
  const zeroFilledPeriods = [];
  const values = periods.map((period) => {
    if (valuesByPeriod.has(period)) {
      observedPeriods.push(formatMonth(period));
      return Number(valuesByPeriod.get(period));
    }
    zeroFilledPeriods.push(formatMonth(period));
    return 0;
  });

  return {
    periods: periods.map(formatMonth),
    values,
    observed_periods: observedPeriods,
    zero_filled_periods: zeroFilledPeriods,
  };
}

async function getMonthlySalesHistory(db, produkIdInput, options = {}) {
  const produkId = parseProdukId(produkIdInput);
  const productResult = await db.query(
    `
      SELECT id, nama_produk, is_active, active_from, active_until
      FROM produk
      WHERE id=$1 AND deleted_at IS NULL
    `,
    [produkId],
  );

  if (productResult.rows.length === 0) {
    throw new MonthlySalesHistoryError(404, "Produk tidak ditemukan");
  }

  const activityResult = await db.query(
    `
      SELECT
        MIN(tanggal) FILTER (WHERE jenis_transaksi='keluar') AS first_outgoing_date,
        MAX(tanggal) AS latest_activity_date
      FROM transaksi
      WHERE produk_id=$1
    `,
    [produkId],
  );
  const activity = activityResult.rows[0] || {};

  if (!activity.first_outgoing_date) {
    return {
      produk: productResult.rows[0],
      target: FORECAST_TARGETS.MONTHLY_SALES,
      frequency: "monthly",
      source: "actual_outgoing_transactions",
      status: "history_not_found",
      periods: [],
      values: [],
      observation_count: 0,
      zero_month_count: 0,
      complete_through: null,
      note: "Belum ada transaksi keluar aktual untuk produk ini.",
    };
  }

  const firstPeriod = formatDate(activity.first_outgoing_date);
  const latestActivityPeriod = formatDate(activity.latest_activity_date);
  const completeCalendarPeriod = options.includeCurrentMonth
    ? formatDate(options.referenceDate || new Date())
    : previousCompleteMonth(options.referenceDate || new Date());
  const requestedEnd = options.endPeriod ? formatDate(options.endPeriod) : null;
  const endPeriod = minPeriod(requestedEnd || completeCalendarPeriod, latestActivityPeriod);

  if (!endPeriod || firstPeriod > endPeriod) {
    return {
      produk: productResult.rows[0],
      target: FORECAST_TARGETS.MONTHLY_SALES,
      frequency: "monthly",
      source: "actual_outgoing_transactions",
      status: "complete_period_not_available",
      periods: [],
      values: [],
      observation_count: 0,
      zero_month_count: 0,
      complete_through: null,
      note: "Belum tersedia bulan transaksi yang dianggap lengkap.",
    };
  }

  const salesResult = await db.query(
    `
      SELECT
        DATE_TRUNC('month', tanggal)::date AS periode,
        COALESCE(SUM(jumlah), 0)::numeric AS total_penjualan
      FROM transaksi
      WHERE produk_id=$1
        AND jenis_transaksi='keluar'
        AND tanggal >= $2
        AND tanggal < $3
      GROUP BY DATE_TRUNC('month', tanggal)::date
      ORDER BY periode ASC
    `,
    [produkId, firstPeriod, monthAfter(endPeriod)],
  );

  const series = buildMonthlySalesSeries(salesResult.rows, firstPeriod, endPeriod);
  return {
    produk: productResult.rows[0],
    target: FORECAST_TARGETS.MONTHLY_SALES,
    frequency: "monthly",
    source: "actual_outgoing_transactions",
    status: "ready",
    periods: series.periods,
    values: series.values,
    observation_count: series.values.length,
    observed_sales_month_count: series.observed_periods.length,
    zero_month_count: series.zero_filled_periods.length,
    zero_filled_periods: series.zero_filled_periods,
    period_start: series.periods[0] || null,
    period_end: series.periods[series.periods.length - 1] || null,
    complete_through: series.periods[series.periods.length - 1] || null,
    current_month_excluded: !options.includeCurrentMonth,
    note: "Bulan tanpa transaksi keluar di antara awal dan akhir histori diperlakukan sebagai nilai 0.",
  };
}

module.exports = {
  MonthlySalesHistoryError,
  buildMonthlySalesSeries,
  getMonthlySalesHistory,
  parseProdukId,
  previousCompleteMonth,
};
