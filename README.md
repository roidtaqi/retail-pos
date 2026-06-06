# Offline-First Retail POS (Kasir) Desktop Application

Aplikasi POS (Kasir) desktop yang dirancang khusus untuk toko retail / warung sembako UMKM skala besar (2000+ SKU) dengan pendekatan **Offline-First**. Transaksi kasir tetap berjalan lancar tanpa koneksi internet dan tersinkronisasi secara otomatis saat online.

---

## Tech Stack & Architecture
- **Desktop Shell**: Electron
- **Frontend SPA**: React, TypeScript, Vite
- **Local Database**: SQLite (`better-sqlite3` native Node package)
- **Visual Design**: Neumorphic / Soft UI dengan custom Vanilla CSS.
- **IPC Bridge**: ContextBridge (`preload.js`) yang mengisolasi database lokal & hardware dari context browser.

---

## Fitur Utama MVP
1. **Local Authentication & Quick PIN Login**: Dropdown pilihan kasir dengan input numeric PIN laci kasir.
2. **Keyboard-First & Barcode-Scanner-First**: 
   - Bidang input barcode/search selalu *auto-focused* di layar transaksi utama.
   - Shortcut keyboard penuh (F1 - F9, Escape, Delete, Arrows) untuk meminimalkan perpindahan ke mouse.
3. **Smart Product Search**: Pencarian nama, barcode, atau SKU dengan navigasi tombol panah (Up/Down) & Enter.
4. **Shift Kasir (Kas Masuk/Keluar)**: Pencatatan modal awal (modal kas laci), uang masuk/keluar operasional (cash in/out), dan audit selisih kas saat tutup shift.
5. **Inventory Ledger (Stock Cards)**: Setiap transaksi penjualan atau penyesuaian stok langsung mendokumentasikan saldo kartu stok secara otomatis.
6. **Simulasi Printer Thermal**: Mencetak struk ESC/POS ke format text file simulasi (`receipt_simulation.txt`) di folder project.
7. **Offline-First Sync Queue**: Semua mutasi data tersimpan secara lokal ke SQLite secara atomik dengan *idempotency key*. Background worker melakukan sync otomatis saat status online terdeteksi.

---

## Keyboard Shortcuts Map (POS Screen)

| Tombol Pintas | Aksi / Fungsi |
|---|---|
| **`F1`** | Fokuskan kursor ke input scan barcode / cari produk |
| **`F2`** | Edit quantity item yang dipilih di keranjang |
| **`F3`** | Berikan diskon produk per item (nominal Rp) |
| **`F4`** | Berikan diskon transaksi/keranjang (nominal Rp) |
| **`F5`** | Buka menu Bayar / Pembayaran tunai (Checkout) |
| **`F6`** | Buka modul Shift Kasir (Buka/Tutup shift, Cash in/out) |
| **`F7`** | Simulasi Toggle Koneksi Internet (Online / Offline) |
| **`F8`** | Buka Laporan & Dashboard Penjualan Harian |
| **`F9`** | Buka Master Database Produk & Impor CSV |
| **`↑` / `↓`** | Pindahkan highlight baris produk di dalam keranjang belanja |
| **`Delete` / `Backspace`** | Hapus item terpilih dari keranjang belanja |
| **`Escape`** | Tutup/Batal dialog/modal yang sedang aktif |

---

## Skema Database SQLite (MVP)

1. `users`: Menyimpan kredensial kasir/admin dan PIN numerik.
2. `products`: Tabel master produk dengan indeks khusus pada `barcode` & `sku` demi efisiensi scan.
3. `shifts`: Melacak waktu buka/tutup laci kasir serta modal kas awal vs nominal kas laci akhir.
4. `shift_transactions`: Pencatatan kas masuk/keluar operasional.
5. `sales` & `sale_items`: Transaksi penjualan utama yang disimpan secara atomik.
6. `stock_cards`: Kartu stok log audit masuk-keluar barang per SKU.
7. `sync_events`: Antrean sync lokal (Outbox Queue) untuk melacak pending sync payload dan idempotency key.

---

## Panduan Setup & Cara Menjalankan

### Persyaratan Sistem
- Node.js versi 18 atau lebih baru.
- Compiler C++ lokal (untuk membuild native modules `better-sqlite3`).

### 1. Install Dependencies
Buka terminal di root direktori project dan jalankan:
```bash
npm install
```

### 2. Jalankan Aplikasi dalam Mode Pengembangan (Dev Mode)
Jalankan dev server Vite beserta Electron shell:
```bash
npm run dev
```

### 3. Build & Packaging Desktop App (Windows/Mac/Linux)
Lakukan kompilasi assets dan bundel menjadi installer executable standalone:
```bash
# Compile TypeScript dan build files ke dist
npm run build

# Bundel menjadi installer Electron desktop app (.exe, .dmg, .deb)
npm run electron:build
```

---

## Format Impor CSV Produk (2000+ SKU)

Untuk mengimpor data produk dalam skala besar, salin teks berformat CSV dengan susunan header kolom berikut pada menu Database Produk (`F9`):

```csv
sku,name,barcode,category,sell_price,cost_price,stock
BRS006,Beras Cianjur Cap Pandan 5kg,8990001000060,Beras & Pokok,80000,72000,40
MYK006,Minyak Fortune Pouch 2L,8990001000077,Minyak & Margarin,37000,33000,50
MIE008,Indomie Goreng Rendang,8990001000084,Mie & Instan,3500,2900,100
```
