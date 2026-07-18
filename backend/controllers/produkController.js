const db = require("../config/database");

exports.getProduk = (req, res) => {
  const query = `
  SELECT 
    produk.*,
    kategori.nama_kategori
  FROM produk
  LEFT JOIN kategori
  ON produk.kategori_id = kategori.id
  `;

  db.query(query, (err, result) => {
    if (err) return res.status(500).json(err);

    res.json(result.rows);
  });
};

exports.getProdukById = (req, res) => {
  const id = req.params.id;

  db.query("SELECT * FROM produk WHERE id=$1", [id], (err, result) => {
    if (err) return res.status(500).json(err);

    res.json(result.rows[0]);
  });
};

exports.tambahProduk = (req, res) => {
  const { nama_produk, kategori_id, harga, stok, stok_minimum } = req.body;

  if (!nama_produk || !kategori_id || !harga) {
    return res.status(400).json({
      message: "Data tidak lengkap (nama_produk, kategori_id, harga diperlukan)",
    });
  }

  const stokValue = (stok !== undefined && stok !== null) ? Number(stok) : 0;

  db.query(
    "SELECT id FROM produk WHERE LOWER(TRIM(nama_produk)) = LOWER(TRIM($1))",
    [nama_produk],
    (err, duplicateResult) => {
      if (err) {
        console.error("Error checking duplicate produk:", err);
        return res.status(500).json({ message: "Database error", error: err.message });
      }

      if (duplicateResult.rows.length > 0) {
        return res.status(400).json({
          message: "Produk dengan nama tersebut sudah terdaftar",
        });
      }

      const query = `
      INSERT INTO produk
      (nama_produk,kategori_id,harga,stok,stok_minimum)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id
      `;

      db.query(query, [nama_produk, kategori_id, harga, stokValue, stok_minimum || 5], (err, result) => {
        if (err) {
          console.error("Error inserting produk:", err);
          return res.status(500).json({ message: "Database error", error: err.message });
        }

        res.json({
          message: "Produk berhasil ditambahkan",
          id: result.rows[0].id,
        });
      });
    }
  );
};

exports.updateProduk = (req, res) => {
  const id = req.params.id;
  const { nama_produk, kategori_id, harga, stok, stok_minimum } = req.body;

  db.query(
    "SELECT id FROM produk WHERE LOWER(TRIM(nama_produk)) = LOWER(TRIM($1)) AND id != $2",
    [nama_produk, id],
    (err, duplicateResult) => {
      if (err) {
        console.error("Error checking duplicate produk on update:", err);
        return res.status(500).json({ message: "Database error", error: err.message });
      }

      if (duplicateResult.rows.length > 0) {
        return res.status(400).json({
          message: "Produk dengan nama tersebut sudah terdaftar",
        });
      }

      const query = `
      UPDATE produk SET
      nama_produk=$1,
      kategori_id=$2,
      harga=$3,
      stok=$4,
      stok_minimum=$5
      WHERE id=$6
      `;

      db.query(query, [nama_produk, kategori_id, harga, stok, stok_minimum, id], (err) => {
        if (err) return res.status(500).json(err);

        res.json({
          message: "Produk berhasil diupdate",
        });
      });
    }
  );
};

exports.deleteProduk = (req, res) => {
  const id = req.params.id;

  db.query("DELETE FROM produk WHERE id=$1", [id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({
      message: "Produk berhasil dihapus",
    });
  });
};
