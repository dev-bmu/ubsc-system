# Alur deployment UBSC

Dokumen ini menjelaskan urutan deployment. Ia tidak memberi izin untuk
menjalankan deployment sebelum inventaris, backup, dan profile selection lulus.

## Prinsip utama

- Build satu kali, deploy artifact yang sama.
- Release diberi immutable ID, idealnya Git commit SHA.
- `.env`, upload, storage, dan log durable berada di luar direktori release.
- Migrasi harus backward-compatible dengan release lama selama cutover.
- Database tidak pernah di-rollback otomatis bersama source code.
- Deployment gagal harus mempertahankan release aktif sebelumnya.

## Fase 0 — persetujuan perubahan

Catat:

```text
CHANGE_ID:
OPERATOR:
PROFILE: SINGLE_VPS / STRICT_HA
TARGET_HOSTS:
SOURCE_COMMIT:
CURRENT_RELEASE:
NEW_RELEASE:
BACKUP_ID_DAN_WAKTU:
ROLLBACK_RELEASE:
MAINTENANCE_WINDOW:
```

Jangan lanjut jika source commit, target host, backup, atau rollback release
belum diketahui.

Jika change juga mengubah `PRODUCTION_TOPOLOGY`, ikuti dahulu
[`07-PERUBAHAN-MODE-INFRASTRUKTUR.md`](07-PERUBAHAN-MODE-INFRASTRUKTUR.md).
Mode tidak dideteksi otomatis dari jumlah VPS dan tidak boleh diganti langsung
pada konfigurasi aktif di luar change topology yang disetujui.

## Fase 1 — siapkan artifact

Preferred path adalah menghasilkan artifact lengkap di CI, bukan pada VPS
kecil:

1. checkout commit yang disetujui;
2. jalankan test dan required checks;
3. jalankan `composer install` untuk dependency production dan sertakan
   direktori `vendor` yang tervalidasi dalam artifact;
4. jalankan `npm ci` lalu `npm run build`;
5. pastikan post-build verifier lulus;
6. kemas artifact dengan release ID dan checksum;
7. kirim artifact melalui kanal deployment yang terautentikasi.

Artifact production yang direkomendasikan sudah membawa dependency PHP dan
frontend build. Dengan demikian Composer/Node tidak perlu mengeksekusi source
release menggunakan secret production pada VPS.

Jika frontend terpaksa dibangun pada VPS, periksa RAM/disk dahulu dan jangan
menjalankannya sebagai root. Build Node dapat menekan resource database dan
aplikasi; lakukan di luar jam sibuk dan hentikan jika terjadi OOM atau disk
pressure.

Jangan gunakan `composer setup` pada produksi. Script tersebut ditujukan untuk
bootstrap development dan dapat membuat `.env`, menghasilkan key, menjalankan
migrasi, serta memasang dependency frontend dalam satu langkah.

Jika dependency PHP terpaksa dipasang pada VPS, jangan mengarang urutannya.
`composer install` project ini menjalankan Artisan package discovery; runtime
production yang belum memenuhi contract dapat menolaknya. Gunakan artifact CI
atau prosedur maintainer yang secara eksplisit menangani Composer scripts.

## Fase 2 — buat release baru tanpa mengubah trafik

Release baru ditempatkan di:

```text
/srv/ubsc/releases/<NEW_RELEASE>
```

Sebelum menjalankan Composer atau Artisan:

- pastikan path absolut berada di bawah `/srv/ubsc/releases`;
- pastikan release ID sama dengan artifact/commit yang disetujui;
- pastikan direktori bukan target symlink `current`;
- pastikan checksum artifact sesuai;
- gunakan user deployment non-root.

Kemudian:

1. pastikan dependency production dari artifact sesuai lockfile;
2. tautkan `.env` dari `/srv/ubsc/shared/.env`;
3. tautkan storage persistent dari `/srv/ubsc/shared/storage`;
4. pastikan `bootstrap/cache` dan direktori runtime memiliki permission minimum;
5. pastikan `public/build/manifest.json` dan aset wajib tersedia;
6. jalankan pemeriksaan konfigurasi read-only hanya setelah profil runtime yang
   dipilih memang didukung aplikasi.

Jangan mencetak nilai environment ketika memeriksa konfigurasi.

## Fase 3 — pre-activation gate

Setelah profil runtime didukung dan konfigurasinya lengkap, minimal yang harus
dibuktikan:

```bash
php artisan about --only=environment
php artisan migrate:status
php artisan schedule:list
php artisan background-jobs:doctor --probe-backends
php artisan invoices:pdf:doctor --probe-storage
```

Perintah dapat menulis probe sementara yang dirancang aman, tetapi tidak boleh
mengubah data bisnis. Jika salah satu gagal, release belum boleh aktif.

Tambahkan gate topology-aware berikut untuk kedua profil:

```bash
php artisan production:topology
php artisan production:check --strict --probe
```

Pada `SINGLE_VPS`, bukti recovery operasional juga wajib lulus:

```bash
php artisan production:single-recovery-check
```

Untuk `STRICT_HA`, ikuti seluruh gate pada
[`../PRODUCTION_DEPLOYMENT_AND_EDGE.md`](../PRODUCTION_DEPLOYMENT_AND_EDGE.md)
dan [`../PRODUCTION_RUNTIME_OPERATIONS.md`](../PRODUCTION_RUNTIME_OPERATIONS.md).

## Fase 4 — migrasi

Sebelum migrasi:

1. verifikasi backup database terbaru berada di luar VPS;
2. verifikasi backup dapat dibaca dan checksum cocok;
3. review SQL/migration pada staging clone;
4. pastikan perubahan schema backward-compatible;
5. pastikan tidak ada migrasi destruktif tanpa prosedur dua tahap;
6. catat siapa yang memberi persetujuan.

Perintah produksi yang diizinkan setelah semua gate lulus adalah:

```bash
php artisan migrate --force --isolated --no-interaction
```

Kegagalan migrasi adalah kondisi berhenti. Jangan menjalankan rollback database
otomatis dan jangan mengedit tabel secara manual untuk memaksa status migrasi.

## Fase 5 — activation

Gunakan satu entry point untuk kedua profil:

```bash
bash deploy/scripts/activate-production-topology.sh \
  /srv/ubsc \
  /srv/ubsc/releases/<NEW_RELEASE> \
  <NEW_RELEASE>
```

Dispatcher membaca topology candidate melalui Laravel. Untuk `SINGLE_VPS`, ia
memeriksa symlink `.env`/storage, mengunci deployment, mempersiapkan cache dan
menjalankan migrasi expand-compatible saat release lama masih melayani trafik,
baru memindahkan `current` secara atomik. Sesudah switch, ia me-reload runtime,
menunggu seluruh worker/heartbeat sehat, dan mengembalikan aplikasi ke release
lama bila activation gagal tanpa membalik database secara buta.

### Bootstrap release pertama

Dispatcher sengaja menolak jika `/srv/ubsc/current` belum berupa symlink ke
release lama yang diketahui sehat. Pada instalasi pertama belum ada rollback
target, sehingga menyamakan bootstrap dengan deployment rutin akan memberi
rasa aman palsu.

Bootstrap pertama harus dilakukan dalam kondisi origin belum menerima trafik
publik, melalui change record tersendiri, setelah database/Redis, shared
storage, backup off-site, PITR, restore drill, dan monitoring eksternal sudah
dibuktikan. Setelah release bootstrap lulus `/health/ready`, tetapkan release
itu sebagai baseline `current`, simpan ID/checksum-nya, lalu gunakan dispatcher
untuk seluruh deployment berikutnya. Jangan mengakali penolakan script dengan
membuat symlink palsu atau menonaktifkan contract; jika tidak ada baseline,
operator hosting harus mengikuti inventaris dan checklist bootstrap pada
runbook ini sebelum membuka origin/DNS.

Untuk `STRICT_HA`, dispatcher mempertahankan workflow rolling/drain yang sudah
ada beserta HA, replication, recovery, capacity, dan resilience evidence gate.

## Fase 6 — verifikasi setelah activation

Jalankan checklist pada
[`04-VERIFIKASI-DAN-ROLLBACK.md`](04-VERIFIKASI-DAN-ROLLBACK.md).
Jangan menghapus release lama sebelum retention deployment terpenuhi dan
release baru stabil.

## Rekaman deployment

Simpan rekaman yang tidak mengandung rahasia:

```text
CHANGE_ID
release lama dan baru
commit SHA
waktu mulai dan selesai dalam UTC
operator/approver
backup ID
hasil setiap gate
migration batch
health status
rollback release
insiden atau warning
```

Rekaman deployment harus berada di sistem audit/operations, bukan di dalam
`.env` atau chat yang memuat credential.
