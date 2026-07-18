const db = require("../config/database");
const axios = require("axios");

const WORKER_URL = process.env.WORKER_URL || "https://sacika-worker-a65ae8195576.herokuapp.com";


// Fungsi pembantu untuk memanggil server Python Flask (worker ARIMA) via HTTP POST
const callWorker = async (produk_id, minggu) => {
  try {
    // Kirim request post berisi produk_id dan rentang minggu prediksi ke URL worker
    const response = await axios.post(`${WORKER_URL}/predict`, {
      produk_id,
      minggu
    });
    return response.data; // Kembalikan data prediksi dari Python
  } catch (error) {
    console.error("Worker Error:", error.message);
    throw new Error("Gagal memanggil worker ARIMA");
  }
};


exports.getDataset = (req, res) => {
  const { produk_id } = req.params;

  const query = `
    SELECT DISTINCT ON (tahun, bulan, minggu_ke)
      period_label,
      total_penjualan,
      bulan
    FROM dataset_mingguan
    WHERE produk_id = $1 AND minggu_ke <= 4
    ORDER BY tahun, bulan, minggu_ke ASC
  `;

  db.query(query, [produk_id], (err, result) => {
    if (err) {
      console.error("DB ERROR:", err);

      return res.status(500).json({
        message: "DB Error",
        err,
      });
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agst', 'Sept', 'Okt', 'Nov', 'Des'];
    
    const output = result.rows.map((row) => {
      const parts = row.period_label.split('-W');
      const yearStr = parts[0].split(' ')[1] || parts[0];
      const year = parseInt(yearStr);
      const week = parseInt(parts[1]);
      const shortYear = year % 100;
      const monthIdx = row.bulan - 1; 
      
      return {
        period: `${months[monthIdx]} ${shortYear}-W${week}`,
        total: row.total_penjualan,
      };
    });

    res.json(output);
  });
};


exports.prediksi = async (req, res) => {
  const { produk_id } = req.params;
  let { minggu = 1 } = req.query;
  minggu = Number(minggu) || 1;
  if (![1, 4, 12].includes(minggu)) minggu = 1;

  const countQuery = `SELECT COUNT(*) as total FROM dataset_mingguan WHERE produk_id = $1 AND minggu_ke <= 4`;

  db.query(countQuery, [produk_id], async (err, result) => {
    if (err) {
      return res.status(500).json({ message: "DB Error", err });
    }

    if (result.rows[0].total < 2) {
      return res.status(400).json({ message: "Data histori belum cukup" });
    }

    try {
      
      const parsed = await callWorker(produk_id, minggu);
      res.json(parsed);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
};


// Fungsi utama untuk menyiapkan data grafik (gabungan data histori dan ramalan masa depan)
exports.chart = async (req, res) => {
  const { produk_id } = req.params;
  let { minggu = 1 } = req.query;
  minggu = Number(minggu) || 1;
  if (![1, 4, 12].includes(minggu)) minggu = 1;

  // 1. Ambil riwayat penjualan mingguan produk ini dari PostgreSQL
  const query = `
    SELECT DISTINCT ON (tahun, bulan, minggu_ke)
      tahun,
      bulan,
      minggu_ke,
      total_penjualan
    FROM dataset_mingguan
    WHERE produk_id = $1 AND minggu_ke <= 4
    ORDER BY tahun, bulan, minggu_ke ASC
  `;

  db.query(query, [produk_id], async (err, dataset) => {
    if (err) {
      return res.status(500).json({ message: "DB Error", err });
    }

    // Pastikan minimal ada 2 baris data historis untuk divisualisasikan
    if (!dataset || dataset.rows.length < 2) {
      return res.status(400).json({
        message: "Data histori belum cukup",
        historical: []
      });
    }

    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    let currentYear = null;
    let currentMonth = null;
    let weekInMonth = 0;

    // 2. Format data historis agar siap dibaca library grafik di frontend (React)
    const historical = dataset.rows.map((row) => {
      if (row.tahun !== currentYear || row.bulan !== currentMonth) {
        currentYear = row.tahun;
        currentMonth = row.bulan;
        weekInMonth = 1;
      } else {
        weekInMonth += 1;
      }
      const monthStr = months[row.bulan - 1] || '';
      return {
        period: `minggu ke ${weekInMonth} ${monthStr} ${row.tahun}`,
        total: row.total_penjualan
      };
    });

    try {
      // 3. Panggil server Python (Flask) untuk menghitung peramalan ARIMA
      const parsed = await callWorker(produk_id, minggu);
      
      // 4. Balas request frontend dengan gabungan data histori + hasil ramalan dari Python
      res.json({
        historical,
        forecast: parsed.prediksi || [],
        labels_display: parsed.labels_display || [],
        labels_internal: parsed.labels_internal || [],
        stok_dibutuhkan: parsed.stok_dibutuhkan || 0,
        evaluasi: parsed.evaluasi || null,
        mode: "weekly"
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
};