const db = require("../config/database");

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agst', 'Sept', 'Okt', 'Nov', 'Des'];

// Fungsi untuk menentukan tanggal harian masuk ke minggu ke berapa dalam sebulan
function getWeekNumber(day) {
  if (day <= 7) return 1;    // Tanggal 1 - 7: Minggu 1
  if (day <= 14) return 2;   // Tanggal 8 - 14: Minggu 2
  if (day <= 21) return 3;   // Tanggal 15 - 21: Minggu 3
  return 4;                  // Tanggal 22 - 31: Minggu 4 (lebih dari tanggal 21)
}

// Fungsi untuk membuat label periode, contoh: tahun 2024, bulan 1, minggu 1 -> "Jan 24-W1"
function getPeriodLabel(tahun, bulan, minggu_ke) {
  const shortYear = tahun % 100;
  const monthName = MONTHS[bulan - 1]; 
  return `${monthName} ${shortYear}-W${minggu_ke}`;
}

// Fungsi utama untuk mengumpulkan (agregasi) transaksi harian menjadi data mingguan
exports.aggregate = async (req, res) => {
  try {
    console.log("[INFO] Starting incremental aggregation...");

    // 1. Cari tahu periode transaksi terakhir yang sudah pernah diproses di database
    const lastPeriodQuery = `
      SELECT MAX(tahun) as max_tahun, MAX(bulan) as max_bulan, MAX(minggu_ke) as max_minggu
      FROM dataset_mingguan
    `;

    db.query(lastPeriodQuery, async (err, lastPeriodResult) => {
      if (err) {
        console.error("[ERROR] Get last period:", err);
        return res.status(500).json({ message: "DB Error", error: err });
      }

      const lastPeriod = lastPeriodResult.rows[0];
      let filterDate = null;

      // Jika sudah ada data sebelumnya, kita hanya memproses data transaksi baru setelah tanggal tersebut
      if (lastPeriod.max_tahun) {
        const lastYear = lastPeriod.max_tahun;
        const lastMonth = lastPeriod.max_bulan;
        const lastWeek = lastPeriod.max_minggu;

        if (lastWeek === 4) {
          filterDate = new Date(lastYear, lastMonth, 1);
        } else {
          filterDate = new Date(lastYear, lastMonth - 1, (lastWeek * 7) + 1);
        }

        console.log(`[INFO] Last period: ${lastYear}-${lastMonth}-W${lastWeek}`);
        console.log(`[INFO] Filtering transactions from: ${filterDate.toISOString()}`);
      } else {
        console.log("[INFO] No existing data, aggregating all transactions");
      }

      // 2. Tarik semua transaksi keluar (penjualan) baru dari tabel transaksi
      let query = `
        SELECT produk_id, tanggal, jumlah
        FROM transaksi
        WHERE jenis_transaksi = 'keluar'
      `;

      const params = [];
      if (filterDate) {
        query += ` AND tanggal >= $1`;
        params.push(filterDate);
      }

      query += ` ORDER BY produk_id, tanggal`;

      db.query(query, params, async (err, result) => {
        if (err) {
          console.error("[ERROR] Fetch transactions:", err);
          return res.status(500).json({ message: "DB Error", error: err });
        }

        const transaksi = result.rows;
        console.log(`[INFO] Found ${transaksi.length} transactions to aggregate`);

        if (transaksi.length === 0) {
          console.log("[INFO] No new transactions to aggregate");
          return res.json({
            message: "No new transactions to aggregate",
            total_records: 0,
            inserted: 0
          });
        }

        // 3. Kelompokkan & jumlahkan penjualan harian menjadi total mingguan per produk
        const aggregated = {};

        for (const row of transaksi) {
          const { produk_id, tanggal, jumlah } = row;
          const tahun = tanggal.getFullYear();
          const bulan = tanggal.getMonth() + 1;
          const day = tanggal.getDate();

          const minggu_ke = getWeekNumber(day); // Konversi tanggal ke minggu 1, 2, 3, atau 4
          const period_label = getPeriodLabel(tahun, bulan, minggu_ke);

          const key = `${produk_id}-${tahun}-${bulan}-${minggu_ke}-${period_label}`;
          if (!aggregated[key]) {
            aggregated[key] = {
              produk_id,
              tahun,
              bulan,
              minggu_ke,
              period_label,
              total: 0
            };
          }
          aggregated[key].total += jumlah; // Tambahkan jumlah kuantitas penjualan
        }

        console.log(`[INFO] Aggregated to ${Object.keys(aggregated).length} weekly records`);

        
        console.log("[INFO] Inserting aggregated data...");
        const values = Object.values(aggregated);
        let inserted = 0;
        let updated = 0;

        const insertQuery = `
          INSERT INTO dataset_mingguan 
          (produk_id, tahun, bulan, minggu_ke, period_label, total_penjualan)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (produk_id, period_label) 
          DO UPDATE SET total_penjualan = dataset_mingguan.total_penjualan + EXCLUDED.total_penjualan
        `;

        let completed = 0;
        const total = values.length;

        for (const record of values) {
          db.query(insertQuery, [
            record.produk_id,
            record.tahun,
            record.bulan,
            record.minggu_ke,
            record.period_label,
            record.total
          ], (err, result) => {
            if (err) {
              console.error("[ERROR] Insert record:", err);
              return;
            }

            if (result.command === 'INSERT') {
              inserted++;
            } else if (result.command === 'UPDATE') {
              updated++;
            }

            completed++;

            if (completed === total) {
              db.query("SELECT COUNT(*) as count FROM dataset_mingguan", (err, result) => {
                if (err) {
                  console.error("[ERROR] Verify:", err);
                  return res.status(500).json({ message: "DB Error", error: err });
                }

                const count = result.rows[0].count;

                console.log("\n" + "=".repeat(60));
                console.log("INCREMENTAL AGGREGATION SUMMARY");
                console.log("=".repeat(60));
                console.log(`New records inserted: ${inserted}`);
                console.log(`Existing records updated: ${updated}`);
                console.log(`Total records in table: ${count}`);
                console.log("[OK] Incremental aggregation completed successfully!");

                res.json({
                  message: "Incremental aggregation completed successfully",
                  total_records: count,
                  inserted,
                  updated
                });
              });
            }
          });
        }
      });
    });
  } catch (error) {
    console.error("[FATAL]", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
