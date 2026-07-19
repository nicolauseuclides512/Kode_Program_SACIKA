BEGIN;

DROP TABLE IF EXISTS dataset_mingguan;
DROP TABLE IF EXISTS transaksi;
DROP TABLE IF EXISTS produk;
DROP TABLE IF EXISTS kategori;
DROP TABLE IF EXISTS pengguna;
DROP FUNCTION IF EXISTS set_core_schema_updated_at();

COMMIT;
