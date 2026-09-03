# Operasional produksi UBSC: mulai dari sini

Dokumen ini adalah pintu masuk resmi untuk memasang, memperbarui, memeriksa,
atau memulihkan UBSC pada server. Dokumen ini sengaja ditulis agar dapat
dipahami operator pemula dan automation assistant dari model apa pun.

Jangan mulai dari dokumen lain. Jangan langsung menjalankan perintah hanya
karena perintah tersebut terlihat umum untuk Laravel.

## Tujuan

Setelah membaca paket petunjuk ini, operator harus dapat:

1. mengetahui kondisi server tanpa mengubahnya;
2. memilih profil infrastruktur yang benar;
3. memasang rilis tanpa menebak konfigurasi;
4. menghentikan proses dengan aman ketika ada syarat yang belum terpenuhi;
5. membuktikan bahwa aplikasi, data, queue, backup, dan monitoring berfungsi;
6. melakukan rollback aplikasi tanpa merusak database.

## Aturan keselamatan yang tidak boleh ditawar

1. Jangan pernah menjalankan `php artisan migrate:fresh`, `db:wipe`,
   `migrate:reset`, `migrate:refresh`, atau perintah lain yang menghapus data.
2. Jangan pernah menghapus, mengganti, atau memindahkan direktori database,
   `storage`, backup, maupun release aktif sebelum target absolutnya diverifikasi.
3. Jangan pernah menjalankan `git reset --hard`, `git clean -fd`, atau operasi
   rekursif yang merusak pada server produksi.
4. Jangan menampilkan isi `.env`, password, token, private key, recovery code,
   cookie, header autentikasi, atau database dump pada chat dan log.
5. Jangan menaruh rahasia di repository. `.env.example` dan
   `deploy/production.env.example` hanya menjelaskan nama konfigurasi.
6. Jangan mengubah nilai pemeriksaan menjadi `true` hanya agar gate lulus.
   Nilai harus mewakili infrastruktur yang benar-benar tersedia dan telah diuji.
7. Sebelum migrasi, restore, perubahan database, atau perubahan firewall,
   pastikan ada backup yang masih baru dan dapat dibaca.
8. Jalankan satu perubahan dalam satu waktu. Periksa hasilnya sebelum lanjut.
9. Jika satu perintah gagal, berhenti. Jangan menambahkan `--force`, menghapus
   file, atau menonaktifkan pemeriksaan tanpa diagnosis dan persetujuan operator.
10. Aplikasi, queue worker, Composer, dan Node tidak boleh dijalankan sebagai
    `root`. Hak `root` hanya digunakan untuk paket OS, service, firewall, dan
    permission yang memang memerlukannya.

## Format kerja wajib untuk operator atau assistant

Sebelum memberikan perintah yang mengubah server, tulis lima bagian berikut:

```text
FAKTA SAAT INI
- Fakta yang sudah dibuktikan dari server.
- Fakta yang masih belum diketahui.

PROFIL
- SINGLE_VPS atau STRICT_HA.
- Alasan pemilihan profil.

RENCANA
- Perubahan kecil yang akan dilakukan sekarang.

RISIKO DAN PEMULIHAN
- Dampak terburuk yang realistis.
- Cara kembali ke kondisi sebelum perubahan.

PERINTAH
- Satu kelompok perintah terbatas.
- Hasil yang diharapkan dan kondisi yang mewajibkan berhenti.
```

Setelah perintah selesai, laporkan output penting tanpa rahasia, status lulus
atau gagal, dan gate berikutnya. Jangan mengarang hasil yang tidak terlihat.

## Pilih satu profil

| Kondisi nyata | Profil | Makna |
|---|---|---|
| Satu Hostinger VPS | `SINGLE_VPS` | Aman untuk peluncuran awal, tetapi bukan high availability |
| Minimal dua application node, load balancer HA, database writer dengan standby/failover, shared Redis/storage | `STRICT_HA` | Kontrak produksi lengkap dapat dijalankan |
| Kondisi belum diketahui | Belum boleh memilih | Selesaikan inventaris dahulu |

### Kontrak profil `SINGLE_VPS`

Satu VPS dapat memiliki keamanan aplikasi, concurrency, backup, restart proses,
dan monitoring yang kuat. Namun kerusakan VPS, jaringan provider, disk, atau
maintenance host tetap dapat menghentikan seluruh layanan.

Repository mendukung dua profil eksplisit. `SINGLE_VPS` menggunakan
`PRODUCTION_TOPOLOGY=single_node`; `STRICT_HA` menggunakan
`PRODUCTION_TOPOLOGY=multi_node`. Aplikasi tidak pernah menebak profil dari
jumlah server. Karena itu:

- jangan mengisi jumlah node `2` ketika hanya ada satu;
- jangan mengaku memiliki managed failover atau replica yang tidak ada;
- jangan menaruh primary dan replica database pada VPS yang sama;
- jangan mematikan kontrak hanya agar deployment terlihat berhasil;
- gunakan `deploy/single-node.env.example` untuk satu VPS;
- gunakan `deploy/production.env.example` hanya untuk infrastruktur multi-node;
- kemampuan HA, replication, fleet rollout, autoscaling, dan multi-failure-domain
  drill tetap terpasang tetapi standby pada `single_node`;
- mengubah profil ke `multi_node` membangunkan gate tersebut secara fail-closed:
  trafik tidak boleh masuk sebelum bukti infrastrukturnya lengkap.

**Mode tidak berpindah otomatis ketika VPS baru ditambahkan.** Operator harus
menyiapkan infrastrukturnya terlebih dahulu, lalu mengubah konfigurasi melalui
change dan rollout yang terkontrol. Sesudah pilihan eksplisit tersebut,
contract dan dispatcher memilih jalur yang benar secara otomatis. Ikuti
[`07-PERUBAHAN-MODE-INFRASTRUKTUR.md`](07-PERUBAHAN-MODE-INFRASTRUKTUR.md);
jangan hanya mengganti satu baris `.env` pada server yang sedang melayani
trafik.

Periksa profil yang benar-benar dibaca runtime dengan:

```bash
php artisan production:topology
php artisan production:check --strict --probe
```

## Urutan baca dan kerja

Ikuti urutan ini tanpa melompat:

1. [`01-INVENTARIS-SERVER.md`](01-INVENTARIS-SERVER.md) — kumpulkan fakta tanpa
   mengubah server.
2. Jika hanya satu VPS, baca
   [`02-HOSTINGER-SINGLE-VPS.md`](02-HOSTINGER-SINGLE-VPS.md).
3. Baca [`03-ALUR-DEPLOYMENT.md`](03-ALUR-DEPLOYMENT.md) sebelum membuat release.
4. Gunakan [`04-VERIFIKASI-DAN-ROLLBACK.md`](04-VERIFIKASI-DAN-ROLLBACK.md)
   untuk acceptance dan pemulihan versi aplikasi.
5. Terapkan [`05-BACKUP-DAN-INSIDEN-DATA.md`](05-BACKUP-DAN-INSIDEN-DATA.md)
   sebelum menerima data pengguna.
6. Jika ada masalah, gunakan
   [`06-TROUBLESHOOTING.md`](06-TROUBLESHOOTING.md); jangan menebak.
7. Sebelum menambah VPS atau berpindah topology, baca
   [`07-PERUBAHAN-MODE-INFRASTRUKTUR.md`](07-PERUBAHAN-MODE-INFRASTRUKTUR.md).

Untuk arsitektur `STRICT_HA`, dokumen teknis yang lebih dalam tetap menjadi
sumber kebenaran:

- [`../PRODUCTION_DEPLOYMENT_AND_EDGE.md`](../PRODUCTION_DEPLOYMENT_AND_EDGE.md)
- [`../PRODUCTION_RUNTIME_OPERATIONS.md`](../PRODUCTION_RUNTIME_OPERATIONS.md)
- [`../DATABASE_REPLICATION_OPERATIONS.md`](../DATABASE_REPLICATION_OPERATIONS.md)
- [`../DISASTER_RECOVERY_AND_OBSERVABILITY.md`](../DISASTER_RECOVERY_AND_OBSERVABILITY.md)
- [`../DDOS_RESPONSE_OPERATIONS.md`](../DDOS_RESPONSE_OPERATIONS.md)
- [`../RESILIENCE_ENGINEERING.md`](../RESILIENCE_ENGINEERING.md)

Jika panduan pemula dan verifier berbeda, ikuti verifier dan berhenti untuk
review. Jangan mengubah verifier agar cocok dengan asumsi operator.

## Empat fase yang harus selalu terlihat

```text
DISCOVER  ->  PREPARE  ->  ACTIVATE  ->  VERIFY
read-only     belum live    perubahan      bukti hasil
```

Tidak boleh masuk `ACTIVATE` jika `DISCOVER` atau `PREPARE` belum lulus.

## Definisi selesai

Deployment belum selesai hanya karena halaman utama terbuka. Selesai berarti:

- domain HTTPS menuju release yang dimaksud;
- `/up` dan `/health/ready` sesuai status yang diharapkan;
- database yang benar terhubung dan migrasi tercatat;
- login, reservasi, membership, dan admin tidak kehilangan data;
- queue worker dan scheduler berjalan di bawah process supervisor;
- backup terakhir terbukti berhasil dan tersimpan di luar VPS;
- monitoring eksternal dapat mendeteksi VPS mati;
- rollback aplikasi telah disiapkan;
- tidak ada rahasia dalam output, repository, atau log deployment.

## Instruksi singkat yang dapat diberikan kepada assistant

Salin isi [`OPERATOR-BRIEF.md`](OPERATOR-BRIEF.md), lalu minta assistant membaca
file dalam urutan di atas. Operator manusia tetap menjadi pihak yang menyetujui
migrasi, firewall, restore, failover, dan tindakan berisiko.
