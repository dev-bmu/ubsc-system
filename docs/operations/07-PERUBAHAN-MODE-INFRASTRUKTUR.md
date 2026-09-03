# Perubahan mode infrastruktur UBSC

Dokumen ini menjelaskan cara berpindah dari satu VPS ke infrastruktur
multi-node. Baca dokumen ini sebelum mengubah `PRODUCTION_TOPOLOGY`.

## Jawaban singkat

**Mode tidak berubah otomatis ketika VPS baru ditambahkan.** Aplikasi sengaja
tidak menebak jumlah server, keberadaan replica, atau kesiapan load balancer.
Operator memilih mode secara eksplisit melalui konfigurasi production yang
dikelola di luar repository:

```env
# Satu VPS
PRODUCTION_TOPOLOGY=single_node

# Infrastruktur HA yang benar-benar sudah tersedia
PRODUCTION_TOPOLOGY=multi_node
```

Setelah pilihan eksplisit itu dibaca candidate release, resolver, contract,
readiness gate, dan dispatcher deployment akan memilih jalur yang sesuai secara
otomatis. Mengubah nilai ini tidak membuat VPS, replica database, load balancer,
Redis bersama, atau shared storage secara otomatis.

## Yang otomatis dan yang tetap menjadi tugas operator

| Bagian | Otomatis setelah mode dipilih | Harus disediakan operator/infrastruktur |
|---|---|---|
| Pemilihan kontrak runtime | Ya | Nilai topology yang benar |
| Aktivasi gate HA dan replication | Ya, pada `multi_node` | Infrastruktur dan bukti yang nyata |
| Pemilihan script rollout | Ya, melalui dispatcher resmi | Candidate release dan target host |
| Pembuatan VPS/node kedua | Tidak | Provider/VPS operator |
| Load balancer dan health routing | Tidak | Provider/network operator |
| Database standby dan failover | Tidak | Database operator/provider |
| Redis serta storage bersama | Tidak | Infrastructure operator |
| DNS, TLS, firewall, dan private network | Tidak | Infrastructure operator |

Tidak ada fallback diam-diam dari `multi_node` ke `single_node`. Jika kontrak
multi-node tidak lengkap, pemeriksaan berhenti dengan status gagal agar trafik
tidak dibuka pada arsitektur yang hanya terlihat aman.

## Kapan tetap memakai `single_node`

Tetap gunakan `single_node` apabila salah satu kondisi berikut masih benar:

- hanya ada satu application VPS;
- database primary dan salinan berada pada failure domain yang sama;
- belum ada load balancer yang memeriksa `/health/ready`;
- session, queue, atau cache belum dapat diakses seluruh application node;
- upload/dokumen belum berada pada storage yang dapat diakses seluruh node;
- failover database belum diuji;
- monitoring eksternal, backup, PITR, atau restore drill belum terbukti.

VPS yang lebih besar tetap termasuk `single_node`. Menambah CPU, RAM, atau disk
tidak mengubah satu failure domain menjadi high availability.

## Gate sebelum berpindah ke `multi_node`

Jangan mengubah topology sebelum seluruh item berikut memiliki bukti:

1. Minimal dua application node berada pada failure domain yang sesuai.
2. Setiap node memiliki `PRODUCTION_INSTANCE_ID` unik.
3. Load balancer mengeluarkan node gagal dan hanya mengirim trafik ke readiness
   endpoint yang sehat.
4. Database writer memiliki standby/replica nyata dan prosedur failover yang
   telah diuji; primary dan standby tidak berada pada VPS yang sama.
5. Redis untuk coordination, session, cache, dan queue tersedia bagi seluruh
   node dengan autentikasi, persistence, serta kebijakan memori yang benar.
6. Upload dan dokumen durable memakai shared/object storage; bukan disk release
   lokal salah satu node.
7. Secret, key ring, clock, schema, dan release kompatibel pada seluruh node.
8. Backup off-site, PITR, restore drill, log terpusat, dan monitoring eksternal
   masih segar serta lolos verifikasi.
9. Firewall, trusted proxy, TLS, private network, dan origin isolation telah
   diperiksa.
10. Prosedur rollout, drain, rollback aplikasi, dan insiden telah dilatih pada
    staging yang menyerupai production.

Jika satu item belum terbukti, keputusan yang benar adalah tetap pada
`single_node`, bukan mengisi flag palsu.

## Alur perubahan yang aman

### 1. Inventaris dan persetujuan

Catat topology saat ini, target topology, semua host, release, backup terakhir,
approver, maintenance window, dan rencana pemulihan. Jalankan inventaris
read-only dari [`01-INVENTARIS-SERVER.md`](01-INVENTARIS-SERVER.md).

### 2. Siapkan infrastruktur dahulu

Provision dan uji komponen multi-node tanpa mengarahkan trafik pengguna.
Jangan memakai perubahan topology sebagai cara untuk membuat gate terlihat
hijau; gate adalah pemeriksa terakhir, bukan alat provisioning.

### 3. Siapkan konfigurasi lengkap sebagai satu perubahan

Gunakan `deploy/production.env.example` sebagai inventaris nama konfigurasi.
Simpan nilai nyata pada secret/configuration manager milik hosting. Jangan
menyalin placeholder dan jangan commit `.env`.

Perubahan tidak boleh hanya berisi:

```env
PRODUCTION_TOPOLOGY=multi_node
```

Topology, jumlah node, identitas per node, endpoint internal, credential,
provider capability, dan bukti operasional harus konsisten sebagai satu paket.
Jangan mengedit `.env` aktif secara spontan ketika trafik sedang berjalan;
gunakan prosedur konfigurasi atomik dan rollout yang disetujui operator.

### 4. Validasi candidate sebelum menerima trafik

Pada setiap candidate application node, tanpa mencetak secret:

```bash
php artisan production:topology
php artisan production:topology --json
php artisan production:check --strict --probe
```

Hasil pertama harus tepat `multi_node`. Satu kegagalan berarti berhenti. Jangan
mengubah verifier, menghapus gate, atau menambahkan nilai palsu.

### 5. Aktifkan hanya melalui dispatcher resmi

Setelah seluruh gate multi-node dan runbook teknis lulus:

```bash
bash deploy/scripts/activate-production-topology.sh \
  /srv/ubsc \
  /srv/ubsc/releases/<NEW_RELEASE> \
  <NEW_RELEASE>
```

Dispatcher membaca topology dari candidate release. Ia otomatis memilih
rollout atomic single-node atau rolling multi-node. Operator tidak boleh
memanggil activator internal yang berbeda untuk memaksa hasil.

### 6. Verifikasi sesudah aktivasi

Periksa seluruh node, load balancer, release digest, queue/scheduler,
replication lag, database writer safety, shared storage, sesi pengguna,
reservasi, membership, backup, dan monitoring eksternal. Ikuti
[`04-VERIFIKASI-DAN-ROLLBACK.md`](04-VERIFIKASI-DAN-ROLLBACK.md) serta runbook
multi-node yang ditautkan dari [`00-START-HERE.md`](00-START-HERE.md).

## Jika perpindahan gagal

- Jangan membuka trafik ke candidate yang gagal.
- Jangan menjalankan rollback database otomatis.
- Pertahankan release aktif dan data yang sudah terverifikasi.
- Jangan mengubah kembali topology secara spontan untuk menyembunyikan alarm.
- Catat gate yang gagal, isolasi komponen bermasalah, lalu ikuti rencana
  pemulihan yang telah disetujui.

Perubahan dari `multi_node` kembali ke `single_node` adalah perubahan arsitektur
dan keputusan insiden, bukan fallback aplikasi. Perubahan tersebut memerlukan
review data, session, queue, storage, routing, dan database writer agar tidak
menciptakan split-brain atau kehilangan pekerjaan yang masih berjalan.

## Bukti selesai

Perubahan mode baru dianggap selesai jika:

- topology runtime pada setiap node sama dengan change record;
- seluruh contract dan probe lulus tanpa bypass;
- hanya satu database writer yang sah;
- load balancer mengeluarkan node yang tidak ready;
- sesi, queue, storage, reservasi, dan membership konsisten lintas node;
- monitoring eksternal melihat layanan sehat;
- backup dan rollback release tersedia;
- hasil perubahan dicatat tanpa membocorkan rahasia.
