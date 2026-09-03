# Troubleshooting produksi UBSC

Gunakan diagnosis read-only terlebih dahulu. Satu gejala tidak membuktikan satu
penyebab tertentu.

## Format laporan masalah

```text
WAKTU UTC:
LINGKUNGAN:
DOMAIN:
RELEASE/COMMIT:
GEJALA:
MULAI SETELAH PERUBAHAN APA:
JUMLAH PENGGUNA TERDAMPAK:
STATUS /up:
STATUS /health/ready:
SERVICE YANG GAGAL:
ERROR ID / REQUEST ID:
BACKUP TERBARU:
TINDAKAN YANG SUDAH DICOBA:
```

Jangan menempelkan `.env`, cookie, token, password, private key, atau stack
trace yang berisi data pengguna.

## Halaman blank, 500, atau 502

Periksa berurutan:

```bash
systemctl --no-pager status nginx
systemctl --no-pager status php*-fpm
sudo supervisorctl status
df -h
free -h
```

Lalu baca log dalam jendela waktu kecil dan sanitasi hasil sebelum dibagikan.
Jangan mengubah permission menjadi `777`, jangan mematikan security middleware,
dan jangan mengaktifkan `APP_DEBUG=true` pada produksi.

Kemungkinan kelas penyebab:

- PHP-FPM mati atau socket berbeda;
- release/symlink tidak lengkap;
- `public/build/manifest.json` hilang;
- config cache dibuat dari `.env` yang salah;
- dependency belum terpasang;
- disk/RAM habis;
- Nginx tidak dapat membaca release.

## `/up` hidup tetapi `/health/ready` gagal

Artinya process aplikasi menjawab tetapi dependency wajib belum siap. Untuk
kedua profil, periksa:

```bash
php artisan production:check --strict --probe
php artisan background-jobs:doctor --probe-backends
php artisan invoices:pdf:doctor --probe-storage
```

Pada `SINGLE_VPS`, tambahkan `php artisan production:single-recovery-check`.
Pada `STRICT_HA`, lanjutkan dengan HA, replication, recovery, capacity, dan
resilience verifier. Jangan menonaktifkan check untuk menyembunyikan dependency
yang tidak tersedia.

## Login admin ditolak

Periksa tanpa mengubah akun:

- domain dan HTTPS canonical;
- waktu server tersinkronisasi;
- session/Redis tersedia;
- cookie domain dan trusted proxy benar;
- akun aktif dan role masih tersedia;
- MFA/passkey origin sama dengan domain produksi;
- rate limit atau security incident aktif.

Jangan reset password/MFA, mengubah database user, atau menonaktifkan security
hanya sebagai percobaan pertama. Gunakan command recovery resmi dan audit trail
setelah identitas operator diverifikasi.

## Data tidak tampil

Pertama buktikan aplikasi menggunakan database yang benar tanpa mencetak
credential. Periksa release, environment, database identity yang disanitasi,
migration status, filter UI, permission, dan cache.

Jangan menjalankan seeder, import, restore, `migrate:fresh`, atau menyalin folder
database. Ikuti prosedur “Jika data tampak hilang” pada
[`05-BACKUP-DAN-INSIDEN-DATA.md`](05-BACKUP-DAN-INSIDEN-DATA.md).

## Queue lambat atau stuck

```bash
sudo supervisorctl status
php artisan background-jobs:doctor --probe-backends
php artisan background-jobs:capacity-plan
```

Periksa oldest-job age, retry/failure, koneksi backend, heartbeat worker, CPU,
RAM, dan database latency. Jangan menambah worker tanpa capacity headroom;
terlalu banyak worker dapat menjatuhkan database dan web tier.

## Disk hampir penuh

```bash
df -h
df -i
sudo du -x --max-depth=1 /var 2>/dev/null | sort -n
sudo du -x --max-depth=1 /srv 2>/dev/null | sort -n
```

Perintah di atas hanya mengukur. Setelah sumber ditemukan, gunakan retention
dan prune command resmi. Jangan menjalankan recursive delete berdasarkan glob
atau path yang belum diverifikasi.

## Deployment gate gagal

Gate yang gagal adalah perlindungan, bukan hambatan yang harus dilewati.

1. catat command dan exit code;
2. identifikasi check pertama yang gagal;
3. bedakan missing infrastructure, stale evidence, dependency outage, dan
   configuration mismatch;
4. perbaiki sumber masalah melalui change terpisah;
5. jalankan ulang mulai dari gate terkait;
6. jangan edit script/verifier pada server.

## Kapan eskalasi wajib

Eskalasi ke maintainer/DBA/provider jika:

- database corruption atau filesystem error dicurigai;
- data pengguna berubah/hilang;
- host tidak dapat diakses;
- credential atau session mungkin bocor;
- DDoS melewati kapasitas edge;
- restore/failover diperlukan;
- migrasi gagal setelah sebagian schema berubah;
- operator tidak dapat membuktikan target command dengan pasti.

Paket eskalasi harus berisi timeline, release ID, request/error ID, status
service, metrik, gate yang gagal, dan tindakan yang sudah dilakukan—tanpa
credential atau data pribadi.
