const db = require("../config/database");

exports.getTransaksi = (req, res) => {
  const query = `
  SELECT 
    transaksi.*,
    produk.nama_produk
  FROM transaksi
  LEFT JOIN produk
  ON transaksi.produk_id = produk.id
  ORDER BY transaksi.tanggal DESC
  `;

  db.query(query, (err, result) => {
    if (err) return res.status(500).json(err);

    res.json(result.rows);
  });
};

exports.tambahTransaksi = (req, res) => {
  const { produk_id, jenis_transaksi, jumlah, harga, tanggal } = req.body;

  // 1. Pastikan input dari frontend tidak kosong
  if (!produk_id || !jenis_transaksi || !jumlah || !harga) {
    return res.status(400).json({
      message: "Data tidak lengkap (produk_id, jenis_transaksi, jumlah, harga diperlukan)",
    });
  }

  const total = jumlah * harga;
  const tanggalTransaksi = tanggal || new Date().toISOString().split('T')[0];

  // 2. Ambil data stok produk saat ini dari database
  db.query("SELECT stok FROM produk WHERE id=$1", [produk_id], (err, result) => {
    if (err) {
      console.error("Error selecting produk:", err);
      return res.status(500).json({ message: "Database error", error: err.message });
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Produk tidak ditemukan",
      });
    }

    let stok = result.rows[0].stok;

    // 3. Update stok berdasarkan jenis transaksi
    if (jenis_transaksi === "masuk") {
      // Jika barang masuk, stok bertambah
      stok = stok + jumlah;
    } else if (jenis_transaksi === "keluar") {
      // VALIDASI PENTING: Mencegah stok bernilai negatif (minus)
      if (stok < jumlah) {
        return res.status(400).json({
          message: "Stok tidak mencukupi",
        });
      }

      // Jika stok cukup, kurangi stok barang
      stok = stok - jumlah;
    } else {
      return res.status(400).json({
        message: "Jenis transaksi harus 'masuk' atau 'keluar'",
      });
    }

    // 4. Masukkan data transaksi baru ke database
    const queryTransaksi = `
      INSERT INTO transaksi
      (produk_id,jenis_transaksi,jumlah,harga,total,tanggal)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id
      `;

    db.query(queryTransaksi, [produk_id, jenis_transaksi, jumlah, harga, total, tanggalTransaksi], (err, insertResult) => {
      if (err) {
        console.error("Error inserting transaksi:", err);
        return res.status(500).json({ message: "Database error", error: err.message });
      }

      // 5. Update stok terbaru ke tabel produk
      db.query("UPDATE produk SET stok=$1 WHERE id=$2", [stok, produk_id], (err) => {
        if (err) {
          console.error("Error updating stok:", err);
          return res.status(500).json({ message: "Database error", error: err.message });
        }

        res.json({
          message: "Transaksi berhasil",
          stok_sekarang: stok,
          transaksi_id: insertResult.rows[0].id,
        });
      });
    });
  });
};

exports.updateTransaksi = (req, res) => {
  const { id } = req.params;
  const { produk_id, jenis_transaksi, jumlah, harga, tanggal } = req.body;

  db.query("SELECT * FROM transaksi WHERE id=$1", [id], (err, oldTxRes) => {
    if (err) return res.status(500).json({ message: "Database error", error: err.message });
    if (oldTxRes.rows.length === 0) return res.status(404).json({ message: "Transaksi tidak ditemukan" });

    const oldTx = oldTxRes.rows[0];
    const oldProductId = oldTx.produk_id;
    const oldJumlah = Number(oldTx.jumlah);
    const oldJenis = oldTx.jenis_transaksi;

    const newProductId = Number(produk_id || oldProductId);
    const newJumlah = Number(jumlah);
    const newHarga = Number(harga);
    const newJenis = jenis_transaksi || oldJenis;
    const newTotal = newJumlah * newHarga;
    const newTanggal = tanggal || oldTx.tanggal;

    db.query("SELECT id, stok FROM produk WHERE id IN ($1, $2)", [oldProductId, newProductId], (err, prodRes) => {
      if (err) return res.status(500).json({ message: "Database error", error: err.message });
      
      const productsMap = {};
      prodRes.rows.forEach(p => { productsMap[p.id] = Number(p.stok); });

      if (!productsMap[newProductId] && newProductId !== oldProductId) {
        return res.status(404).json({ message: "Produk baru tidak ditemukan" });
      }

      let newOldStock = productsMap[oldProductId] || 0;
      let newNewStock = productsMap[newProductId] || 0;

      if (oldJenis === "masuk") {
        newOldStock -= oldJumlah;
      } else {
        newOldStock += oldJumlah;
      }

      if (oldProductId === newProductId) {
        let finalStock = newOldStock;
        if (newJenis === "masuk") {
          finalStock += newJumlah;
        } else {
          if (finalStock < newJumlah) {
            return res.status(400).json({ message: "Stok tidak mencukupi untuk pembaruan transaksi ini." });
          }
          finalStock -= newJumlah;
        }

        db.query(
          "UPDATE transaksi SET produk_id=$1, jumlah=$2, harga=$3, total=$4, tanggal=$5 WHERE id=$6",
          [newProductId, newJumlah, newHarga, newTotal, newTanggal, id],
          (err) => {
            if (err) return res.status(500).json({ message: "Database error", error: err.message });

            db.query("UPDATE produk SET stok=$1 WHERE id=$2", [finalStock, newProductId], (err) => {
              if (err) return res.status(500).json({ message: "Database error", error: err.message });
              return res.json({ message: "Transaksi berhasil diperbarui", stok_sekarang: finalStock });
            });
          }
        );
      } else {
        if (newJenis === "masuk") {
          newNewStock += newJumlah;
        } else {
          if (newNewStock < newJumlah) {
            return res.status(400).json({ message: "Stok tidak mencukupi pada produk tujuan." });
          }
          newNewStock -= newJumlah;
        }

        db.query(
          "UPDATE transaksi SET produk_id=$1, jumlah=$2, harga=$3, total=$4, tanggal=$5 WHERE id=$6",
          [newProductId, newJumlah, newHarga, newTotal, newTanggal, id],
          (err) => {
            if (err) return res.status(500).json({ message: "Database error", error: err.message });

            db.query("UPDATE produk SET stok=$1 WHERE id=$2", [newOldStock, oldProductId], (err) => {
              if (err) return res.status(500).json({ message: "Database error", error: err.message });

              db.query("UPDATE produk SET stok=$1 WHERE id=$2", [newNewStock, newProductId], (err) => {
                if (err) return res.status(500).json({ message: "Database error", error: err.message });
                return res.json({ message: "Transaksi berhasil diperbarui dengan perubahan produk" });
              });
            });
          }
        );
      }
    });
  });
};

exports.hapusTransaksi = (req, res) => {
  const { id } = req.params;

  db.query("SELECT * FROM transaksi WHERE id=$1", [id], (err, txRes) => {
    if (err) return res.status(500).json({ message: "Database error", error: err.message });
    if (txRes.rows.length === 0) return res.status(404).json({ message: "Transaksi tidak ditemukan" });

    const tx = txRes.rows[0];
    const productId = tx.produk_id;
    const jumlah = Number(tx.jumlah);
    const jenis = tx.jenis_transaksi;

    db.query("SELECT stok FROM produk WHERE id=$1", [productId], (err, prodRes) => {
      if (err) return res.status(500).json({ message: "Database error", error: err.message });
      if (prodRes.rows.length === 0) {
        
        db.query("DELETE FROM transaksi WHERE id=$1", [id], (err) => {
          if (err) return res.status(500).json({ message: "Database error", error: err.message });
          return res.json({ message: "Transaksi berhasil dihapus (produk sudah tidak ada)" });
        });
        return;
      }

      let stok = Number(prodRes.rows[0].stok);

      if (jenis === "masuk") {
        stok -= jumlah;
      } else {
        stok += jumlah;
      }

      db.query("DELETE FROM transaksi WHERE id=$1", [id], (err) => {
        if (err) return res.status(500).json({ message: "Database error", error: err.message });

        db.query("UPDATE produk SET stok=$1 WHERE id=$2", [stok, productId], (err) => {
          if (err) return res.status(500).json({ message: "Database error", error: err.message });
          res.json({ message: "Transaksi berhasil dihapus dan stok disesuaikan", stok_sekarang: stok });
        });
      });
    });
  });
};
