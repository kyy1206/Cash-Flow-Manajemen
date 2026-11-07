# Bocor Halus

Bocor Halus adalah aplikasi web progresif (PWA) untuk mencatat dan memantau keuangan satu usaha/UMKM. Aplikasi menyediakan buku transaksi, saldo kas dan rekening, kontrol pengajuan pengeluaran, rekonsiliasi, utang-piutang, anggaran, laporan, serta pengelolaan akses berdasarkan role.

> **Cakupan:** satu usaha per instalasi. Aplikasi ini bukan POS/kasir: tidak mengelola pesanan, katalog produk, pencetakan struk, atau stok barang. Pemasukan penjualan dicatat sebagai transaksi keuangan aktual. Owner dan Supervisor dapat memantau data usaha; Staff melihat transaksi dan laporan aktivitas yang dicatatnya sendiri. Kas/rekening merupakan sumber dana usaha bersama.

## Daftar isi

- [Fitur](#fitur)
- [Role dan hak akses](#role-dan-hak-akses)
- [Alur bisnis penting](#alur-bisnis-penting)
- [Teknologi](#teknologi)
- [Struktur proyek](#struktur-proyek)
- [Menjalankan secara lokal](#menjalankan-secara-lokal)
- [Konfigurasi](#konfigurasi)
- [Halaman aplikasi](#halaman-aplikasi)
- [Ringkasan API](#ringkasan-api)
- [Data utama](#data-utama)
- [Menjalankan pengujian](#menjalankan-pengujian)
- [Batasan dan catatan operasional](#batasan-dan-catatan-operasional)

## Fitur

- **Dashboard usaha:** ringkasan saldo, pemasukan dan pengeluaran berdasarkan periode, pengajuan yang menunggu, kas/rekening, aktivitas terbaru, dan pemakaian anggaran kategori.
- **Buku transaksi:** catat pemasukan, pengeluaran, dan transfer internal; simpan kategori, sumber dana, tanggal, merchant, metode pembayaran, dan keterangan; filter serta cari riwayat.
- **Bukan POS:** penjualan harian dapat dicatat sebagai satu transaksi pemasukan tanpa input pesanan atau barang satu per satu. Penjualan kredit dicatat sebagai piutang; kas baru bertambah saat pembayaran diterima.
- **Kas dan rekening:** kelola beberapa sumber dana bertipe kas tunai, rekening bank, atau lainnya. Saldo dihitung dari saldo awal dan transaksi yang sudah diposting.
- **Persetujuan pengeluaran:** Staff dapat mengajukan pengeluaran dan melampirkan bukti JPG/PNG/PDF maksimal 5 MB. Supervisor dapat menyetujui atau menolak dengan catatan. Pengeluaran yang disetujui baru memengaruhi saldo setelah Staff mencatat pembayarannya.
- **Baca struk (OCR):** Staff dapat mengunggah JPG, PNG, WEBP, atau PDF untuk mengisi rancangan transaksi. Hasilnya harus ditinjau dan dikoreksi sebelum disimpan.
- **Anggaran:** atur target bulanan dan alokasi per kategori; pantau pemakaian terhadap anggaran.
- **Kategori:** kelola kategori pemasukan/pengeluaran; kategori pengeluaran dapat ditandai wajib melalui approval.
- **Utang dan piutang:** catat pihak terkait, nominal, deskripsi, dan tanggal jatuh tempo; catat pembayaran/penerimaan untuk memperbarui sisa dan buku transaksi.
- **Rekonsiliasi:** bandingkan saldo sistem dengan hasil hitung kas/rekening dan minta Supervisor melakukan review.
- **Laporan:** ringkasan tahunan, arus kas bulanan, pengeluaran per kategori dan per hari, serta perbandingan terhadap anggaran.
- **Pengguna dan audit trail:** Owner dapat membuat akun Staff/Supervisor, mengubah data/role, mereset password, menonaktifkan atau mengaktifkannya, serta melihat riwayat tindakan yang tercatat.
- **Profil dan notifikasi:** ubah profil/kredensial, lihat notifikasi approval, peringatan anggaran, dan pengingat subscription.
- **Progressive Web App (PWA):** shell aplikasi dan aset build dapat dibuka setelah pernah dimuat. Data API dan data akun tidak tersedia offline.

## Role dan hak akses

| Kemampuan | Owner | Supervisor | Staff |
|---|:---:|:---:|:---:|
| Dashboard dan saldo kas/rekening bersama | Ya | Ya | Ya |
| Melihat transaksi usaha | Semua | Semua | Transaksi sendiri |
| Mencatat pemasukan/pengeluaran langsung | Ya | Ya | Ya, tunduk pada aturan approval |
| Transfer antar kas/rekening | Ya | Ya | Tidak |
| Mengajukan pengeluaran dan mencatat pembayaran pengajuan sendiri | Tidak untuk pengajuan baru | Tidak untuk pengajuan baru | Ya |
| Menyetujui/menolak pengajuan Staff | Tidak melalui endpoint approval saat ini | Ya | Tidak |
| Mengelola sumber dana (membuat dan mengubah) | Ya | Lihat | Lihat |
| Mengelola kategori dan aturan wajib approval | Ya | Lihat | Lihat |
| Mengelola target bulanan dan anggaran kategori | Ya | Lihat | Tidak |
| Laporan | Semua data | Semua data | Terbatas ke transaksi sendiri |
| Membuat/mengubah akun Staff dan Supervisor, mengatur role/status, reset password | Ya | Tidak | Tidak |
| Mengubah pengaturan usaha dan ambang approval | Ya | Tidak | Tidak |
| Membalikkan/koreksi transaksi melalui pencatatan reversal | Ya | Tidak | Tidak |
| Mengirim dan melihat rekonsiliasi | Ya | Ya | Ya (daftar Staff dibatasi ke miliknya) |
| Review rekonsiliasi | Tidak melalui endpoint review saat ini | Ya | Tidak |
| Utang/piutang | Semua data | Semua data | Data yang dibuat sendiri |
| Notifikasi dan profil sendiri | Ya | Ya | Ya |

Owner sekaligus menjalankan fungsi Admin; tidak ada role Admin tersendiri. Owner tidak dapat menyetujui pengajuan Staff: approval hanya tersedia bagi Supervisor. Role dicek kembali oleh middleware/API, tidak hanya dengan menyembunyikan navigasi. Akun nonaktif tidak dapat login dan ditolak oleh pemeriksaan role.

### Persetujuan pengeluaran

Staff tidak dapat langsung memposting pengeluaran apabila kategori ditandai **wajib approval**, atau jika nominalnya **sama dengan atau lebih besar dari ambang approval** usaha. Jika ambang tidak diatur, hanya aturan kategori yang berlaku. Owner mengatur nama usaha dan ambang melalui **Pengaturan Usaha**. Owner mencatat pengeluaran usaha secara langsung; Owner tidak membuat atau menyetujui pengajuan atas namanya sendiri.

Alur status pengajuan: `pending` → `approved` atau `rejected`; setelah disetujui, Staff mencatat pembayaran → `paid`. Pengajuan yang masih menunggu atau baru disetujui belum membuat transaksi dan tidak mengubah saldo. Staff tidak dapat menyetujui pengajuannya sendiri.

## Alur bisnis penting

1. **Setup pertama:** buat Owner dan usaha satu kali melalui halaman `/setup`. Sistem membuat kas tunai dengan saldo awal nol dan empat kategori awal (Penjualan, Pemasukan Lain, Bahan Baku, Operasional). Setelah setup, pembuatan akun Supervisor/Staff dilakukan oleh Owner.
2. **Operasi harian:** transaksi usaha tercatat dalam satu buku. Owner/Supervisor dapat memantau seluruh transaksi, sedangkan Staff hanya melihat transaksi yang dicatatnya. Saldo kas/rekening bersama berasal dari saldo awal ditambah pemasukan, dikurangi pengeluaran, dan disesuaikan transfer internal; transfer tidak dihitung sebagai pemasukan/pengeluaran.
3. **OCR struk:** backend meneruskan file ke OCR.Space dan mengembalikan usulan merchant, nominal, tanggal, metode pembayaran, serta deskripsi. OCR tidak membuat transaksi dengan sendirinya.
4. **Koreksi transaksi:** transaksi yang sudah diposting tidak dapat diedit atau dihapus. Owner membalik transaksi dengan alasan yang tercatat, bukan menghapus riwayat keuangan secara diam-diam.
5. **Anggaran dan notifikasi:** peringatan dapat dibuat saat pengeluaran mencapai 50% atau 80% anggaran, atau melewati 100%. Pengingat subscription aktif dibuat untuk tanggal jatuh tempo dalam tujuh hari. Notifikasi dapat ditandai satu per satu atau sekaligus telah dibaca.

## Teknologi

- **Frontend:** React 19, Vite 8, React Router 7, Axios.
- **Backend:** PHP 8.3+, Laravel 13, Laravel Sanctum.
- **Database:** SQLite pada konfigurasi contoh; Laravel juga dapat memakai driver database lain yang dikonfigurasi.
- **OCR struk:** OCR.Space API (opsional).

## Struktur proyek

```text
.
├── backend/       # Laravel REST API, migrasi, model, dan feature tests
├── frontend/      # React SPA, halaman, dan aset PWA
├── README.md      # Dokumentasi utama aplikasi
└── DOKUMENTASI-ANALISIS-SISTEM-BOCOR-HALUS.md
```

## Menjalankan secara lokal

Pastikan PHP 8.3+, Composer, Node.js/npm, dan ekstensi PHP yang dibutuhkan Laravel serta SQLite tersedia.

### 1. Siapkan backend

Buka terminal di folder `backend`:

```powershell
cd backend
composer install
Copy-Item .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve
```

Jika file database SQLite belum ada, buat sebelum migrasi:

```powershell
New-Item -ItemType File database\database.sqlite
```

Perintah `Copy-Item` dan `New-Item` adalah perintah PowerShell. Jika `.env` sudah tersedia, jangan menimpanya; cukup pastikan konfigurasi database dan `APP_KEY` sudah benar.

API berjalan secara default di `http://localhost:8000/api`.

### 2. Siapkan frontend

Buka terminal lain di folder `frontend`:

```powershell
cd frontend
npm install
npm run dev
```

Vite akan menampilkan alamat lokal (biasanya `http://localhost:5173`). Frontend secara default mengakses `http://localhost:8000/api`. Untuk API di alamat lain, buat `frontend/.env`:

```dotenv
VITE_API_URL=http://localhost:8000/api
```

### 3. Buat Owner pertama

Buka `/setup` pada alamat frontend dan isi nama, email, nama usaha, serta password (minimal 8 karakter). Setup hanya dapat dilakukan sekali pada satu database. Setelah Owner dibuat, akun berikutnya dibuat oleh Owner dari halaman **Pengguna** dengan role Staff atau Supervisor; pendaftaran publik tidak tersedia.

## Konfigurasi

Konfigurasi backend berada di `backend/.env`; contoh awal memakai SQLite dan mail driver `log`.

| Variabel | Kegunaan |
|---|---|
| `APP_URL` | URL backend Laravel |
| `DB_CONNECTION` | Driver database; nilai contoh `sqlite` |
| `DB_DATABASE` | Lokasi database bila menggunakan SQLite atau nama database untuk driver terkait |
| `RECEIPT_OCR_API_KEY` | Kunci OCR.Space (opsional; tetap di backend, jangan masukkan ke frontend) |
| `RECEIPT_OCR_LANGUAGE` | Bahasa OCR; default `auto` |
| `RECEIPT_OCR_ENGINE` | Engine OCR.Space; default `2` |
| `VITE_API_URL` | URL dasar API yang digunakan frontend; default `http://localhost:8000/api` |

Endpoint OCR menerima berkas maksimal 10 MB dalam format JPG/JPEG, PNG, WEBP, atau PDF. Tanpa `RECEIPT_OCR_API_KEY`, input manual tetap tersedia tetapi OCR mengembalikan status layanan belum dikonfigurasi.

## Halaman aplikasi

| URL | Fungsi | Akses |
|---|---|---|
| `/setup` | Setup Owner pertama | Sebelum Owner tersedia |
| `/login` | Login | Publik |
| `/dashboard` | Ringkasan keuangan per bulan | Semua role |
| `/transactions` | Catat transaksi; lihat transaksi usaha oleh Owner/Supervisor dan transaksi sendiri oleh Staff; OCR untuk Staff | Semua role |
| `/requests` | Pengajuan, keputusan, dan pencatatan pembayaran | Semua role, aksi mengikuti role |
| `/wallets` | Lihat kas/rekening; Owner dapat mengelola | Semua role |
| `/debts` | Catat utang/piutang dan pembayaran | Semua role |
| `/reconciliations` | Kirim dan review rekonsiliasi | Semua role, review oleh Supervisor |
| `/budgets` | Lihat dan kelola rencana/anggaran | Owner/Supervisor; perubahan data oleh Owner |
| `/categories` | Kategori dan aturan approval | Owner |
| `/reports` | Laporan keuangan (transaksi sendiri untuk Staff) | Semua role |
| `/users` | Buat, ubah role/data, reset password, dan aktifkan/nonaktifkan Staff/Supervisor | Owner |
| `/settings` | Nama usaha dan ambang approval | Owner |
| `/audit` | Riwayat aktivitas | Owner |
| `/notifications` | Riwayat notifikasi | Semua role |
| `/profile` | Profil dan password akun | Semua role |
| `/subscriptions` | Pengelolaan subscription | Semua role; halaman tersedia sebagai modul terpisah |

`/register` mengarah ke `/setup`. Rute lama `/expenses`, `/expenses/manual`, dan `/expenses/ocr` diarahkan ke `/transactions`.

## Ringkasan API

Semua endpoint memakai prefix `/api`. Kecuali setup dan login, endpoint berikut memerlukan token Sanctum.

| Endpoint | Fungsi / pembatasan utama |
|---|---|
| `GET /setup/status`, `POST /setup/owner` | Memeriksa dan membuat Owner pertama |
| `POST /login`, `POST /logout` | Login dan logout |
| `GET/PATCH /profile`, `GET /user` | Profil dan pengguna yang sedang login |
| `/dashboard`, `/reports` | Ringkasan periode; laporan untuk Owner/Supervisor mencakup usaha dan laporan Staff hanya mencakup transaksinya sendiri |
| `/transactions` | Daftar, buat, dan lihat transaksi. Transaksi yang sudah diposting tidak dapat diubah atau dihapus; Owner dapat mengoreksinya melalui `POST /transactions/{id}/reverse` |
| `/wallets`, `/categories` | Data sumber dana dan kategori; perubahan dibatasi ke Owner |
| `/monthly-plans`, `/budgets` | Baca oleh Owner/Supervisor, perubahan oleh Owner |
| `/expense-requests` | Mengajukan, melihat bukti, menyetujui/menolak, dan mencatat pembayaran sesuai role |
| `/debts`, `/debts/{id}/settle` | Mencatat serta menyelesaikan utang/piutang |
| `/reconciliations`, `/reconciliations/{id}/review` | Mengirim rekonsiliasi dan review oleh Supervisor |
| `POST /receipt-extractions` | Ekstraksi OCR untuk Staff; tidak membuat transaksi |
| `/subscriptions` | Operasi CRUD subscription |
| `/notifications`, `/notifications/{id}/read`, `/notifications/read-all` | Melihat dan menandai notifikasi |
| `/users`, `/business-settings`, `/audit-logs` | Manajemen usaha khusus Owner |

## Data utama

- `users`: identitas akun, role, dan status aktif.
- `business_settings`: identitas usaha serta ambang persetujuan.
- `wallets`: sumber dana dan saldo awal; saldo berjalan dihitung dari transaksi.
- `categories`: jenis kategori dan penanda kewajiban approval.
- `transactions`: pemasukan, pengeluaran, transfer, sumber transaksi, dan status posting.
- `monthly_plans` dan `budgets`: target bulanan dan alokasi kategori.
- `expense_requests` dan `approval_logs`: pengajuan dan jejak keputusan.
- `debts` dan `reconciliations`: utang/piutang serta pemeriksaan saldo.
- `audit_logs` dan `notifications`: jejak perubahan dan pemberitahuan pengguna.
- `subscriptions`: data subscription dan tanggal jatuh tempo.

Skema database dibuat dan diperbarui melalui Laravel migrations di `backend/database/migrations`.

## Menjalankan pengujian

Dari folder `backend`:

```powershell
php artisan test
```

Dari folder `frontend`:

```powershell
npm run lint
npm run build
```

## Batasan dan catatan operasional

- OCR meneruskan berkas struk ke layanan pihak ketiga OCR.Space. Jangan unggah data sensitif tanpa meninjau kebijakan privasi dan ketentuan layanan provider.
- Hasil OCR bersifat perkiraan; pengguna harus memeriksa nominal, tanggal, merchant, metode pembayaran, dan kategori sebelum menyimpan transaksi.
- PWA hanya menyimpan shell dan aset frontend. Permintaan API, transaksi, dan data akun tidak tersedia saat offline.
- Berkas bukti pengajuan disimpan pada disk privat backend dan hanya dapat diunduh oleh pembuatnya, Owner, atau Supervisor.
- Pencatatan pembayaran utang/piutang secara penuh tersedia melalui antarmuka saat ini; endpoint backend menerima nominal pembayaran hingga sisa utang/piutang sehingga mendukung pembayaran bertahap melalui API.
- Role untuk operasi sensitif tetap ditegakkan oleh backend; pembatasan tampilan frontend bukan pengganti otorisasi API.
