# Backup dan insiden data

Tujuan backup adalah mengembalikan data, bukan sekadar menghasilkan file.
Backup yang belum pernah diverifikasi dan diuji restore belum dapat dianggap
siap digunakan.

## Lapisan minimum untuk satu VPS

| Lapisan | Tujuan | Lokasi |
|---|---|---|
| Backup VPS Hostinger harian | Memulihkan keseluruhan mesin | Infrastruktur Hostinger, terpisah dari disk VPS |
| Backup database terenkripsi harian | Memulihkan data bisnis tanpa seluruh image VPS | Penyimpanan off-site independen |
| Arsip binary log | Point-in-time recovery dengan kehilangan data lebih kecil | Di luar VPS |
| Snapshot sebelum perubahan besar | Checkpoint sementara | Hostinger; bukan backup jangka panjang |
| Restore drill | Membuktikan backup benar-benar dapat dipakai | Lingkungan terisolasi |

Backup utama yang diprioritaskan adalah database reservasi, membership,
pembayaran, pengguna, admin, berita/artikel, audit, monitoring penting, dan
metadata media. File gambar/video besar mengikuti kebijakan object storage
terpisah dan tidak boleh membuat backup database gagal.

## Kebijakan sederhana yang aman

- backup database setiap malam;
- archive binlog secara berkala jika diaktifkan;
- enkripsi sebelum meninggalkan server;
- transfer melalui kanal terautentikasi;
- checksum setiap artifact;
- retention berjenjang agar storage tidak tumbuh tanpa batas;
- salinan off-site tidak dapat dihapus oleh credential aplikasi;
- alert jika backup terlambat, gagal, terlalu kecil, atau checksum berubah;
- restore drill rutin ke target yang tidak terhubung ke produksi.

Jangan menyimpan password database di nama file, argumen command yang mudah
terlihat process list, atau log. Gunakan file konfigurasi sementara berpermission
ketat atau secret manager sesuai tooling backup yang dipilih.

## Sebelum perubahan berisiko

Checklist wajib:

- [ ] backup terbaru selesai;
- [ ] ukuran masuk akal dibanding backup sebelumnya;
- [ ] checksum tercatat;
- [ ] artifact berada di luar VPS;
- [ ] retention/immutability aktif;
- [ ] recovery point dan database identity sesuai produksi;
- [ ] rollback aplikasi tersedia;
- [ ] operator mengetahui RPO dan RTO perubahan ini.

## Jika data tampak hilang

Jangan langsung restore. Lakukan urutan berikut:

1. hentikan perubahan baru yang tidak perlu;
2. catat waktu, release, database endpoint, dan gejala;
3. pastikan aplikasi tidak tersambung ke database/schema yang salah;
4. periksa apakah data hanya tidak tampil karena cache, permission, filter,
   migration, atau koneksi;
5. ambil snapshot/forensic copy sebelum tindakan pemulihan;
6. verifikasi backup pada lingkungan terisolasi;
7. bandingkan recovery point dengan transaksi terakhir yang diketahui;
8. restore ke target baru terlebih dahulu, bukan menimpa produksi;
9. lakukan cutover hanya dengan persetujuan dan rencana rollback.

Restore Hostinger atau restore database langsung ke produksi adalah tindakan
destruktif karena dapat menimpa kondisi terbaru. Assistant tidak boleh
menjalankannya hanya karena pengguna mengatakan “data hilang”.

## Jika disk hampir penuh

Jangan menghapus database, storage, backup, atau log secara acak.

1. ukur penggunaan per filesystem dan direktori;
2. cari sumber pertumbuhan;
3. pastikan log rotation dan retention bekerja;
4. pindahkan backup yang telah diverifikasi ke off-site;
5. prune hanya artifact disposable melalui prosedur resminya;
6. tambah kapasitas jika headroom tidak cukup.

## Jika database gagal

Pada single VPS, process supervisor dapat mencoba menghidupkan process database,
tetapi tidak dapat memperbaiki disk rusak, corruption, atau host mati.

- jangan menghapus `/var/lib/mysql`;
- jangan menyalin data directory saat MariaDB aktif;
- jangan menggunakan `--force-recovery` tanpa forensic copy dan prosedur DBA;
- jangan menginisialisasi database baru pada path produksi;
- gunakan emergency mode/provider console hanya setelah fakta dikumpulkan.

## Dokumen teknis lanjutan

Untuk strict recovery evidence, PITR, immutable backup, key rotation, restore
drill, dan break-glass procedure, gunakan:

- [`../DISASTER_RECOVERY_AND_OBSERVABILITY.md`](../DISASTER_RECOVERY_AND_OBSERVABILITY.md)
- [`../../deploy/recovery/README.md`](../../deploy/recovery/README.md)

Database replication tidak menggantikan backup. Kesalahan logis dapat langsung
terduplikasi ke replica.
