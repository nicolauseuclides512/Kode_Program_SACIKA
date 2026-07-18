const db = require("../config/database");

exports.getKategori = (req, res) => {
  db.query("SELECT * FROM kategori", (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result.rows);
  });
};

exports.tambahKategori = (req, res) => {
  const { nama_kategori } = req.body;

  if (!nama_kategori) {
    return res.status(400).json({ message: "Nama kategori harus diisi" });
  }

  db.query(
    "SELECT id FROM kategori WHERE LOWER(TRIM(nama_kategori)) = LOWER(TRIM($1))",
    [nama_kategori],
    (err, duplicateResult) => {
      if (err) {
        console.error("Error checking duplicate kategori:", err);
        return res.status(500).json({ message: "Database error", error: err.message });
      }

      if (duplicateResult.rows.length > 0) {
        return res.status(400).json({
          message: "Kategori dengan nama tersebut sudah terdaftar",
        });
      }

      db.query("INSERT INTO kategori(nama_kategori) VALUES($1)", [nama_kategori], (err) => {
        if (err) return res.status(500).json(err);

        res.json({
          message: "Kategori berhasil ditambahkan",
        });
      });
    }
  );
};

exports.updateKategori = (req, res) => {
  const id = req.params.id;
  const { nama_kategori } = req.body;

  if (!nama_kategori) {
    return res.status(400).json({ message: "Nama kategori harus diisi" });
  }

  db.query(
    "SELECT id FROM kategori WHERE LOWER(TRIM(nama_kategori)) = LOWER(TRIM($1)) AND id != $2",
    [nama_kategori, id],
    (err, duplicateResult) => {
      if (err) {
        console.error("Error checking duplicate kategori on update:", err);
        return res.status(500).json({ message: "Database error", error: err.message });
      }

      if (duplicateResult.rows.length > 0) {
        return res.status(400).json({
          message: "Kategori dengan nama tersebut sudah terdaftar",
        });
      }

      db.query("UPDATE kategori SET nama_kategori=$1 WHERE id=$2", [nama_kategori, id], (err) => {
        if (err) return res.status(500).json(err);

        res.json({
          message: "Kategori berhasil diupdate",
        });
      });
    }
  );
};

exports.deleteKategori = (req, res) => {
  const id = req.params.id;

  db.query("DELETE FROM kategori WHERE id=$1", [id], (err) => {
    if (err) return res.status(500).json(err);

    res.json({
      message: "Kategori berhasil dihapus",
    });
  });
};
