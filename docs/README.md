# Dokumentasi SACIKA

Dokumentasi ini mengikuti alur instalasi dan operasional SACIKA setelah perbaikan 1–90.

1. [Instalasi Windows](01-instalasi-windows.md)
2. [Database, migration, dan seed](02-database-migration-seed.md)
3. [Bootstrap produk dan importer Excel](03-importer-excel.md)
4. [Forecasting persediaan dan pratinjau penjualan](04-forecasting.md)
5. [Deployment dan operasi](05-deployment.md)

## Prinsip data

- `inventory_snapshot_monthly` adalah posisi persediaan akhir bulan.
- `transaksi` adalah catatan barang masuk dan barang keluar aktual.
- `penjualan_bulanan` adalah agregasi transaksi keluar aktual.
- `dataset_mingguan` merupakan struktur legacy dan tidak menjadi sumber forecasting baru.
- Forecast persediaan dan forecast penjualan memakai target, histori, serta interpretasi yang terpisah.
