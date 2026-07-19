const { FORECAST_TARGETS } = require("./forecastTargets");

class SalesForecastReadinessError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function parseProdukId(value) {
  const produkId = Number(value);
  if (!produkId || Number.isNaN(produkId) || produkId <= 0) {
    throw new SalesForecastReadinessError(400, "produk_id harus angka valid");
  }

  return produkId;
}

function classifyMonthlySalesReadiness(observationCount) {
  const count = Number(observationCount) || 0;

  if (count < 6) {
    return {
      status: "insufficient_data",
      message: "Prediksi penjualan belum diaktifkan karena histori belum mencukupi.",
    };
  }

  if (count < 12) {
    return {
      status: "experimental",
      message: "Prediksi penjualan belum diaktifkan karena histori belum mencukupi.",
    };
  }

  if (count < 24) {
    return {
      status: "eligible_basic",
      message: "Histori penjualan cukup untuk evaluasi dasar, tetapi prediksi penjualan belum diaktifkan untuk pengguna.",
    };
  }

  return {
    status: "eligible_full",
    message: "Histori penjualan cukup untuk evaluasi penuh, tetapi prediksi penjualan belum diaktifkan untuk pengguna.",
  };
}

function buildMonthlySalesReadinessResponse(observationCount) {
  const readiness = classifyMonthlySalesReadiness(observationCount);

  return {
    target: FORECAST_TARGETS.MONTHLY_SALES,
    observation_count: Number(observationCount) || 0,
    status: readiness.status,
    message: readiness.message,
  };
}

async function getMonthlySalesForecastReadiness(db, produkIdInput) {
  const produkId = parseProdukId(produkIdInput);

  const productResult = await db.query(
    `
      SELECT id
      FROM produk
      WHERE id=$1
    `,
    [produkId],
  );

  if (productResult.rows.length === 0) {
    throw new SalesForecastReadinessError(404, "Produk tidak ditemukan");
  }

  const salesHistoryResult = await db.query(
    `
      SELECT COUNT(*)::int AS observation_count
      FROM penjualan_bulanan
      WHERE produk_id=$1
        AND total_penjualan IS NOT NULL
        AND total_penjualan >= 0
    `,
    [produkId],
  );

  return buildMonthlySalesReadinessResponse(
    salesHistoryResult.rows[0]?.observation_count || 0,
  );
}

module.exports = {
  SalesForecastReadinessError,
  buildMonthlySalesReadinessResponse,
  classifyMonthlySalesReadiness,
  getMonthlySalesForecastReadiness,
};
