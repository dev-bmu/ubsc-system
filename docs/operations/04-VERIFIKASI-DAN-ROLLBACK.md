# Verifikasi dan rollback

Tujuan verifikasi adalah membuktikan release benar-benar dapat melayani alur
UBSC. Membuka homepage saja tidak cukup.

Checklist ini dijalankan setelah profile runtime dipilih secara eksplisit dan
activation disetujui. Jangan menggunakan profile yang berbeda untuk melewati
gate yang gagal.

## Verifikasi berlapis

### 1. Process dan konfigurasi

```bash
php artisan about --only=environment
php artisan migrate:status
php artisan schedule:list
sudo supervisorctl status
systemctl --no-pager --failed
```

Hasil lulus:

- environment adalah production dan debug mati;
- tidak ada migrasi wajib yang masih pending;
- semua program UBSC yang diwajibkan berada pada status `RUNNING`;
- tidak ada service kritis yang gagal.

### 2. Dependency aplikasi

```bash
php artisan background-jobs:doctor --probe-backends
php artisan invoices:pdf:doctor --probe-storage
```

Untuk strict HA tambahkan semua command acceptance pada
[`../PRODUCTION_RUNTIME_OPERATIONS.md`](../PRODUCTION_RUNTIME_OPERATIONS.md).

Untuk single VPS jalankan verifier lengkap:

```bash
bash deploy/scripts/verify-single-node-readiness.sh /srv/ubsc/current
```

### 3. HTTP lokal dan publik

Gunakan origin HTTPS yang benar dan jangan menonaktifkan verifikasi TLS:

```bash
curl --fail --silent --show-error https://ubsportcenter.co.id/up
curl --fail --silent --show-error https://ubsportcenter.co.id/health/ready
```

Ganti domain hanya jika inventory menyatakan domain canonical berbeda. Jangan
menggunakan `curl -k` untuk membuat sertifikat yang salah terlihat berhasil.

Hasil lulus:

- `/up` menjawab `200`;
- `/health/ready` menjawab `200` ketika dependency wajib sehat;
- redirect tidak berputar;
- sertifikat valid untuk domain;
- response tidak membocorkan host internal, exception, atau credential.

### 4. Smoke test bisnis

Gunakan akun dan data uji resmi. Jangan membuat reservasi palsu pada slot nyata
tanpa prosedur pembersihan yang disetujui.

Periksa:

- homepage, about, pricing, booking, dan news dapat dibuka;
- login pengguna dan admin bekerja;
- MFA admin bekerja tanpa bypass;
- daftar fasilitas, tanggal, jam, dan membership terbaca;
- checkout uji mempertahankan idempotency;
- invoice uji dapat dibuat melalui queue;
- admin melihat data yang sama dengan sisi pengguna;
- file publik dan private storage menggunakan kontrol akses yang benar.

### 5. Operasional

Periksa:

- queue depth dan oldest-job age tidak terus meningkat;
- scheduler/heartbeat terbaru;
- tidak ada lonjakan error pada log terpusat;
- CPU, RAM, disk, inode, dan database connection berada di batas sehat;
- backup dan monitoring eksternal tetap aktif setelah deployment.

## Keputusan akhir

Gunakan salah satu status:

- `ACCEPTED`: semua gate wajib lulus.
- `DEGRADED`: aplikasi hidup tetapi ada kemampuan non-kritis terganggu; perlu
  persetujuan eksplisit dan batas waktu perbaikan.
- `REJECTED`: gate keamanan, data, readiness, migrasi, atau alur bisnis gagal.

Jangan menyebut `DEGRADED` sebagai `ACCEPTED` untuk mengejar jadwal.

## Kapan rollback aplikasi dilakukan

Rollback dipertimbangkan jika:

- error rate naik setelah release;
- login, reservasi, membership, admin, atau pembayaran uji gagal;
- queue menghasilkan kegagalan berulang;
- latency atau penggunaan resource menjadi tidak aman;
- aset utama hilang;
- konfigurasi release baru salah.

## Aturan rollback

1. Hentikan rollout node berikutnya jika memakai HA.
2. Catat release aktif, release tujuan rollback, migration batch, dan waktu.
3. Pastikan release lama kompatibel dengan schema database saat ini.
4. Arahkan `current` kembali ke release lama melalui mekanisme deployment
   resmi, bukan dengan menghapus release baru.
5. Reload PHP-FPM dan restart queue worker secara graceful.
6. Jalankan ulang seluruh verifikasi HTTP, dependency, dan bisnis.
7. Pertahankan release gagal untuk forensik sampai insiden ditutup.

Database tidak ikut di-rollback otomatis. Jika release lama tidak kompatibel
dengan schema baru, hentikan dan lakukan incident review; jangan menjalankan
`migrate:rollback` secara spontan.

## Bukti yang disimpan

- waktu deteksi dan keputusan;
- release/commit sebelum dan sesudah;
- gejala tanpa data sensitif;
- gate yang gagal;
- tindakan rollback;
- hasil verifikasi setelah rollback;
- tindak lanjut untuk mencegah pengulangan.
