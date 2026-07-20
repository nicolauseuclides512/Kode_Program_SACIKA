# Database, Migration, dan Seed

## Urutan awal

```powershell
cd backend
npm run db:status
npm run db:migrate
npm run db:seed
npm run db:check
```

## Migration runner

Migration dicatat pada `schema_migrations` dengan nama, checksum, dan waktu penerapan. File `*.up.sql` dijalankan berdasarkan nama timestamp. File yang telah diterapkan tidak boleh diubah karena checksum akan berbeda.

```powershell
npm run db:status
npm run db:migrate
npm run db:rollback
```

`db:rollback` hanya membatalkan migration terakhir menggunakan pasangan `*.down.sql`.

## Seed

Seed bersifat idempoten. Kategori awal dan administrator tidak dibuat ganda saat perintah diulang.

```powershell
npm run db:seed
```

Akun aplikasi berasal dari:

```env
ADMIN_NAME=
ADMIN_USERNAME=
ADMIN_PASSWORD=
```

`ADMIN_PASSWORD` di-hash dengan bcrypt dan tidak dicetak ke terminal.

## Health check

```powershell
npm run db:check
```

Status:

- `PASS`: pemeriksaan lulus.
- `WARNING`: aplikasi masih dapat berjalan tetapi perlu perhatian.
- `FAIL`: terdapat masalah kritis dan exit code bernilai 1.

## Database test

```powershell
npm run test:db
```

Perintah ini mereset schema `public` pada `TEST_DATABASE_URL`. Pastikan URL tersebut menunjuk ke `sacika_test`, bukan `sacika`.

## Backup sebelum migration produksi

```powershell
pg_dump -U postgres -h localhost -p 5432 -d sacika -F c -f "D:\Backup\sacika.backup"
```

Pemulihan:

```powershell
pg_restore -U postgres -h localhost -p 5432 -d sacika --clean --if-exists "D:\Backup\sacika.backup"
```
