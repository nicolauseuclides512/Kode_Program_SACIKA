BEGIN;

CREATE TABLE IF NOT EXISTS pengguna (
  id SERIAL PRIMARY KEY,
  nama TEXT NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_pengguna_nama_not_empty
    CHECK (BTRIM(nama) <> ''),
  CONSTRAINT chk_pengguna_username_not_empty
    CHECK (BTRIM(username) <> ''),
  CONSTRAINT chk_pengguna_password_not_empty
    CHECK (BTRIM(password) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pengguna_username_normalized
  ON pengguna (LOWER(BTRIM(username)));

CREATE TABLE IF NOT EXISTS kategori (
  id SERIAL PRIMARY KEY,
  nama_kategori TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_kategori_nama_not_empty
    CHECK (BTRIM(nama_kategori) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_kategori_nama_normalized
  ON kategori (LOWER(BTRIM(nama_kategori)));

CREATE TABLE IF NOT EXISTS produk (
  id SERIAL PRIMARY KEY,
  kode_produk TEXT,
  nama_produk TEXT NOT NULL,
  kategori_id INTEGER NOT NULL REFERENCES kategori(id) ON DELETE RESTRICT,
  harga NUMERIC(14, 2) NOT NULL DEFAULT 0,
  stok NUMERIC(14, 2) NOT NULL DEFAULT 0,
  stok_minimum NUMERIC(14, 2) NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_produk_kode_produk_not_empty
    CHECK (kode_produk IS NULL OR BTRIM(kode_produk) <> ''),
  CONSTRAINT chk_produk_nama_not_empty
    CHECK (BTRIM(nama_produk) <> ''),
  CONSTRAINT chk_produk_harga_nonnegative
    CHECK (harga >= 0),
  CONSTRAINT chk_produk_stok_nonnegative
    CHECK (stok >= 0),
  CONSTRAINT chk_produk_stok_minimum_nonnegative
    CHECK (stok_minimum >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_produk_nama_normalized
  ON produk (LOWER(BTRIM(nama_produk)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_produk_kode_normalized
  ON produk (LOWER(BTRIM(kode_produk)))
  WHERE kode_produk IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_produk_kategori_id
  ON produk (kategori_id);

CREATE TABLE IF NOT EXISTS transaksi (
  id SERIAL PRIMARY KEY,
  produk_id INTEGER NOT NULL REFERENCES produk(id) ON DELETE RESTRICT,
  jenis_transaksi TEXT NOT NULL,
  jumlah NUMERIC(14, 2) NOT NULL,
  harga NUMERIC(14, 2) NOT NULL,
  total NUMERIC(18, 2) NOT NULL,
  tanggal DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_transaksi_jenis
    CHECK (jenis_transaksi IN ('masuk', 'keluar')),
  CONSTRAINT chk_transaksi_jumlah_positive
    CHECK (jumlah > 0),
  CONSTRAINT chk_transaksi_harga_positive
    CHECK (harga > 0),
  CONSTRAINT chk_transaksi_total_nonnegative
    CHECK (total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_transaksi_produk_id
  ON transaksi (produk_id);

CREATE INDEX IF NOT EXISTS idx_transaksi_tanggal_desc
  ON transaksi (tanggal DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_transaksi_jenis_tanggal
  ON transaksi (jenis_transaksi, tanggal DESC);

CREATE TABLE IF NOT EXISTS dataset_mingguan (
  id SERIAL PRIMARY KEY,
  produk_id INTEGER NOT NULL REFERENCES produk(id) ON DELETE CASCADE,
  tahun INTEGER NOT NULL,
  bulan INTEGER NOT NULL,
  minggu_ke INTEGER NOT NULL,
  period_label TEXT NOT NULL,
  total_penjualan NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dataset_mingguan_produk_period_label
    UNIQUE (produk_id, period_label),
  CONSTRAINT uq_dataset_mingguan_produk_tahun_bulan_minggu
    UNIQUE (produk_id, tahun, bulan, minggu_ke),
  CONSTRAINT chk_dataset_mingguan_tahun
    CHECK (tahun BETWEEN 1900 AND 2200),
  CONSTRAINT chk_dataset_mingguan_bulan
    CHECK (bulan BETWEEN 1 AND 12),
  CONSTRAINT chk_dataset_mingguan_minggu_ke
    CHECK (minggu_ke BETWEEN 1 AND 4),
  CONSTRAINT chk_dataset_mingguan_period_label_not_empty
    CHECK (BTRIM(period_label) <> ''),
  CONSTRAINT chk_dataset_mingguan_total_nonnegative
    CHECK (total_penjualan >= 0)
);

CREATE INDEX IF NOT EXISTS idx_dataset_mingguan_produk_tahun_bulan
  ON dataset_mingguan (produk_id, tahun, bulan, minggu_ke);

CREATE INDEX IF NOT EXISTS idx_dataset_mingguan_period_label
  ON dataset_mingguan (period_label);

CREATE OR REPLACE FUNCTION set_core_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pengguna_updated_at ON pengguna;
CREATE TRIGGER trg_pengguna_updated_at
BEFORE UPDATE ON pengguna
FOR EACH ROW
EXECUTE FUNCTION set_core_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_kategori_updated_at ON kategori;
CREATE TRIGGER trg_kategori_updated_at
BEFORE UPDATE ON kategori
FOR EACH ROW
EXECUTE FUNCTION set_core_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_produk_updated_at ON produk;
CREATE TRIGGER trg_produk_updated_at
BEFORE UPDATE ON produk
FOR EACH ROW
EXECUTE FUNCTION set_core_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_transaksi_updated_at ON transaksi;
CREATE TRIGGER trg_transaksi_updated_at
BEFORE UPDATE ON transaksi
FOR EACH ROW
EXECUTE FUNCTION set_core_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_dataset_mingguan_updated_at ON dataset_mingguan;
CREATE TRIGGER trg_dataset_mingguan_updated_at
BEFORE UPDATE ON dataset_mingguan
FOR EACH ROW
EXECUTE FUNCTION set_core_updated_at_timestamp();

COMMIT;
