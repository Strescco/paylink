# IMPLEMENTATION_PLAN.md — Checklist Implementasi Aevum PayLink

> Checklist berurutan untuk dikerjakan mulai **16 November 2026 pukul 13:00 WIB**
> (pembukaan build window / registrasi, 14:00 HKT).
> **Tidak ada langkah di bawah ini yang dikerjakan pada 15 Nov 2026** — hari ini hanya desain.
> Centang `[ ]` → `[x]` seiring progres. Estimasi waktu bersifat perkiraan kerja fokus satu orang;
> bila tim 2–4 orang, langkah dapat diparalelkan sesuai catatan.

## 0. Prinsip sebelum mulai

- [ ] Baca ulang `ARCHITECTURE.md` dan `RESEARCH.md` sebelum menulis baris kode pertama.
- [ ] Semua waktu di bawah ini WIB (UTC+7). HKT = WIB + 1 jam.
- [ ] Jangan pernah commit private key / seed phrase / nilai `.env` ke repo.
- [ ] Setiap deploy dicatat: alamat kontrak + hash transaksi + link explorer, langsung di `docs/TESTNET_ADDRESSES.md`.

---

## Fase A — Hari 0: 16 Nov 2026, 13:00 WIB (target selesai hari yang sama)

### A1. Registrasi + akun (13:00–13:30 WIB, ±30 menit)

- [ ] User mendaftar di DoraHacks lewat tautan di halaman MoonHub (https://moonhub.tools/hackathons/aevum-builder-challenge-1-aabed41f03e2).
- [ ] Konfirmasi tim: solo, atau daftarkan anggota tim (2–4 orang) bila ada.
- [ ] Unduh starter kit resmi dari tautan MoonHub (Google Drive) dan baca isinya — prioritaskan: alamat tUSD8, contoh integrasi, dan hal apa pun yang mengubah desain di `ARCHITECTURE.md`.
- [ ] Bila starter kit mengubah asumsi desain (mis. alamat token, integrasi wajib), catat perubahannya di `ARCHITECTURE.md` (bagian revisi) SEBELUM menulis kode.

### A2. Wallet + gas testnet (13:30–14:00 WIB, ±30 menit)

- [ ] Buat wallet EVM baru khusus testnet (MetaMask atau sejenis). Wallet ini HANYA untuk testnet.
- [ ] Tambahkan network QDay Aevum manual: chain ID 44005, RPC https://rpc-test.qday.info, symbol tQDAY, explorer https://explorer-test.qday.info. Verifikasi chain ID tampil 44005 sebelum transaksi apa pun.
- [ ] Klaim tQDAY pertama lewat https://faucet.qday.info (klaim pertama — wallet baru bersaldo nol tidak bisa memakai widget Wiki).
- [ ] Verifikasi saldo tQDAY masuk dan terlihat di explorer-test.qday.info.
- [ ] (Opsional, bila tim) tiap anggota klaim ke alamatnya sendiri; jangan berbagi satu private key.

### A3. Temukan + verifikasi alamat tUSD8 (14:00–15:00 WIB, ±1 jam) — ✅ SELESAI 16 Nov ~13:15 WIB

- [x] Cari alamat di starter kit (A1) → bila ketemu, catat sumbernya.
  (Alamat ditemukan lewat Wiki + qday.io — starter kit belum diunduh; alamat sama di 3 sumber resmi, jadi starter kit tidak lagi kritis untuk alamat.)
- [x] Cari di QDay Wiki: halaman "Official contract addresses" dan FAQ 3.8 (navigasi dari wiki.qday.info).
- [x] Cari di explorer-test.qday.info berdasarkan nama/symbol "tUSD8" / "USD8".
  (Diverifikasi via eth_call langsung ke RPC: name/symbol/decimals/totalSupply terbaca.)
- [x] Verifikasi alamat kandidat: buka di explorer, baca `name()`, `symbol()`, `decimals()`; pastikan chain-nya 44005.
- [x] Catat alamat + desimal + sumber di `RESEARCH.md` (revisi) dan `docs/TESTNET_ADDRESSES.md`.
  **HASIL: tUSD8 = `0x456569838f1d43009A91ebA4263147Afd7233483`, desimal 6.**

### A4. Setup repo + toolchain (15:00–16:30 WIB, ±1,5 jam) — ✅ SELESAI 16 Nov ~13:20 WIB

- [ ] Buat repo GitHub publik baru (oleh user / pemilik akun GitHub). — MENUNGGU USER
- [x] Clone ke mesin kerja; salin keempat dokumen dari folder ini (`README.md`, `ARCHITECTURE.md`, `RESEARCH.md`, `IMPLEMENTATION_PLAN.md`) ke repo sebagai dokumentasi awal.
  (Folder kerja ini adalah repo lokal; `git init` sudah dilakukan di sini.)
- [x] Inisialisasi proyek Foundry di repo (pilih Foundry sebagai toolchain utama sesuai ekosistem hackathon: Solidity + Foundry).
  (Foundry 1.9.0 terpasang via foundryup; `foundry.toml` dibuat, solc 0.8.24, profil RPC aevum.)
- [x] Buat struktur folder rencana dari `ARCHITECTURE.md` §4 (contracts, test, script, app, docs) — masih kosong, tanpa isi.
  (contracts/, test/, script/, docs/ dibuat; app/ menyusul di Fase D.)
- [x] Pasang dependensi OpenZeppelin (IERC20, SafeERC20, ReentrancyGuard) sesuai kebutuhan kontrak.
  (openzeppelin-contracts v5.4.0 via `forge install`.)
- [x] Buat `.env.example` (nama variabel saja) dan `.gitignore` (mengecualikan `.env` dan artefak build).
- [ ] Commit pertama: "docs: design + research (pre-build)" — berisi dokumen + kerangka folder kosong.
  (Ditunda sampai repo GitHub publik dibuat user; commit lokal menyusul.)

**Akhir Hari 0 — definisi selesai:** registrasi beres, gas testnet di tangan, alamat tUSD8 ditemukan ATAU diputuskan lanjut dengan mock, repo + Foundry siap.

---

## Fase B — Hari 1–2: 17–18 Nov 2026 — Kontrak + test (±6–8 jam kerja)

### B1. Tulis kontrak PayLink (±2–3 jam) — ✅ SELESAI 16 Nov ~13:25 WIB

- [x] Implementasi `contracts/PayLink.sol` mengikuti `ARCHITECTURE.md` §3 (struct, enum status, 5 fungsi utama + 6 fungsi view, 5 event).
- [x] Constructor menerima alamat token tUSD8 sebagai parameter; tolak alamat-nol.
- [x] Terapkan: `ReentrancyGuard`, `SafeERC20`, checks-effects-interactions, tanpa owner/admin/fee.
- [x] Konstanta: jendela klaim 7 hari; durasi invoice min 1 jam, maks 30 hari; memo maks 200 karakter.
- [x] Kompilasi bersih tanpa warning yang belum dipahami (pahami tiap warning sebelum lanjut).
  (Hanya warning linter `block.timestamp` — memang by-design untuk expiry; manipulasi validator hitungan detik tidak berpengaruh pada deadline jam/hari.)

### B2. Mock tUSD8 (hanya bila alamat resmi belum ada) (±30 menit) — ✅ SELESAI 16 Nov ~13:25 WIB

- [x] Implementasi `contracts/mocks/MockTUSD8.sol` — ERC-20 tiruan (mint bebas untuk test).
  (Dibuat meski alamat resmi sudah ditemukan — tetap dipakai untuk test lokal; desimal 6 sama persis dengan token asli.)
- [x] Tandai jelas di README repo: mock HANYA untuk test lokal, bukan token resmi.
  (Ditandai di header file mock + `ARCHITECTURE.md` §4.2.)

### B3. Tulis test Foundry (±2–3 jam) — ✅ SELESAI 16 Nov ~13:30 WIB

- [x] Implementasi `test/PayLink.t.sol` mencakup kasus 1–35 dari `ARCHITECTURE.md` §5 (wajib semua).
- [x] Kasus fuzz + reentrancy (kasus 36–38) bila waktu memungkinkan; bila tidak, jadwalkan ke Fase E (buffer).
  (Semua dikerjakan sekarang: fuzz amount 256 run + fuzz durasi 256 run + reentrancy attack contract.)
- [x] Jalankan seluruh test sampai hijau. Tidak ada test yang di-skip tanpa alasan tertulis di file test.
  **HASIL: 38/38 PASS, 0 fail, 0 skip (`forge test`).**

### B4. Review keamanan mandiri (±1 jam) — ✅ SELESAI 16 Nov ~13:30 WIB (self-review)

- [x] Periksa ulang daftar ancaman `ARCHITECTURE.md` §3.6 satu per satu terhadap kode yang ditulis.
  (Semua 11 ancaman ter-mitigasi: `nonReentrant` + status diubah sebelum transfer di settle/refund;
  `SafeERC20` untuk semua transfer; status Created→Paid mencegah bayar ganda; settle/refund ganda
  dicegah status; payer tertentu dicek; settle hanya merchant; refund hanya `paidBy`; claim window
  7 hari; pay cek expiry; UI approve tepat amount — dicatat di desain; alamat tUSD8 hanya dari
  sumber resmi + verifikasi on-chain.)
- [x] Periksa: tidak ada transfer sebelum perubahan status; tidak ada jumlah yang dibulatkan salah; tidak ada alamat yang di-hardcode kecuali yang berasal dari constructor.
- [ ] Minta rekan tim (bila ada) membaca kontrak sekali sebelum deploy. — SOLO, tidak ada rekan tim.

**Akhir Fase B — definisi selesai:** kontrak terkompilasi, seluruh test wajib hijau, tidak ada test yang di-skip diam-diam.

---

## Fase C — Hari 3–4: 19–20 Nov 2026 — Deploy testnet + verifikasi (±3–4 jam)

### C1. Deploy ke Aevum testnet (±1 jam)

- [ ] Tulis `script/Deploy.s.sol` (deploy PayLink dengan alamat tUSD8 — resmi bila sudah ada, mock yang di-deploy dulu ke testnet bila belum; catat mana yang dipakai).
- [ ] Deploy dengan Foundry ke RPC https://rpc-test.qday.info, chain ID 44005. Periksa chain ID di output sebelum broadcast.
- [ ] Catat: alamat kontrak PayLink + hash transaksi deploy + link explorer di `docs/TESTNET_ADDRESSES.md`.

### C2. Verifikasi source di explorer (±1 jam)

- [ ] Verifikasi source via Foundry (`forge verify-contract`, verifier Blockscout, verifier URL https://explorer-test.qday.info/api, chain 44005).
- [ ] Buka halaman kontrak di explorer-test.qday.info dan pastikan source tampil sebagai "verified".
- [ ] Bila verifikasi gagal: cek versi compiler + pengaturan optimasi di `foundry.toml` harus sama dengan saat deploy; ulangi.

### C3. Uji asap di testnet (±1–2 jam)

- [ ] Dari wallet testnet: buat invoice → approve tUSD8 → bayar → settle, memakai kontrak yang sudah ter-deploy. Catat semua hash.
- [ ] Verifikasi saldo tUSD8 merchant bertambah dan status invoice berubah di explorer.
- [ ] Uji satu jalur kedaluwarsa: buat invoice berdurasi pendek, tunggu lewat, pastikan `payInvoice` revert.
- [ ] Bila memakai mock di C1 dan alamat tUSD8 resmi ditemukan setelah ini: deploy ulang dengan alamat resmi dan ulangi C2–C3.

**Akhir Fase C — definisi selesai:** kontrak live di 44005, source terverifikasi, alur bayar→settle terbukti di testnet dengan hash tercatat.

---

## Fase D — Hari 5–8: 21–25 Nov 2026 — Interface + skrip demo (±8–10 jam)

### D1. Interface web (±6–8 jam)

- [ ] Bangun `app/index.html` + `app/app.js` + `app/styles.css` + `app/config.js` sesuai `ARCHITECTURE.md` §4.5.
- [ ] Fitur: konek wallet (MetaMask, network 44005) → buat invoice → lihat detail invoice (status, sisa waktu) → approve + bayar → tarik dana (merchant) → refund (bila memenuhi syarat).
- [ ] Semua jumlah diformat memakai `decimals()` yang dibaca dari kontrak token — jangan hardcode.
- [ ] Setiap transaksi menampilkan hash + tautan explorer; setiap error ditampilkan dengan bahasa yang dimengerti (bukan pesan revert mentah).
- [ ] Uji di desktop dan mobile (responsif); uji dengan wallet yang berbeda untuk peran merchant vs payer.

### D2. Skrip demo CLI (opsional, ±1 jam)

- [ ] Tulis `script/Demo.s.sol` (atau skrip setara): buat invoice → approve → bayar → settle via baris perintah, mencetak hash tiap langkah. Dipakai sebagai cadangan bila interface web bermasalah saat demo.

### D3. Docker / live deployment (±1–2 jam)

- [ ] Putuskan bentuk live deployment: hosting statis untuk interface ATAU Docker image (salah satu cukup; syarat submit: "live deployment / Docker").
- [ ] Tulis `Dockerfile` bila memilih Docker; uji image berjalan dari nol di mesin bersih.
- [ ] Catat URL live deployment di README repo.

**Akhir Fase D — definisi selesai:** orang yang belum pernah memakai aplikasi bisa menyelesaikan alur penuh (buat → bayar → settle) hanya dengan membaca UI, tanpa bantuan pembuat.

---

## Fase E — 26 Nov–4 Des 2026 — Dokumentasi, demo video, buffer (±6–8 jam)

- [ ] Lengkapi README repo: penjelasan proyek, arsitektur singkat, alamat testnet, cara menjalankan, cara reproduksi demo (sesuai kriteria judging "turnkey setup").
- [ ] Tulis `docs/DEMO.md`: naskah demo + hash transaksi + link explorer tiap langkah.
- [ ] Perbarui `ARCHITECTURE.md` di repo dengan alamat/desimal terverifikasi.
- [ ] Rekam video demo singkat (alur end-to-end + bukti on-chain). Siapkan juga versi cadangan berupa rekaman layar bila demo live gagal.
- [ ] Kerjakan sisa test fuzz/reentrancy (§5.7) bila belum selesai di Fase B.
- [ ] Uji ulang penuh dari nol: clone repo baru → ikuti README → deploy ulang ke testnet → jalankan demo. Perbaiki semua langkah yang tidak bisa direproduksi.
- [ ] Periksa repo: tidak ada secret/key, tidak ada file `.env` yang ter-commit, LICENSE terisi.

---

## Fase F — Submit: target 9 Des 2026 (deadline resmi 11 Des 15:00 WIB)

- [ ] **9 Des 2026:** submit lewat DoraHacks: tautan repo GitHub publik + bukti integrasi Aevum (alamat kontrak + link explorer) + live deployment/Docker + dokumentasi.
- [ ] Periksa kembali halaman submit: semua komponen yang diminta MoonHub tercentang (repo publik, bukti integrasi, live deployment/Docker, dokumentasi, video demo).
- [ ] Simpan bukti submit (tangkapan layar / konfirmasi) di folder ini.
- [ ] **10–11 Des:** buffer — hanya perbaikan darurat bila panitia meminta revisi. Jangan mulai fitur baru.
- [ ] **Deadline keras: 11 Des 2026, 15:00 WIB.** Setelah itu tidak ada submit.

## Fase G — Demo Day: 15 Des 2026, 13:00 WIB (bila masuk Top 5)

- [ ] Siapkan presentasi 3–5 menit (video call): masalah → solusi → demo live alur → bukti on-chain → rencana mainnet.
- [ ] Latihan demo dengan timer; siapkan video rekaman sebagai cadangan bila live demo gagal.
- [ ] Siapkan jawaban atas pertanyaan juri yang mungkin muncul: kenapa escrow, kenapa tanpa fee, bagaimana refund bekerja, apa yang berubah di mainnet.

---

## Estimasi total

| Fase | Estimasi kerja fokus |
|---|---|
| A — Hari 0 (16 Nov) | ±3–4 jam |
| B — Kontrak + test (17–18 Nov) | ±6–8 jam |
| C — Deploy + verifikasi (19–20 Nov) | ±3–4 jam |
| D — Interface + demo (21–25 Nov) | ±8–10 jam |
| E — Dokumentasi + video + buffer (26 Nov–4 Des) | ±6–8 jam |
| F — Submit (9 Des) | ±1 jam |
| **Total** | **±27–35 jam kerja fokus** |

Jendela build 16 Nov–11 Des (25 hari) memberi ruang besar: target internal submit 9 Des
menyisakan 2 hari buffer penuh sebelum deadline resmi.

## Daftar periksa kepatuhan (diperiksa ulang sebelum submit)

- [ ] Semua kode ditulis dalam build window (16 Nov 13:00 WIB – 11 Des 15:00 WIB). Tidak ada file code dari 15 Nov 2026.
- [ ] Semua kontrak berjalan di Aevum testnet (chain 44005) dengan test token saja.
- [ ] Source kontrak terverifikasi di explorer-test.qday.info.
- [ ] Tidak ada malicious code; tidak ada upaya menyerang platform/peserta lain.
- [ ] Tidak ada secret/key di repo.
- [ ] Repo GitHub publik, README memuat alamat testnet + cara reproduksi.
