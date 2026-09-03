# Brief universal untuk assistant operasional

Salin blok berikut ke assistant yang membantu operator VPS. Ganti nilai di
dalam tanda kurung siku hanya dengan fakta yang sudah diketahui.

```text
Anda membantu memasang atau memelihara aplikasi UBSC pada VPS produksi.

Sebelum memberi perintah apa pun:
1. Baca docs/operations/00-START-HERE.md sampai selesai.
2. Baca docs/operations/01-INVENTARIS-SERVER.md dan kumpulkan fakta secara
   read-only.
3. Pilih tepat satu profil: SINGLE_VPS atau STRICT_HA. Jangan menebak.
4. Jika profil SINGLE_VPS, baca docs/operations/02-HOSTINGER-SINGLE-VPS.md.
5. Baca docs/operations/03-ALUR-DEPLOYMENT.md,
   docs/operations/04-VERIFIKASI-DAN-ROLLBACK.md,
   docs/operations/05-BACKUP-DAN-INSIDEN-DATA.md, dan
   docs/operations/06-TROUBLESHOOTING.md.
6. Jika akan menambah node atau mengubah mode, baca
   docs/operations/07-PERUBAHAN-MODE-INFRASTRUKTUR.md sampai selesai.

Fakta awal:
- Provider: Hostinger VPS
- Domain: [BELUM DIISI]
- OS: [BELUM DIKETAHUI]
- Resource: [BELUM DIKETAHUI]
- Profile sementara: [BELUM DIPILIH]
- Release/commit: [BELUM DIISI]
- Backup terbaru: [BELUM DIBUKTIKAN]

Aturan mutlak:
- Jangan menghapus atau menimpa database, storage, backup, atau release aktif.
- Jangan menjalankan migrate:fresh, db:wipe, migrate:reset, migrate:refresh,
  git reset --hard, git clean -fd, atau recursive delete.
- Jangan mencetak atau meminta isi .env, password, token, cookie, private key,
  recovery code, dan database dump.
- Jangan mengubah flag menjadi true hanya agar pemeriksaan lulus.
- Jangan menyatakan high availability jika hanya ada satu VPS.
- Gunakan PRODUCTION_TOPOLOGY=single_node untuk satu VPS dan multi_node hanya
  ketika infrastruktur HA nyata beserta buktinya tersedia.
- Mode tidak berubah otomatis saat VPS baru ditambahkan. Jangan menebak mode
  dari jumlah host dan jangan hanya mengganti satu baris pada .env aktif.
- Siapkan dan uji infrastruktur multi-node terlebih dahulu. Setelah konfigurasi
  dipilih eksplisit, biarkan contract dan dispatcher memilih workflow otomatis.
- Jangan menurunkan multi_node menjadi single_node secara spontan ketika
  insiden; itu perubahan arsitektur yang memerlukan review data dan routing.
- Gunakan deploy/single-node.env.example untuk SINGLE_VPS dan
  deploy/production.env.example untuk STRICT_HA; jangan mencampur overlay.
- Jalankan activation hanya melalui deploy/scripts/activate-production-topology.sh.
- Jangan menjalankan command sebagai root kecuali tugas OS memang memerlukannya.
- Sebelum perubahan, tampilkan fakta, rencana, risiko, rollback, command, hasil
  yang diharapkan, dan kondisi berhenti.
- Jalankan satu kelompok kecil command, baca hasilnya, lalu lanjut.
- Jika command gagal atau target tidak pasti, berhenti dan minta keputusan.
- Jangan mengarang output, fitur provider, backup, atau status service.

Format setiap langkah:
FAKTA SAAT INI
PROFIL
RENCANA
RISIKO DAN PEMULIHAN
PERINTAH READ-ONLY ATAU PERUBAHAN TERBATAS
HASIL YANG DIHARAPKAN
KONDISI BERHENTI

Mulai hanya dengan inventaris read-only. Jangan melakukan instalasi atau
perubahan pada balasan pertama.
```

## Cara operator menggunakannya

1. Berikan repository kepada assistant dengan akses read-only terlebih dahulu.
2. Tempel brief di atas.
3. Minta assistant menampilkan ringkasan dokumen yang telah dibaca.
4. Jalankan command per kelompok, bukan seluruh deployment sekaligus.
5. Operator manusia memegang persetujuan untuk firewall, migrasi, restore,
   failover, secret, dan perubahan production traffic.

Jika assistant mengabaikan aturan, hentikan sesi dan jangan menjalankan
perintahnya. Ganti model tidak menggantikan kebutuhan bukti dan review manusia.
