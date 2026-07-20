BEGIN;

DROP TRIGGER IF EXISTS trg_dataset_mingguan_updated_at ON dataset_mingguan;
DROP TABLE IF EXISTS dataset_mingguan;

DROP TRIGGER IF EXISTS trg_transaksi_updated_at ON transaksi;
DROP TABLE IF EXISTS transaksi;

DROP TRIGGER IF EXISTS trg_produk_updated_at ON produk;
DROP TABLE IF EXISTS produk;

DROP TRIGGER IF EXISTS trg_kategori_updated_at ON kategori;
DROP TABLE IF EXISTS kategori;

DROP TRIGGER IF EXISTS trg_pengguna_updated_at ON pengguna;
DROP TABLE IF EXISTS pengguna;

DROP FUNCTION IF EXISTS set_updated_at_timestamp();

COMMIT;
