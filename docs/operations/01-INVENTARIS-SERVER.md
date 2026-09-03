# Inventaris server sebelum deployment

Tujuan tahap ini hanya mengumpulkan fakta. Tidak boleh menginstal paket,
memulai service, mengubah firewall, memindahkan file, atau menjalankan migrasi.

## 1. Data yang harus diberikan operator manusia

Jangan menulis nilai rahasia. Gunakan nama secret atau tulis `tersedia`.

| Data | Nilai yang harus diisi |
|---|---|
| Provider | Hostinger VPS |
| Lingkungan | production / staging |
| Domain publik | contoh: `https://ubsportcenter.co.id` |
| Lokasi VPS | contoh: Indonesia |
| Sistem operasi dan versi | belum diketahui / nilai sebenarnya |
| vCPU | nilai sebenarnya |
| RAM | nilai sebenarnya |
| Disk dan ruang kosong | nilai sebenarnya |
| User deployment non-root | nama user |
| Direktori aplikasi | rekomendasi `/srv/ubsc` |
| Commit/release yang dipasang | immutable commit SHA atau release ID |
| Edge/CDN/WAF | provider dan status |
| DNS dikelola oleh | provider |
| Database | lokal pada VPS / managed external |
| Redis | lokal pada VPS / managed external |
| Object storage | provider atau `belum tersedia` |
| SMTP | provider atau `belum tersedia` |
| Backup Hostinger harian | aktif / tidak aktif / belum diketahui |
| Backup database off-site | tujuan backup atau `belum tersedia` |
| Monitoring eksternal | provider atau `belum tersedia` |
| IP/VPN operator untuk SSH | tersedia / belum tersedia |

## 2. Pemeriksaan read-only

Jalankan per kelompok dan baca hasilnya. Jangan menggabungkannya dengan
perintah instalasi atau perbaikan.

### Identitas dan resource host

```bash
id
hostnamectl
cat /etc/os-release
nproc
free -h
df -h
timedatectl
```

Hasil yang dicatat: OS, hostname, user aktif, vCPU, RAM, penggunaan disk, dan
sinkronisasi waktu. Jangan menyalin hostname/IP privat ke kanal publik.

### Runtime yang sudah tersedia

```bash
php -v
composer --version
node --version
npm --version
nginx -v
mysql --version
redis-server --version
supervisord --version
```

Kegagalan `command not found` pada tahap ini bukan alasan langsung untuk
instalasi. Catat sebagai `belum tersedia`.

### Service dan port

```bash
systemctl --no-pager --type=service --state=running
ss -lntup
```

Jangan membagikan output lengkap jika memuat IP internal. Yang perlu dicatat:

- apakah Nginx/PHP-FPM/MariaDB/Redis/Supervisor sudah berjalan;
- apakah port `3306` dan `6379` hanya terikat pada loopback/private interface;
- apakah port yang tidak dikenal terbuka ke internet.

### Repository dan release

Jalankan hanya setelah direktori repository dipastikan benar:

```bash
pwd
git rev-parse --show-toplevel
git status --short
git rev-parse HEAD
```

Working tree yang kotor pada server adalah kondisi berhenti. Jangan menghapus
perubahan tersebut; cari pemiliknya dan tentukan apakah server menggunakan
deployment berbasis release atau pernah diedit secara manual.

## 3. Klasifikasi hasil

Berikan status pada setiap item:

- `PASS`: fakta sesuai kebutuhan.
- `MISSING`: belum tersedia dan harus dipasang/disediakan.
- `UNKNOWN`: belum dapat dibuktikan.
- `BLOCKED`: berbahaya untuk lanjut.

Contoh laporan:

```text
PROFILE CANDIDATE: SINGLE_VPS
PASS    OS dan resource berhasil diinventarisasi
PASS    user deployment non-root tersedia
MISSING Supervisor
UNKNOWN backup database off-site
BLOCKED port MariaDB terbuka ke internet

KEPUTUSAN: jangan deploy; tutup blocker dahulu melalui change terpisah.
```

## 4. Kondisi yang mewajibkan berhenti

- target server atau domain belum pasti;
- perintah berjalan sebagai `root` tanpa alasan yang jelas;
- disk hampir penuh;
- waktu server tidak tersinkronisasi;
- repository kotor atau release ID tidak diketahui;
- database/Redis terbuka ke internet;
- tidak ada backup sebelum migrasi;
- `.env` lama tidak diketahui pemilik dan asalnya;
- operator meminta assistant menebak secret, topology, atau alamat service;
- server ternyata sudah melayani produksi dan perubahan belum memiliki rollback.

Setelah inventaris lengkap, pilih profil di
[`00-START-HERE.md`](00-START-HERE.md), lalu lanjut ke panduan profil tersebut.
