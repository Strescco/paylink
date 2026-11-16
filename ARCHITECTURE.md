# ARCHITECTURE.md — Aevum PayLink

> Dokumen desain. Disusun 15 Nov 2026, sebelum build window dibuka.
> **Bukan source code.** File ini hanya spesifikasi sehingga builder lain bisa langsung
> menulis kodenya saat window dibuka (16 Nov 2026, 13:00 WIB) tanpa perlu bertanya.
> Semua nama fungsi, parameter, dan event di bawah ini adalah **kontrak desain** — implementasi
> ditulis dari nol di dalam build window.

## 1. Konsep produk

**Nama:** Aevum PayLink
**Tagline:** "Buat invoice, kirim link, terima tUSD8."

**Pengguna:**

- **Merchant** — penjual, freelancer, atau agen AI yang menagih pembayaran. Membuat invoice.
- **Payer** — pembeli/klien yang membayar invoice dalam tUSD8.

**Nilai jual untuk juri:**

- Satu alur pembayaran stablecoin end-to-end yang lengkap dan bisa didemokan dalam 2 menit.
- Semua state on-chain dan bisa diverifikasi siapa pun di explorer — tidak ada backend yang dipercaya.
- Menangani kasus nyata yang sering dilupakan demo hackathon: kedaluwarsa dan refund.
- Tanpa fee protokol di v1 (dinyatakan eksplisit) — tidak ada matematika fee yang bisa salah.

**Yang TIDAK termasuk dalam v1 (out of scope, dicatat agar tidak merayap):**

- Fee protokol / revenue share.
- Pembayaran parsial / cicilan.
- Multi-token (hanya tUSD8).
- x402 / ERC-8004 / smart wallet / session key — dicatat sebagai roadmap, bukan janji v1.
  (Alasan: per panduan QDay 16 Okt 2026, fitur stablecoin payment, x402, dan agent wallet
  masih berstatus "coming" di testnet; v1 dibangun di atas ERC-20 standar yang sudah live.)
- Login / akun / database off-chain. Interface membaca state langsung dari chain.

## 2. Alur lengkap (end-to-end)

### 2.1 Diagram alur (teks)

    Merchant ──(1) createInvoice──> PayLink (kontrak)
       │                                │
       │  (2) kirim link invoice        │  status = Created
       │      (URL + invoiceId)         │
       ▼                                ▼
    Payer ──(3) approve tUSD8──> token tUSD8
       │
       └──(4) payInvoice──> PayLink: transferFrom payer -> kontrak (escrow)
                                 status = Paid, paidAt dicatat
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              (5a) settleInvoice       (5b) refundInvoice
              merchant menarik         payer refund, HANYA bila
              dana ke wallet-nya        claimDeadline lewat dan
              status = Settled         belum di-settle
                                        status = Refunded

    Jalur batal: (5c) cancelInvoice — merchant membatalkan invoice
    yang BELUM dibayar. Status = Cancelled. Tidak ada dana bergerak.

    Jalur kedaluwarsa: bila block.timestamp > expiresAt dan status masih
    Created, invoice dianggap Expired. Tidak ada transaksi yang mengubahnya
    (status dihitung oleh view); payInvoice setelah titik itu REVERT.

### 2.2 Langkah demi langkah

| # | Aktor | Aksi | State sebelum → sesudah | Catatan |
|---|---|---|---|---|
| 1 | Merchant | Buat invoice: payer (alamat atau alamat-nol = siapa saja), jumlah tUSD8, memo singkat, masa berlaku (mis. 24 jam) | — → Created | Invoice mendapat ID berurutan mulai dari 1. Merchant = pembuat. |
| 2 | Merchant | Bagikan link invoice (URL interface + invoiceId) ke payer | Created | Link berisi chain ID 44005 + alamat kontrak + invoiceId. |
| 3 | Payer | Buka link, lihat detail invoice (merchant, jumlah, memo, sisa waktu) | Created | Interface membaca data dari kontrak (view), bukan dari server. |
| 4 | Payer | Approve tUSD8 ke kontrak PayLink sebesar jumlah invoice (tepat, bukan tak terbatas) | Created | Satu transaksi ERC-20 standar. Jumlah approve = jumlah invoice persis. |
| 5 | Payer | Bayar invoice | Created → Paid | Kontrak menarik tUSD8 via transferFrom dan menahannya (escrow). Pembayaran harus tepat jumlah — kurang/lebih ditolak. |
| 6 | Merchant | Tarik dana (settle) | Paid → Settled | Dana tUSD8 dikirim dari kontrak ke wallet merchant. Bisa dilakukan kapan saja setelah Paid, sebelum refund terjadi. |
| 7a | — | Invoice kedaluwarsa tanpa dibayar | Created → Expired (terhitung) | Terjadi otomatis lewat waktu; tidak ada dana yang bergerak; tidak ada refund karena tidak ada yang dibayar. |
| 7b | Payer | Refund | Paid → Refunded | Hanya bila claimDeadline sudah lewat DAN merchant belum settle. Dana kembali penuh ke payer. |
| 7c | Merchant | Batalkan invoice yang belum dibayar | Created → Cancelled | Hanya merchant pembuat, hanya sebelum dibayar. |

### 2.3 Aturan waktu (dua deadline — jangan disamakan)

- **expiresAt** — batas waktu BAYAR. Dihitung saat invoice dibuat: waktu sekarang + durasi yang dipilih merchant (pilihan UI: 1 jam / 24 jam / 7 hari; default 24 jam). Setelah lewat: `payInvoice` revert; invoice berstatus Expired.
- **claimDeadline** — batas waktu MERCHANT MENARIK dana setelah dibayar. Dihitung saat pembayaran: waktu bayar + jendela klaim tetap **7 hari**. Setelah lewat dan belum di-settle: payer berhak refund penuh.
- Dua deadline ini sengaja dipisah: invoice bisa berumur pendek (bayar cepat), tapi merchant tetap punya waktu 7 hari untuk menarik dana setelah dibayar.

### 2.4 Contoh skenario demo (untuk video demo)

1. Merchant membuat invoice 10 tUSD8, memo "Design logo — paket standar", berlaku 24 jam → invoice #1.
2. Payer approve 10 tUSD8, lalu bayar invoice #1 → status Paid, hash transaksi tampil di UI + link explorer.
3. Merchant klik "Tarik dana" → 10 tUSD8 masuk wallet merchant → status Settled.
4. (Kasus kedua) Merchant membuat invoice #2 senilai 5 tUSD8 dengan masa berlaku 1 jam; dibiarkan kedaluwarsa → UI menunjukkan Expired dan tombol bayar nonaktif.
5. (Kasus ketiga) Invoice #3 dibayar, merchant sengaja tidak menarik — didemokan lewat simulasi waktu di test lokal bahwa refund terbuka setelah claimDeadline; di testnet, refund didemokan hanya bila jendela sudah lewat secara alami (tidak memalsukan waktu di testnet).

## 3. Desain kontrak

Satu kontrak inti saja. Kesengajaan: satu kontrak = satu alur = mudah diaudit juri dan mudah diverifikasi.

### 3.1 Kontrak: PayLink

- **Jaringan:** Aevum testnet, chain ID 44005.
- **Bahasa/toolchain (rencana):** Solidity 0.8.20 atau lebih baru, Foundry.
- **Dependensi (rencana, dipakai saat build):** OpenZeppelin `IERC20`, `SafeERC20`, `ReentrancyGuard`. Tidak ada dependensi lain.
- **Token yang diterima:** HANYA tUSD8 (alamat kontrak tUSD8 dimasukkan sebagai parameter constructor — bukan di-hardcode di desain, karena alamatnya belum ditemukan; lihat `RESEARCH.md`). Constructor menolak alamat-nol.
- **Tidak ada owner / admin / fee / upgrade.** Setelah deploy, tidak ada pihak yang bisa mengubah aturan, menarik dana orang lain, atau mengenakan fee. Ini fitur keamanan, bukan kekurangan.
- **Pola keamanan:** checks-effects-interactions + `nonReentrant` pada semua fungsi yang memindahkan token + `SafeERC20` untuk transfer token (menangani token yang tidak mengembalikan boolean).

### 3.2 Struktur data Invoice (field dan artinya)

| Field | Tipe (rencana) | Arti |
|---|---|---|
| `id` | bilangan bulat | ID berurutan, mulai 1 |
| `merchant` | alamat wallet | Pembuat invoice; satu-satunya yang bisa settle/cancel |
| `payer` | alamat wallet | Alamat payer yang dituju; alamat-nol berarti siapa saja boleh membayar |
| `token` | alamat kontrak | Selalu alamat tUSD8 (dicatat per invoice agar tahan bila kontrak di-deploy ulang) |
| `amount` | bilangan bulat | Jumlah tUSD8 dalam satuan terkecil token (bukan "10" mentah — lihat §3.5 soal desimal) |
| `memo` | teks singkat | Keterangan invoice, maks. 200 karakter (dibatasi agar gas wajar) |
| `createdAt` | waktu (timestamp) | Saat invoice dibuat |
| `expiresAt` | waktu (timestamp) | Batas waktu bayar |
| `paidAt` | waktu (timestamp) | 0 bila belum dibayar; diisi saat dibayar |
| `claimDeadline` | waktu (timestamp) | 0 bila belum dibayar; = paidAt + 7 hari setelah dibayar |
| `status` | enum | Created / Paid / Settled / Refunded / Cancelled |

Status `Expired` TIDAK disimpan sebagai nilai enum — status kedaluwarsa dihitung oleh fungsi view
(bila status = Created dan waktu sekarang > expiresAt, tampilkan Expired). Alasan: kedaluwarsa
terjadi karena waktu lewat, bukan karena ada transaksi; menyimpan perubahan status butuh
transaksi dari seseorang, yang tidak ada yang berkepentingan melakukannya.

### 3.3 Fungsi — spesifikasi lengkap

#### 3.3.1 `createInvoice`

- **Parameter:** `payer` (alamat; alamat-nol = siapa saja), `amount` (jumlah tUSD8, satuan terkecil, harus > 0), `expiresIn` (durasi dalam detik; min 1 jam, maks 30 hari), `memo` (teks, maks. 200 karakter).
- **Mengembalikan:** `invoiceId` (ID invoice baru).
- **Aturan validasi:** amount > 0; expiresIn dalam rentang; memo tidak lebih dari 200 karakter.
- **Efek:** menyimpan invoice baru dengan status Created, `createdAt` = sekarang, `expiresAt` = sekarang + expiresIn, `paidAt` = 0, `claimDeadline` = 0; menaikkan counter ID.
- **Event:** `InvoiceCreated` (lihat §3.4).

#### 3.3.2 `payInvoice`

- **Parameter:** `invoiceId`.
- **Pemanggil:** payer yang dituju (bila `payer` di invoice bukan alamat-nol, hanya alamat itu yang boleh membayar; bila alamat-nol, siapa saja boleh — kecuali merchant sendiri tidak boleh membayar invoice-nya sendiri).
- **Prasyarat:** invoice ada; status Created; waktu sekarang <= expiresAt; pemanggil sudah approve tUSD8 ke kontrak minimal sebesar amount.
- **Efek:** menarik `amount` tUSD8 dari pemanggil ke kontrak (escrow) via transferFrom; status → Paid; `paidAt` = sekarang; `claimDeadline` = sekarang + 7 hari.
- **Keamanan:** nonReentrant; state diubah sebelum transfer keluar (tidak ada transfer keluar di fungsi ini); jumlah harus tepat — tidak ada kelebihan/kembalian.
- **Event:** `InvoicePaid`.

#### 3.3.3 `settleInvoice` (merchant menarik dana)

- **Parameter:** `invoiceId`.
- **Pemanggil:** hanya merchant pembuat invoice.
- **Prasyarat:** status Paid.
- **Efek:** status → Settled (diubah SEBELUM transfer — checks-effects-interactions), lalu mengirim `amount` tUSD8 dari kontrak ke wallet merchant.
- **Keamanan:** nonReentrant; bila transfer gagal, seluruh transaksi revert dan status tetap Paid.
- **Event:** `InvoiceSettled`.

#### 3.3.4 `refundInvoice` (payer refund bila merchant tidak menarik)

- **Parameter:** `invoiceId`.
- **Pemanggil:** hanya payer yang membayar (alamat yang tercatat sebagai pembayar saat `payInvoice` — disimpan di field tambahan `paidBy`).
- **Prasyarat:** status Paid DAN waktu sekarang > claimDeadline.
- **Efek:** status → Refunded (diubah sebelum transfer), lalu mengirim `amount` tUSD8 dari kontrak kembali ke payer.
- **Keamanan:** nonReentrant.
- **Event:** `InvoiceRefunded`.

#### 3.3.5 `cancelInvoice`

- **Parameter:** `invoiceId`.
- **Pemanggil:** hanya merchant pembuat invoice.
- **Prasyarat:** status Created (belum dibayar). Bila sudah Paid, pembatalan tidak bisa — jalurnya refund setelah claimDeadline.
- **Efek:** status → Cancelled. Tidak ada pergerakan dana.
- **Event:** `InvoiceCancelled`.

#### 3.3.6 Fungsi baca (view, tanpa gas)

| Fungsi | Parameter | Mengembalikan / arti |
|---|---|---|
| `getInvoice` | `invoiceId` | Seluruh field invoice (lihat §3.2) |
| `getInvoiceStatus` | `invoiceId` | Status efektif, termasuk Expired yang dihitung dari waktu (Created + lewat expiresAt = Expired) |
| `isExpired` | `invoiceId` | Benar bila status Created dan waktu sekarang > expiresAt |
| `nextInvoiceId` | — | ID yang akan dipakai invoice berikutnya (counter + 1) |
| `token` | — | Alamat kontrak tUSD8 yang dipakai kontrak ini (public variable) |
| `claimWindow` | — | Jendela klaim dalam detik (tetap 7 hari; public constant) |

**Catatan desain — field `paidBy`:** selain field di §3.2, invoice menyimpan `paidBy` (alamat pembayar, alamat-nol sebelum dibayar). Field ini yang dipakai `refundInvoice` untuk memastikan hanya pembayar asli yang bisa refund — bukan sembarang orang yang tahu invoiceId.

### 3.4 Event (untuk UI, explorer, dan demo)

| Event | Parameter | Dipancarkan saat |
|---|---|---|
| `InvoiceCreated` | id, merchant, payer, token, amount, expiresAt, memo | `createInvoice` berhasil |
| `InvoicePaid` | id, paidBy, amount, paidAt, claimDeadline | `payInvoice` berhasil |
| `InvoiceSettled` | id, merchant, amount | `settleInvoice` berhasil |
| `InvoiceRefunded` | id, paidBy, amount | `refundInvoice` berhasil |
| `InvoiceCancelled` | id, merchant | `cancelInvoice` berhasil |

Semua alamat dan ID di event memakai parameter terindeks (indexed) agar UI/demo bisa memfilter
riwayat per merchant atau per payer dari log chain. Tidak ada event `InvoiceExpired` — kedaluwarsa
bukan transaksi (lihat §3.2).

### 3.5 Desimal dan jumlah — ASUMSI YANG HARUS DIVERIFIKASI

- **Jumlah disimpan dalam satuan terkecil token** (seperti wei untuk ETH). UI TIDAK boleh menebak.
- **Desimal tUSD8 belum terverifikasi** (alamat kontrak belum ditemukan — lihat `RESEARCH.md`).
  Token stablecoin umumnya 6 desimal, tetapi itu ASUMSI, bukan fakta.
- **✅ REVISI 16 Nov 2026: desimal TERKONFIRMASI = 6** — alamat tUSD8
  `0x456569838f1d43009A91ebA4263147Afd7233483` ditemukan di 3 sumber resmi
  (Wiki FAQ §3.8, qday.io/official-links, Wiki MetaMask guide) dan diverifikasi
  on-chain (`name()`/`symbol()` = tUSD8, `decimals()` = 6). Lihat `RESEARCH.md` §6.
- **Aturan saat build:** langkah pertama setelah alamat tUSD8 ditemukan adalah membaca `decimals()`,
  `symbol()`, dan `name()` dari kontrak token di testnet, lalu:
  - interface memformat jumlah dengan desimal hasil baca tersebut (bukan hardcode 6);
  - test memakai desimal hasil baca tersebut;
  - angka desimal yang terverifikasi dicatat di README repo dan di `RESEARCH.md` (revisi).
- Jumlah demo yang direncanakan: 1, 5, dan 10 tUSD8 (dalam satuan terkecil setelah desimal diketahui).

### 3.6 Ancaman dan mitigasi (checklist keamanan desain)

| Ancaman | Mitigasi dalam desain |
|---|---|
| Reentrancy saat settle/refund | `nonReentrant` + status diubah sebelum transfer (checks-effects-interactions) |
| Token yang tidak mengembalikan boolean | `SafeERC20` untuk semua transfer/transferFrom |
| Pembayaran ganda atas invoice yang sama | Status berubah Created → Paid; `payInvoice` kedua revert karena status bukan Created |
| Settle ganda / refund ganda | Status berubah sebelum transfer; panggilan kedua revert karena status bukan Paid |
| Orang lain membayar invoice yang ditujukan ke payer tertentu | Bila `payer` bukan alamat-nol, hanya alamat itu yang boleh `payInvoice` |
| Orang lain menarik dana merchant | `settleInvoice` hanya merchant pembuat |
| Orang lain refund dana payer | `refundInvoice` hanya `paidBy` yang tercatat |
| Merchant mengunci dana payer selamanya | `claimDeadline` 7 hari → setelah itu payer bisa refund penuh |
| Invoice kedaluwarsa tetap bisa dibayar | `payInvoice` memeriksa waktu sekarang <= expiresAt, revert bila lewat |
| Jumlah approve tak terbatas oleh UI | UI meminta approve tepat sebesar amount invoice, bukan tak terbatas |
| Alamat tUSD8 palsu | Alamat hanya diambil dari sumber resmi QDay/Aevum (Wiki / starter kit / explorer); diverifikasi `symbol`/`decimals` sebelum dipakai; tidak pernah dari chat/DM |

## 4. Struktur file yang AKAN dibuat (saat window dibuka)

> Daftar ini adalah RENCANA nama file dan isi singkat tiap file. **Tidak satu pun file di bawah
> ini dibuat pada 15 Nov 2026.** File dibuat mulai 16 Nov 13:00 WIB sesuai `IMPLEMENTATION_PLAN.md`.

### 4.1 Repo (root)

| File/folder | Isi singkat |
|---|---|
| `README.md` | Penjelasan proyek, arsitektur singkat, alamat testnet (kontrak PayLink + tUSD8 setelah deploy), cara menjalankan, cara reproduksi demo |
| `ARCHITECTURE.md` | Salinan dokumen desain ini (diperbarui dengan alamat/desimal terverifikasi) |
| `LICENSE` | MIT (rencana) |
| `.gitignore` | Mengecualikan `.env`, folder build, dan artefak lokal |
| `.env.example` | CONTOH nama variabel saja (RPC URL, private key deploy — tanpa nilai asli) |
| `foundry.toml` | Konfigurasi Foundry: profil testnet Aevum (chain 44005, RPC testnet) |
| `Dockerfile` | Image untuk menjalankan interface demo (rencana; diputuskan saat build) |

### 4.2 Kontrak (`contracts/`)

| File | Isi singkat |
|---|---|
| `contracts/PayLink.sol` | Satu-satunya kontrak inti — implementasi §3 (invoice, pay, settle, refund, cancel, view) |
| `contracts/mocks/MockTUSD8.sol` | **HANYA FALLBACK** — token ERC-20 tiruan bernama tUSD8 untuk test lokal, dipakai hanya bila alamat tUSD8 resmi belum ditemukan saat build dimulai; TIDAK dipakai sebagai pengganti token resmi di testnet bila alamat resmi sudah ada |

### 4.3 Test (`test/`)

| File | Isi singkat |
|---|---|
| `test/PayLink.t.sol` | Seluruh kasus uji §5, ditulis dengan Foundry |

### 4.4 Script deploy (`script/`)

| File | Isi singkat |
|---|---|
| `script/Deploy.s.sol` | Script deploy PayLink ke Aevum testnet (constructor menerima alamat tUSD8), mencetak alamat kontrak hasil deploy |
| `script/Demo.s.sol` (opsional) | Script demo end-to-end via baris perintah: buat invoice → approve → bayar → settle, mencetak hash tiap langkah (dipakai bila interface web belum siap) |

### 4.5 Interface web (`app/`)

| File | Isi singkat |
|---|---|
| `app/index.html` | Satu halaman: buat invoice, bayar invoice, lacak invoice, tarik dana |
| `app/app.js` | Logika frontend: konek wallet (MetaMask), baca kontrak, kirim transaksi, tampilkan status + link explorer |
| `app/styles.css` | Tampilan sederhana dan responsif (desktop/mobile) |
| `app/config.js` | Alamat kontrak + chain ID + RPC — dipisah agar mudah diperbarui setelah deploy |

Teknologi interface (rencana): HTML/CSS/JavaScript statis + pustaka viem atau ethers.js (pilih satu saat
build; tidak ada framework berat, tidak ada backend). Wallet: MetaMask / wallet EVM apa pun yang
mendukung penambahan network custom (chain 44005).

### 4.6 Dokumen demo & submit (`docs/`)

| File | Isi singkat |
|---|---|
| `docs/DEMO.md` | Naskah demo langkah demi langkah + hash transaksi + link explorer (diisi setelah deploy) |
| `docs/TESTNET_ADDRESSES.md` | Alamat kontrak PayLink hasil deploy + alamat tUSD8 resmi + cara verifikasi di explorer |

## 5. Rencana test (kasus uji tiap fungsi)

Test ditulis dengan Foundry dan dijalankan terhadap mock tUSD8 lokal; setelah alamat tUSD8
resmi ditemukan, satu putaran test integrasi diulang di testnet (fork atau deploy langsung).
Setiap kasus di bawah harus ada sebagai satu test bernama jelas.

### 5.1 `createInvoice`

1. Berhasil: invoice tersimpan dengan field benar (merchant, payer, amount, expiresAt = sekarang + durasi), ID mulai 1 dan berurutan.
2. Event `InvoiceCreated` terpancar dengan parameter benar.
3. Gagal bila amount = 0.
4. Gagal bila durasi < 1 jam atau > 30 hari.
5. Gagal bila memo > 200 karakter.
6. Payer alamat-nol diterima (invoice terbuka untuk siapa saja).
7. Dua invoice dari merchant sama mendapat ID berbeda.

### 5.2 `payInvoice`

8. Berhasil: status → Paid, `paidAt` terisi, `claimDeadline` = paidAt + 7 hari, saldo escrow kontrak bertambah sebesar amount, event `InvoicePaid` terpancar.
9. Gagal bila invoice tidak ada.
10. Gagal bila invoice sudah Paid (bayar ganda).
11. Gagal bila invoice sudah Cancelled.
12. Gagal bila sudah lewat expiresAt (simulasikan waktu maju di test).
13. Gagal bila pemanggil bukan payer yang dituju (invoice dengan payer tertentu).
14. Gagal bila allowance tUSD8 kurang dari amount.
15. Gagal bila saldo tUSD8 payer kurang dari amount.
16. Merchant tidak boleh membayar invoice-nya sendiri.
17. Invoice terbuka (payer alamat-nol) bisa dibayar alamat mana pun kecuali merchant.

### 5.3 `settleInvoice`

18. Berhasil: merchant menerima amount penuh, saldo kontrak berkurang, status → Settled, event `InvoiceSettled`.
19. Gagal bila pemanggil bukan merchant.
20. Gagal bila status masih Created (belum dibayar).
21. Gagal bila sudah Settled (settle ganda).
22. Gagal bila sudah Refunded.

### 5.4 `refundInvoice`

23. Berhasil setelah claimDeadline lewat: payer menerima amount penuh, status → Refunded, event `InvoiceRefunded`.
24. Gagal bila claimDeadline belum lewat (merchant masih punya waktu).
25. Gagal bila pemanggil bukan pembayar asli (`paidBy`).
26. Gagal bila status bukan Paid (belum dibayar / sudah Settled).
27. Setelah refund, merchant tidak bisa lagi settle.

### 5.5 `cancelInvoice`

28. Berhasil: merchant membatalkan invoice Created → Cancelled, event `InvoiceCancelled`.
29. Gagal bila pemanggil bukan merchant.
30. Gagal bila invoice sudah Paid (tidak bisa batal setelah dibayar).
31. Invoice yang dibatalkan tidak bisa dibayar lagi.

### 5.6 View dan status

32. `getInvoice` mengembalikan field yang benar untuk invoice yang ada; revert untuk ID yang tidak ada.
33. `getInvoiceStatus` mengembalikan Expired untuk invoice Created yang sudah lewat expiresAt (tanpa transaksi).
34. `isExpired` benar sebelum dan sesudah expiresAt.
35. `nextInvoiceId` naik 1 setiap kali invoice dibuat.

### 5.7 Keamanan / fuzz (bila waktu memungkinkan)

36. Fuzz: amount acak (dalam rentang wajar) — bayar lalu settle selalu memindahkan tepat amount, tidak lebih/kurang.
37. Fuzz: durasi acak dalam rentang — expiresAt selalu = createdAt + durasi.
38. Upaya reentrancy terhadap settle/refund (kontrak penyerang sederhana) selalu gagal mengubah saldo lebih dari sekali.

**Target cakupan:** semua fungsi di §3.3 memiliki minimal satu kasus berhasil dan semua kasus gagal
yang terdaftar. Tidak ada pengecualian "nanti saja" untuk kasus 8–31; kasus 36–38 dikerjakan bila
waktu memungkinkan sebelum submit.

## 6. Keputusan desain yang sengaja dibuat (dan alasannya)

| Keputusan | Alasan |
|---|---|
| Satu kontrak, bukan banyak | Mudah diaudit, mudah diverifikasi juri, lebih sedikit permukaan serangan |
| Escrow di kontrak (bukan langsung ke merchant) | Memberi arti pada refund: ada dana yang bisa dikembalikan bila merchant tidak menarik |
| Settle manual oleh merchant (bukan otomatis saat bayar) | Menunjukkan dua peran (payer dan merchant) dalam demo; memberi jeda klaim yang bermakna |
| Tanpa fee | Menghilangkan satu kelas bug (perhitungan fee) dan satu pertanyaan juri ("fee ke mana?") |
| Tanpa owner/admin | Tidak ada yang bisa membekukan/mengubah kontrak setelah deploy — kepercayaan berasal dari kode, bukan janji |
| Expiry dihitung view, bukan disimpan | Kedaluwarsa adalah fungsi waktu; tidak butuh transaksi siapa pun |
| Claim window tetap 7 hari | Cukup lama untuk merchant, cukup singkat untuk demo refund di test lokal |
| Interface statis tanpa backend | Tidak ada server yang bisa mati saat demo; semua state dari chain |

## 7. Risiko desain dan mitigasi

| Risiko | Dampak bila terjadi | Mitigasi |
|---|---|---|
| Alamat tUSD8 resmi tidak ditemukan juga saat window dibuka | Kontrak tidak bisa diuji terhadap token asli | Fallback mock lokal untuk test; kontrak menerima alamat token via constructor sehingga ganti alamat = deploy ulang tanpa ubah kode; cari alamat di starter kit + Wiki + tanya panitia lewat kanal resmi |
| Desimal tUSD8 bukan 6 | UI menampilkan jumlah salah | Baca `decimals()` on-chain; jangan hardcode (lihat §3.5) |
| Faucet tQDAY cooldown / lambat | Deploy tertunda | Klaim gas di hari pertama window; siapkan dua wallet testnet (masing-masing klaim sendiri) |
| RPC testnet tidak stabil saat demo | Demo live gagal | Rekam demo video sebagai cadangan; siapkan hash + link explorer dari transaksi yang sudah terjadi |
| x402/ERC-8004 ternyata diwajibkan juri | Nilai integrasi dinilai kurang | Desain v1 tetap valid sebagai alur stablecoin end-to-end (syarat tertulis); bila starter kit menunjukkan integrasi wajib, tambahkan sebagai lapisan v2 setelah v1 jalan — jangan tunda v1 |
