# 🧾 Panduan Setup Printer & Shortcut Desktop - POS Kasir (Ubuntu Linux)

Panduan ini menjelaskan cara menghubungkan printer thermal RPP02N (Bluetooth/USB) dan cara membuat shortcut desktop agar aplikasi POS dapat dijalankan dengan mudah tanpa terminal.

---

## 📶 Bagian 1: Setup Printer Thermal Bluetooth RPP02N

Pada Linux/Ubuntu, printer Bluetooth menggunakan serial port virtual. Printer akan tersambung secara otomatis **hanya ketika Anda melakukan transaksi cetak**, lalu terputus kembali agar hemat baterai. Status *Disconnected* di menu utama Bluetooth Ubuntu adalah **normal**.

### Langkah 1: Hubungkan & Sandingkan (Pair & Trust)
1. Nyalakan printer Bluetooth RPP02N Anda.
2. Buka Terminal Ubuntu Anda dan jalankan perintah:
   ```bash
   bluetoothctl
   ```
3. Di dalam prompt `bluetoothctl`, ketik perintah berikut:
   ```bash
   power on
   agent on
   default-agent
   scan on
   ```
4. Tunggu hingga nama printer Anda muncul (misal: `RPP02N` atau `RT-Printer`) dan salin Alamat MAC-nya (misal: `00:1E:AC:02:11:AB`).
5. Lakukan penyandingan:
   ```bash
   pair 00:1E:AC:02:11:AB
   # (Jika meminta PIN, ketik: 1234 atau 0000)

   trust 00:1E:AC:02:11:AB
   exit
   ```

### Langkah 2: Ikat Bluetooth ke Virtual Port `/dev/rfcomm0`
Perintah ini memetakan printer Bluetooth Anda agar dikenali sistem sebagai port serial:
```bash
sudo rfcomm bind 0 00:1E:AC:02:11:AB 1
```

### Langkah 3: Berikan Izin Akses Dialout ke User Anda
Agar aplikasi kasir dapat mencetak tanpa perlu hak akses administrator (`sudo`):
```bash
sudo usermod -a -G dialout $USER
```
*Penting: Setelah menjalankan perintah ini, silakan **Log Out** dan **Log In** kembali ke Ubuntu.*

### Langkah 4: Uji Coba Cetak Bluetooth
Ketik perintah ini di terminal untuk mencoba printer:
```bash
echo -e "KASIR KASIR KASIR\nRPP02N BLUETOOTH OK\n\n\n" > /dev/rfcomm0
```
Printer Anda akan menyala, mencetak teks tersebut, lalu mati kembali secara otomatis.

---

## 🔌 Bagian 2: Setup Printer Thermal USB RPP02N

Jika suatu saat Anda ingin menggunakan kabel USB, ikuti langkah berikut:

### Langkah 1: Berikan Izin Akses Printer USB
```bash
sudo usermod -a -G lp,lpadmin $USER
```
*(Log Out dan Log In kembali setelah menjalankan perintah ini).*

### Langkah 2: Instal Driver POS-58 (Zijiang) via CMake
```bash
sudo apt update
sudo apt install cmake libcups2-dev libcupsimage2-dev build-essential -y

cd ~/zj-58
mkdir -p build && cd build
cmake -DCMAKE_POLICY_VERSION_MINIMUM=3.5 ..
make
sudo make install
```

### Langkah 3: Daftarkan di Browser CUPS
1. Akses **[http://localhost:631](http://localhost:631)** di browser Anda.
2. Pilih **Administration** -> **Add Printer** -> Pilih printer USB RPP02N Anda.
3. Di kolom **Make**, pilih **Zijiang**.
4. Di kolom **Model**, pilih **Zijiang ZJ-58 (en)**, lalu simpan.

---

## 🖥️ Bagian 3: Cara Membuat Aplikasi POS Tetap Terbuka & Membuat Shortcut Desktop

Agar aplikasi kasir tidak hilang tampilannya atau mati ketika jendela terminal ditutup, Anda dapat menjalankan versi produksi secara offline atau membuat shortcut desktop di Ubuntu.

### Metode A: Menjalankan Aplikasi POS Tanpa Server Dev (Vite)
Jika Anda sudah sukses menjalankan `npm run build`, Anda tidak perlu lagi menjalankan `npm run dev`. Anda bisa langsung membukanya secara instan dengan perintah:
```bash
npx electron . &
```
Tanda `&` di akhir perintah akan menjalankan aplikasi di latar belakang, sehingga terminal tetap bebas digunakan.

---

### Metode B: Membuat Shortcut Aplikasi di Desktop Ubuntu (Klik Ganda)
Anda bisa membuat file launcher agar aplikasi dapat dibuka dengan mengklik ikon seperti aplikasi biasa tanpa membuka terminal sama sekali:

1. Buat file baru bernama `pos-sembako.desktop` di folder Desktop Anda:
   ```bash
   nano ~/Desktop/pos-sembako.desktop
   ```

2. Tempelkan (paste) baris kode berikut ke dalamnya:
   ```ini
   [Desktop Entry]
   Name=POS Kasir Sembako
   Comment=Aplikasi Kasir Warung Sembako Offline-First
   Exec=npx electron /home/roidtaqi/Projects/retail-pos
   Icon=utilities-terminal
   Terminal=false
   Type=Application
   Categories=Office;Finance;
   ```
   *(Simpan file dengan menekan `Ctrl+O` lalu Enter, kemudian keluar dengan `Ctrl+X`).*

3. Berikan izin eksekusi pada file shortcut tersebut:
   ```bash
   chmod +x ~/Desktop/pos-sembako.desktop
   ```

4. Di layar Desktop Ubuntu Anda, klik kanan file `pos-sembako.desktop` tersebut, lalu pilih **"Allow Launching"** (Izinkan Peluncuran).

Sekarang Anda memiliki tombol pintas di desktop Anda. Cukup **klik ganda ikon tersebut**, dan aplikasi kasir Anda akan terbuka seketika dan tidak akan tertutup secara tidak sengaja!
