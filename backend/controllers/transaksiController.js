const db = require("../config/database");
const {
  StockTransactionError,
  createStockTransaction,
} = require("../services/stockTransactionService");

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

exports.tambahTransaksi = async (req, res) => {
  try {
    const result = await createStockTransaction(db, req.body);
    return res.json(result);
  } catch (error) {
    const statusCode = error instanceof StockTransactionError
      ? error.statusCode
      : 500;

    if (statusCode >= 500) {
      console.error("Error creating transaksi:", error);
    }

    return res.status(statusCode).json({
      message: error.message || "Database error",
      ...(error.details ? { details: error.details } : {}),
    });
  }
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
