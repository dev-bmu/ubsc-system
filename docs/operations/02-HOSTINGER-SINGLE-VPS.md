# Profil Hostinger single VPS

Panduan ini untuk fase awal ketika UBSC hanya memiliki satu Hostinger VPS.
Profil ini dapat dibuat aman dan dapat dipulihkan, tetapi tidak boleh disebut
high availability atau zero downtime.

## Arsitektur yang diharapkan

```text
Pengguna
   |
Edge/CDN/WAF
   |
Hostinger firewall + firewall OS
   |
Nginx :443
   |
PHP-FPM -> Laravel
   |---- MariaDB pada localhost
   |---- Redis pada localhost
   |---- shared storage lokal
   |---- queue worker + scheduler di bawah Supervisor/systemd

Backup database terenkripsi ----------> penyimpanan off-site independen
Monitoring eksternal -----------------> memeriksa domain dari luar VPS
```

MariaDB dan Redis tidak boleh mendengarkan koneksi dari internet. Replikasi
database pada VPS yang sama tidak memberikan redundancy dan dilarang dianggap
sebagai failover.

## Kemampuan dan batas

| Kemampuan | Status single VPS |
|---|---|
| Transaksi dan anti-double-booking | Didukung oleh aplikasi/database |
| MFA, session security, CSRF/XSS/rate limit | Tetap wajib |
| Process auto-restart | Didukung melalui Supervisor/systemd |
| Backup dan restore | Wajib, dengan downtime ketika restore |
| VPS mati tetapi situs tetap aktif | Tidak didukung |
| Database failover otomatis | Tidak didukung |
| Rolling deployment lintas node | Tidak didukung |

## Prasyarat runtime

Versi final harus mengikuti lockfile repository dan dukungan OS. Minimum yang
dinyatakan project saat ini:

- Linux yang masih menerima security update;
- PHP `8.2` atau lebih baru yang kompatibel dengan `composer.lock`;
- PHP-FPM dan extension: `bcmath`, `ctype`, `curl`, `dom`, `fileinfo`, `gd`,
  `intl`, `mbstring`, `openssl`, `pdo_mysql`, `tokenizer`, `xml`, dan `zip`;
- Nginx;
- MariaDB/MySQL dengan InnoDB;
- Redis;
- Composer 2;
- Node/npm yang kompatibel dengan `package-lock.json` untuk proses build;
- Supervisor atau systemd untuk proses jangka panjang;
- `git`, `curl`, `unzip`, CA certificates, dan sinkronisasi waktu.

Assistant tidak boleh membuat perintah instalasi sebelum OS dan versinya
dibuktikan melalui inventaris. Gunakan package repository resmi OS; jangan
menjalankan installer acak dari internet.

## User dan direktori

Gunakan user non-root khusus, misalnya `ubsc`. Struktur yang disarankan:

```text
/srv/ubsc/
|-- releases/
|   `-- <immutable-release-id>/
|-- shared/
|   |-- .env
|   `-- storage/
`-- current -> /srv/ubsc/releases/<active-release-id>
```

Ketentuan:

- `.env` dan data runtime tidak berada di Git;
- setiap release bersifat immutable setelah aktif;
- `current` adalah symlink ke release aktif;
- `shared/storage` tidak dihapus ketika mengganti release;
- Nginx hanya melayani `/srv/ubsc/current/public`;
- user web dan worker hanya mendapat permission minimum yang diperlukan;
- private key, database dump, dan secret tidak boleh berada di dalam release.

## Firewall minimum

| Port | Sumber yang boleh | Catatan |
|---|---|---|
| `22/tcp` | IP/VPN operator | SSH key saja; password login dinonaktifkan setelah akses diuji |
| `80/tcp` | edge atau internet sementara | Hanya redirect ke HTTPS/challenge yang diperlukan |
| `443/tcp` | edge atau internet sesuai topology | Trafik aplikasi |
| `3306/tcp` | localhost | Jangan dipublikasikan |
| `6379/tcp` | localhost | Jangan dipublikasikan |

Gunakan firewall Hostinger dan firewall OS. Jangan mengaktifkan policy deny
sebelum rule SSH yang benar diuji pada sesi kedua; operator dapat mengunci
dirinya sendiri jika urutannya salah.

## Service yang wajib terus berjalan

- Nginx;
- PHP-FPM;
- MariaDB;
- Redis;
- Supervisor/systemd;
- queue worker sesuai lane pada template
  `deploy/supervisor/ubsc-database.conf.example`;
- Laravel scheduler dengan satu mekanisme saja;
- agent monitoring/log shipping jika digunakan.

Jangan menjalankan queue menggunakan terminal SSH biasa. Jangan menjalankan
dua scheduler berbeda yang mengeksekusi jadwal yang sama.

## Konfigurasi aplikasi

1. Buat `.env` produksi dari secret inventory, bukan dengan menyalin contoh
   secara mentah.
2. Gunakan `APP_ENV=production`, `APP_DEBUG=false`, URL HTTPS canonical, dan
   `APP_KEY` unik yang disimpan di secret manager/offline escrow.
3. Gunakan database user khusus aplikasi; jangan gunakan `root` database.
4. Gunakan password Redis dan bind localhost meskipun berada pada VPS sama.
5. Session, cache, dan queue dapat memakai Redis lokal untuk fase ini.
6. Pisahkan cache secara logis dari session/queue dan tetapkan memory policy
   yang tidak membuang session atau queued job.
7. Konfigurasi mail, object storage, Google auth, passkey, webhook, dan key ring
   hanya jika credential sebenarnya tersedia.
8. Jangan memberi nilai palsu pada `DB_HA_*`, `DB_REPLICATION_*`,
   `LOAD_BALANCER_*`, atau `PRODUCTION_APP_INSTANCES`.

## Kontrak repository untuk satu VPS

Gunakan `deploy/single-node.env.example` sebagai daftar konfigurasi non-rahasia
yang wajib dilengkapi. Runtime akan memilih kontrak `single_node` secara
eksplisit dan tetap memeriksa database, Redis, storage persisten, deployment,
edge, backup, PITR, restore drill, monitoring, serta process supervision.

Jangan:

- mengubah `PRODUCTION_APP_INSTANCES=2` untuk menyamarkan satu VPS;
- menyatakan database managed/replicated jika database berjalan lokal;
- menonaktifkan seluruh kontrak secara diam-diam;
- mengedit verifier di server agar berwarna hijau.

Validasi dan aktivasi resmi:

```bash
php artisan production:topology
php artisan production:check --strict --probe
bash deploy/scripts/activate-production-topology.sh \
  /srv/ubsc \
  /srv/ubsc/releases/<NEW_RELEASE> \
  <NEW_RELEASE>
```

Dispatcher membaca profil dari candidate release. Ia menggunakan rollout
single-node atomik saat profilnya `single_node` dan workflow rolling lama saat
profilnya `multi_node`. Jangan memanggil script internal profil yang berbeda.
Rollout single-node rutin mensyaratkan symlink `current` yang sudah menunjuk
baseline sehat; bootstrap pertama dilakukan saat origin masih tertutup sesuai
bagian "Bootstrap release pertama" pada
[`03-ALUR-DEPLOYMENT.md`](03-ALUR-DEPLOYMENT.md).

## Backup dan monitoring wajib

- aktifkan backup VPS harian Hostinger;
- buat backup database terenkripsi ke tujuan di luar VPS setiap malam;
- arsipkan binlog ke luar VPS jika target kehilangan data lebih kecil dari satu
  hari;
- simpan setidaknya satu salinan dengan retention/immutability terpisah;
- lakukan restore drill ke database terisolasi;
- gunakan monitoring eksternal untuk `/up`, `/health/ready`, dan halaman utama;
- kirim hasil probe eksternal melalui endpoint ingest bertanda tangan dengan
  key khusus monitor; flag konfigurasi tanpa heartbeat segar tidak dianggap
  bukti availability;
- aktifkan peringatan CPU, RAM, disk, inode, load, OOM, database, Redis, queue,
  backup gagal, dan sertifikat TLS.

Detail data ada di
[`05-BACKUP-DAN-INSIDEN-DATA.md`](05-BACKUP-DAN-INSIDEN-DATA.md).

## Kapan wajib meningkatkan infrastruktur

Naikkan dari single VPS apabila salah satu kondisi berikut terjadi:

- downtime reservasi sudah tidak dapat diterima bisnis;
- resource mendekati batas secara berulang;
- queue delay atau p95 latency melampaui target;
- backup/restore tidak memenuhi RPO atau RTO;
- maintenance provider harus dapat dilakukan tanpa menghentikan situs;
- satu insiden VPS akan menyebabkan kerugian operasional yang berarti.

VPS yang lebih besar meningkatkan kapasitas, bukan availability. Untuk
availability, tambahkan failure domain: application node kedua, load balancer,
database dengan standby/failover, dan state bersama.

Menambahkan VPS atau layanan tersebut tidak mengubah mode aplikasi secara
otomatis. Tetap gunakan `PRODUCTION_TOPOLOGY=single_node` sampai seluruh
infrastruktur multi-node selesai dibuat, diuji, dan lolos gate. Prosedur resmi
untuk mengaktifkan `multi_node` terdapat di
[`07-PERUBAHAN-MODE-INFRASTRUKTUR.md`](07-PERUBAHAN-MODE-INFRASTRUKTUR.md).
