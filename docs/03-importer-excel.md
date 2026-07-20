# Bootstrap Produk dan Importer Excel

## Makna workbook

Workbook `History Penjualan_LaporanBulanan.xlsx` berisi posisi persediaan akhir bulanan. Kolom `Jml` disimpan sebagai `stok_akhir`; kolom tersebut bukan jumlah terjual dan tidak dibagi menjadi empat minggu.

## 1. Bootstrap master produk

Dry-run:

```powershell
cd backend
npm run bootstrap:products -- --file "D:\Data\History Penjualan_LaporanBulanan.xlsx" --dry-run --output "D:\Data\bootstrap-report.json"
```

Periksa:

- kandidat produk;
- produk yang sudah ada;
- alias yang akan dibuat;
- collision nama;
- baris invalid.

Commit setelah laporan disetujui:

```powershell
npm run bootstrap:products -- --file "D:\Data\History Penjualan_LaporanBulanan.xlsx" --commit --output "D:\Data\bootstrap-commit.json"
```

## 2. Import histori persediaan

Dry-run:

```powershell
npm run import:inventory -- --file "D:\Data\History Penjualan_LaporanBulanan.xlsx" --dry-run --unresolved-output "D:\Data\unresolved.json"
```

Import aktual:

```powershell
npm run import:inventory -- --file "D:\Data\History Penjualan_LaporanBulanan.xlsx" --unresolved-output "D:\Data\unresolved.json"
```

## Status data

- `observed`: produk tercantum, termasuk nilai stok 0.
- `corrected`: data dikoreksi secara terkontrol.
- `missing`: histori yang seharusnya ada tetapi tidak tersedia.
- `not_listed`: produk tidak tercantum pada sumber periode tersebut.
- `not_active`: periode berada di luar masa aktif produk.

## Idempotensi

Bootstrap dan importer dapat dijalankan ulang. Upsert menggunakan identitas produk dan periode sehingga tidak membuat snapshot ganda. Collision dan unresolved tetap harus diperiksa manual.

## Sinkronisasi stok awal

```powershell
npm run sync:current-stock -- --dry-run
npm run sync:current-stock -- --commit
```

Sinkronisasi tidak membuat transaksi buatan.
