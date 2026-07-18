const db = require("../config/database");

exports.getLaporan = (req, res) => {
  const { start_date, end_date, jenis_transaksi, kategori_id } = req.query;

  let query = `
    SELECT 
      t.id,
      t.tanggal,
      t.jenis_transaksi,
      t.jumlah,
      t.harga,
      t.total,
      p.nama_produk,
      k.nama_kategori
    FROM transaksi t
    LEFT JOIN produk p ON t.produk_id = p.id
    LEFT JOIN kategori k ON p.kategori_id = k.id
    WHERE 1=1
  `;
  const params = [];
  let paramIdx = 1;

  if (start_date) {
    query += ` AND t.tanggal >= $${paramIdx}`;
    params.push(start_date);
    paramIdx++;
  }

  if (end_date) {
    query += ` AND t.tanggal <= $${paramIdx}`;
    params.push(end_date);
    paramIdx++;
  }

  if (jenis_transaksi && jenis_transaksi !== "semua") {
    query += ` AND t.jenis_transaksi = $${paramIdx}`;
    params.push(jenis_transaksi);
    paramIdx++;
  }

  if (kategori_id && kategori_id !== "semua") {
    query += ` AND p.kategori_id = $${paramIdx}`;
    params.push(kategori_id);
    paramIdx++;
  }

  query += ` ORDER BY t.tanggal DESC, t.id DESC`;

  db.query(query, params, (err, result) => {
    if (err) {
      console.error("Error fetching laporan:", err);
      return res.status(500).json({ message: "Database error", error: err.message });
    }

    res.json(result.rows);
  });
};
