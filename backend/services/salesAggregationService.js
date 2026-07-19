const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agst", "Sept", "Okt", "Nov", "Des"];

function getWeekNumber(day) {
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

function getPeriodLabel(tahun, bulan, mingguKe) {
  const shortYear = tahun % 100;
  const monthName = MONTHS[bulan - 1];
  return `${monthName} ${shortYear}-W${mingguKe}`;
}

function toDate(value) {
  if (value instanceof Date) return value;
  return new Date(value);
}

function toMonthPeriod(tahun, bulan) {
  return `${tahun}-${String(bulan).padStart(2, "0")}-01`;
}

function aggregateWeeklySalesRows(transactions = []) {
  const aggregated = new Map();

  for (const row of transactions) {
    const tanggal = toDate(row.tanggal);
    const jumlah = Number(row.jumlah);

    if (!row.produk_id || Number.isNaN(tanggal.getTime()) || !Number.isFinite(jumlah)) {
      continue;
    }

    const tahun = tanggal.getFullYear();
    const bulan = tanggal.getMonth() + 1;
    const mingguKe = getWeekNumber(tanggal.getDate());
    const periodLabel = getPeriodLabel(tahun, bulan, mingguKe);
    const key = `${row.produk_id}-${periodLabel}`;

    const current = aggregated.get(key) || {
      produk_id: row.produk_id,
      tahun,
      bulan,
      minggu_ke: mingguKe,
      period_label: periodLabel,
      total_penjualan: 0,
    };

    current.total_penjualan += jumlah;
    aggregated.set(key, current);
  }

  return Array.from(aggregated.values())
    .sort((a, b) => {
      return a.produk_id - b.produk_id
        || a.tahun - b.tahun
        || a.bulan - b.bulan
        || a.minggu_ke - b.minggu_ke;
    });
}

function aggregateMonthlySalesRows(transactions = []) {
  const aggregated = new Map();

  for (const row of transactions) {
    const tanggal = toDate(row.tanggal);
    const jumlah = Number(row.jumlah);

    if (!row.produk_id || Number.isNaN(tanggal.getTime()) || !Number.isFinite(jumlah)) {
      continue;
    }

    const tahun = tanggal.getFullYear();
    const bulan = tanggal.getMonth() + 1;
    const periode = toMonthPeriod(tahun, bulan);
    const key = `${row.produk_id}-${periode}`;

    const current = aggregated.get(key) || {
      produk_id: row.produk_id,
      periode,
      total_penjualan: 0,
    };

    current.total_penjualan += jumlah;
    aggregated.set(key, current);
  }

  return Array.from(aggregated.values())
    .sort((a, b) => {
      return a.produk_id - b.produk_id || a.periode.localeCompare(b.periode);
    });
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch (rollbackError) {
    console.error("Rollback agregasi penjualan gagal:", rollbackError);
  }
}

async function insertWeeklyRows(client, rows) {
  const insertQuery = `
    INSERT INTO dataset_mingguan
      (produk_id, tahun, bulan, minggu_ke, period_label, total_penjualan)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (produk_id, period_label)
    DO UPDATE SET total_penjualan = EXCLUDED.total_penjualan
  `;

  for (const row of rows) {
    await client.query(insertQuery, [
      row.produk_id,
      row.tahun,
      row.bulan,
      row.minggu_ke,
      row.period_label,
      row.total_penjualan,
    ]);
  }
}

async function insertMonthlyRows(client, rows) {
  const insertQuery = `
    INSERT INTO penjualan_bulanan
      (produk_id, periode, total_penjualan)
    VALUES ($1, $2, $3)
    ON CONFLICT (produk_id, periode)
    DO UPDATE SET total_penjualan = EXCLUDED.total_penjualan
  `;

  for (const row of rows) {
    await client.query(insertQuery, [
      row.produk_id,
      row.periode,
      row.total_penjualan,
    ]);
  }
}

async function runSalesAggregation(db) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const transactionResult = await client.query(
      `
        SELECT produk_id, tanggal, jumlah
        FROM transaksi
        WHERE jenis_transaksi = 'keluar'
        ORDER BY produk_id, tanggal, id
      `,
    );

    const weeklyRows = aggregateWeeklySalesRows(transactionResult.rows);
    const monthlyRows = aggregateMonthlySalesRows(transactionResult.rows);

    await client.query("DELETE FROM dataset_mingguan");
    await client.query("DELETE FROM penjualan_bulanan");
    await insertWeeklyRows(client, weeklyRows);
    await insertMonthlyRows(client, monthlyRows);

    await client.query("COMMIT");

    return {
      message: "Agregasi penjualan selesai",
      source_transactions: transactionResult.rows.length,
      weekly_records: weeklyRows.length,
      monthly_records: monthlyRows.length,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  aggregateMonthlySalesRows,
  aggregateWeeklySalesRows,
  getPeriodLabel,
  getWeekNumber,
  runSalesAggregation,
};
