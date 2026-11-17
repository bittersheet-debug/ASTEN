# 🚀 ASTEN! (ASISTEN TENAGA!) — Platform Telegram Bot Management

**ASTEN! (ASISTEN TENAGA!)** adalah platform multi-bot Telegram management otomatis, profesional, aman, dan siap produksi yang dirancang untuk mengelola toko Telegram dengan banyak Owner secara mandiri.

Setiap Owner dapat mendaftarkan bot miliknya melalui **API Token dari @BotFather**. Setiap bot yang terdaftar berjalan secara independen dengan seluruh fitur lengkap ASTEN! dan isolasi data per Bot ID dan Owner ID.

---

## 🌟 Fitur Utama ASTEN!

### 1. Sistem Multi-Bot & Isolasi Data
* Multi-tenant bot engine bertenaga Telegraf & SQLite WAL mode.
* Setiap bot berjalan independen tanpa saling mengganggu.
* Token BotFather disimpan secara terenkripsi menggunakan **AES-256-GCM**.
* Seluruh data produk, stok, transaksi, admin, dan grup terpisah berdasarkan `bot_id` dan `owner_id`.

### 2. Seluruh Perintah Bot Lengkap
| Perintah | Deskripsi & Hak Akses |
| :--- | :--- |
| `/start` | Memulai bot, menu utama, dan mendukung Deep Link transaksi (`pay_ID`) serta RNK (`rnk_ID`). |
| `/help` | Panduan lengkap disesuaikan dengan role pengguna (Publik, Pembeli, Admin, Owner). |
| `/menu` | Menampilkan menu interaktif dengan inline button. |
| `/price` / `/product` | Menampilkan katalog produk terorganisir per kategori, harga, dan stok status. |
| `/search <kata_kunci>` | Pencarian cepat produk berdasarkan nama/kategori. |
| `/stock` | Ringkasan stok, alert stok menipis, dan riwayat audit perubahan stok. |
| `/order` | Panduan dan alur pemesanan produk di toko. |
| `/transaction` | Cek riwayat status transaksi pembeli. |
| `/payment` | Admin me-REPLY pesan pembeli di grup &rarr; membuat tagihan privat dengan countdown 30 menit. |
| `/done` | Admin me-REPLY bukti bayar di grup/PM &rarr; verifikasi pembayaran & potong stok otomatis. |
| `/paymentlist` | Daftar metode pembayaran aktif di toko. |
| `/paymentsettings` | Pintasan pengaturan pembayaran di Private Chat. |
| `/paymentcancel` | Membatalkan transaksi aktif. |
| `/settings` | Pengaturan sensitif Owner/Admin (wajib di Private Chat dengan proteksi password). |
| `/rnk` | Admin me-REPLY pembeli &rarr; kirim link RNK privat & auto-mute pembeli di grup. |
| `/admin <nama>` | **Hidden Command** khusus Owner di Private Chat untuk mendaftarkan Admin baru. |

---

### 3. Sistem Pembayaran & Private Chat Checkout
* **Metode Pembayaran**:
  * **E-Wallet**: DANA, OVO, GoPay, ShopeePay, LinkAja, iSaku, Custom E-Wallet.
  * **Bank**: BCA, BRI, BNI, Mandiri, BSI, BTN, CIMB Niaga, Permata, Danamon, SeaBank, Bank Jago, Custom Bank.
  * **QRIS**: Upload barcode QRIS, preview, ganti, hapus, atur caption & fee.
* **Aturan Fee**:
  * Fee bersifat opsional. Jika fee diatur, dihitung tepat 1x ke total tagihan.
  * Jika fee tidak diatur (Rp0 / kosong), sistem **TIDAK** menampilkan baris fee atau Rp0.
* **Keamanan Privasi Grup**:
  * Bot **TIDAK PERNAH** membocorkan nomor rekening, e-wallet, atau barcode QRIS ke grup!
  * Detail pembayaran hanya dikirimkan melalui **Private Chat**.
  * Jika pembeli belum pernah menekan `/start` di bot, bot otomatis memberikan instruksi dengan **Deep Link**: `https://t.me/<botusername>?start=pay_<txId>`.
* **Countdown 30 Menit**:
  * Countdown dimulai saat rincian pembayaran berhasil terkirim ke Private Chat pembeli.
  * Waktu kedaluwarsa tersimpan di database SQLite (`expires_at`), sehingga **restart bot tidak mereset countdown**.
  * Jika lewat 30 menit tanpa verifikasi, transaksi otomatis menjadi `EXPIRED`.
* **Verifikasi Manual via `/done`**:
  * Verifikasi manual oleh Admin (screenshot bukan bukti otomatis valid).
  * Stok barang dipotong otomatis dan dicegah menjadi negatif.
  * Pesan instruksi pembayaran bot dapat dihapus otomatis jika diizinkan Telegram.

---

### 4. Custom Command Reply & Payment Alias
* **Custom Command Reply**: Admin dapat membuat command kustom seperti `/rules`, `/info`, `/halo`, `/faq` lengkap dengan teks atau foto.
* **Custom Command Reply Payment (Alias `/payment`)**:
  * Lokasi: *Private Chat &rarr; Settings Admin &rarr; Pembayaran &rarr; Custom Command Reply Payment*.
  * Admin dapat membuat alias seperti `/ala`, `/bayar`, `/pay`, `/tagih`, `/invoice`, `/paymentku`.
  * Menjalankan handler pembayaran yang sama persis seperti `/payment` (identifikasi buyer dari reply, Transaction ID, countdown 30 menit, dan verifikasi `/done`).

---

### 5. Sistem Keamanan & Password Terkontrol Owner
* **Owner-Controlled Passwords**: Owner yang membuatkan password bagi setiap Admin.
* **Salted Hashing**: Password disimpan menggunakan salted bcrypt hashing (cost factor 12).
* **Lockout Guard**: Maksimal 3 kali salah password &rarr; akun dikunci selama 15 menit.
* **Session Guard**: Sesi terverifikasi berlaku selama 15 menit.
* **Pembersihan Chat**: Pesan berisi password dihapus secara otomatis dari riwayat obrolan Telegram.

---

### 6. Sistem RNK (Rating and Kritik)
* **Pengaturan Owner**: Caption kustom, Link RNK, ID Group Comment, Status Aktivasi.
* **Alur Eksekusi**:
  1. Pembayaran lunas & barang diterima pembeli.
  2. Admin me-REPLY pesan pembeli di grup dengan `/rnk`.
  3. Bot mengirim caption & link RNK ke Private Chat pembeli.
  4. Bot otomatis melakukan **MUTE** kepada pembeli di grup transaksi (`can_send_messages = false`).
  5. Status pembeli dicatat sebagai `WAITING RNK`.
  6. Pembeli mengirim review di **Group Comment**.
  7. Bot mendeteksi Telegram User ID pembeli di Group Comment dan memverifikasi isi review.
  8. Bot otomatis melakukan **AUTO UNMUTE** kepada pembeli di grup transaksi asal!

---

### 7. Auto Tag Admin (@admins) & Auto Group Activation
* **Auto Tag Admin**:
  * Anggota grup mengetik `@admins` &rarr; bot memanggil seluruh Admin grup aktif.
  * **Owner DIKECUALIKAN** berdasarkan Telegram User ID agar tidak terganggu.
  * Menggunakan mention Telegram yang valid dan bebas duplikasi.
* **Auto Group Activation**:
  * Mendeteksi bot saat ditambahkan ke grup.
  * Meminta admin grup mempromosikan bot menjadi Administrator.
  * Memvalidasi izin `can_restrict_members` dan `can_delete_messages`.
  * Jika bot kehilangan status admin atau dikeluarkan, status grup otomatis menjadi `INACTIVE`.

---

### 8. Website PORTAL PEMILIK BOT ASTEN!
Website portal web bertenaga modern Glassmorphism & Tailwind CSS:
1. **Dashboard Statistik**: Total Owner, Total Bot, Bot Aktif/Nonaktif, Lisensi Aktif/Expired/Permanen, Total Kode Akses, Kode Unused, dan Log Aktivitas Real-time.
2. **Owner Yang Ditambahkan**: Tambah akun Owner baru langsung ke database.
3. **Pembuatan Kode Akses**: Generate kode kriptografis `ASTEN-XXXX-XXXX-XXXX` dengan opsi durasi (1 bulan, 3 bulan, 6 bulan, 1 tahun, 2 tahun, Permanen, Custom).
4. **Daftar Kode Akses**: Monitoring status kode (`UNUSED`, `USED`, `EXPIRED`) dan siapa yang mengaktifkannya.
5. **Daftar Bot ASTEN!**: Status polling/webhook, kontrol Start / Stop / Restart bot, serta pendaftaran bot baru via token.
6. **Manajemen Owner**: Detail, perpanjang lisensi, toggle status aktif/nonaktif, reset password, dan hapus.
7. **Riwayat Aktivasi**: Audit log aktivasi kode lisensi.
8. **Pengaturan Lisensi**: Kebijakan kedaluwarsa dan otomatisasi reminder H-7, H-3, H-1.
9. **Pengaturan Pembayaran**: Referensi metode pembayaran.
10. **Log Aktivitas**: Audit trail komprehensif sistem.
11. **Pengaturan Portal**: Informasi server dan database.

---

## 🛠️ Instalasi & Cara Menjalankan

### Persyaratan Sistem
* Node.js v20+ atau v24+ (Menggunakan modul native synchronous `node:sqlite`)
* npm

### Langkah Menjalankan
1. Masuk ke direktori proyek:
   ```bash
   cd c:\Users\ADVAN\Downloads\asten
   ```

2. Jalankan pengujian verifikasi sistem:
   ```bash
   npm test
   ```

3. Jalankan server ASTEN!:
   ```bash
   npm start
   ```

4. Buka browser dan akses **Portal Pemilik Bot ASTEN!**:
   ```
   http://localhost:3000
   ```

---

## 📁 Struktur Direktori
```
asten/
├── package.json
├── server.js                      # Bootstrap server & runner
├── .env / .env.example            # Konfigurasi lingkungan
├── data/
│   └── asten.db                   # Database SQLite (WAL Mode)
├── uploads/
│   ├── qris/                      # Folder upload barcode QRIS
│   └── products/                  # Folder upload foto produk
├── tests/
│   └── verify.js                  # Test suite verifikasi 13 modul
└── src/
    ├── config/                    # Konstanta & konfigurasi sistem
    ├── database/                  # Schema SQLite & db initializer
    ├── models/                    # Data Access Layer (Owner, Bot, Admin, Product, Tx, RNK, dll)
    ├── security/                  # AES-256-GCM, Bcrypt salted, session & lockout guard
    ├── services/                  # Telegram Bot API service, Expiration worker, RNK service
    ├── bot/
    │   ├── botManager.js          # Multi-bot lifecycle manager (Dynamic bot instances)
    │   ├── botInstance.js         # Telegraf engine builder
    │   └── handlers/              # Handlers untuk /start, /payment, /done, /rnk, /admin, dll
    ├── api/                       # REST API Express endpoints
    └── public/                    # Frontend Portal Pemilik Bot ASTEN! (HTML, CSS, JS)
```

---

*Dikembangkan secara profesional dan aman untuk ASTEN! (ASISTEN TENAGA!).*
