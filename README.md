# Aevum Builder Challenge #1 — Aevum PayLink

> **STATUS: IMPLEMENTASI DIMULAI 16 Nov 2026 13:00 WIB — KONTRAK + TEST SELESAI.**
> Alamat tUSD8 resmi DITEMUKAN + terverifikasi on-chain (lihat `RESEARCH.md` §6).
> `contracts/PayLink.sol` + `contracts/mocks/MockTUSD8.sol` ditulis, 38/38 test Foundry HIJAU.
> Deploy testnet BELUM dilakukan — butuh wallet testnet + tQDAY faucet (tugas user, lihat bawah).

## Proyek: Aevum PayLink

**Satu kalimat:** Invoice pembayaran stablecoin end-to-end di Aevum testnet — merchant membuat invoice dalam tUSD8, payer membayar, dana cair ke merchant, dengan expiry dan refund bila kedaluwarsa.

**Masalah yang diselesaikan:** penjual/freelancer/agen AI butuh cara menagih dalam stablecoin tanpa membangun backend pembayaran sendiri — cukup buat invoice on-chain, kirim link, terima tUSD8, semua tercatat dan bisa diverifikasi di explorer.

**Alur inti (ringkas):**

1. Merchant membuat invoice: jumlah tUSD8, payer (opsional: siapa saja / alamat tertentu), memo, masa berlaku.
2. Payer menyetujui (approve) tUSD8 lalu membayar invoice — dana masuk escrow kontrak.
3. Merchant menarik dana (settle) ke wallet-nya.
4. Jika invoice kedaluwarsa sebelum dibayar → tidak bisa dibayar lagi, dana tidak pernah bergerak.
5. Jika sudah dibayar tapi merchant tidak kunjung menarik dalam jendela klaim → payer bisa refund.

Detail lengkap alur, kontrak, fungsi, event, dan kasus uji ada di `ARCHITECTURE.md`.

## Link resmi

| Keperluan | Link |
|---|---|
| Halaman hackathon (MoonHub) | https://moonhub.tools/hackathons/aevum-builder-challenge-1-aabed41f03e2 |
| Pendaftaran / submit | via DoraHacks (tautan "View Details" di halaman MoonHub di atas) |
| Situs QDay | https://qday.io/ |
| Dokumen resmi QDay (Wiki) | https://wiki.qday.info/ |
| Panduan mulai Aevum Testnet (PQA Labs, 16 Okt 2026) | https://pqalabs.medium.com/aevum-testnet-how-do-i-get-started-qday-4dd0a6d64a34 |
| Starter kit resmi (Google Drive, dicek saat window dibuka) | https://drive.google.com/file/d/1YL574BFJTnZ9Z-WzkZMyuQnWNUOgUJ6l/view?usp=sharing |
| Explorer Aevum testnet | https://explorer-test.qday.info |
| Faucet gas testnet | https://faucet.qday.info |

## Timeline resmi (terverifikasi dari halaman MoonHub, dicek 15 Nov 2026)

| Tahap | HKT | WIB (UTC+7) | UTC |
|---|---|---|---|
| Registrasi dibuka + starter kit dirilis | 16 Nov 2026, 14:00 | **16 Nov 2026, 13:00** | 16 Nov, 06:00 |
| Build window | 16 Nov – 11 Des 2026 | 16 Nov 13:00 WIB – 11 Des 15:00 WIB | — |
| **Submit ditutup** | **11 Des 2026, 16:00** | **11 Des 2026, 15:00** | 11 Des, 08:00 |
| Judging | 12–14 Des 2026 | 12–14 Des 2026 | — |
| Demo Day (Top 5, presentasi 3–5 menit via video call) | 15 Des 2026, 14:00 | 15 Des 2026, 13:00 | 15 Des, 06:00 |

**Target internal kami: submit 9 Des 2026** — dua hari sebelum deadline, sebagai buffer bila ada masalah verifikasi/deploy.

## Hadiah

Total **$1.500 USDT**: 1st **$800** / 2nd **$500** / 3rd **$200**.

**Bonus non-uang:** pemenang mendapat fast track ke program builder mainnet QDay (mainnet direncanakan Februari 2027).

## Syarat entry (ringkas, dari halaman resmi)

- Solo boleh, atau tim 2–4 orang (dibentuk sebelum event).
- **Satu alur pembayaran stablecoin end-to-end di Aevum testnet (tUSD8):** smart contract + interface/script + source terverifikasi + demo singkat.
- Semua smart contract berjalan di Aevum testnet, memakai test token saja.
- Submit: repo GitHub publik + bukti integrasi Aevum + live deployment / Docker image + dokumentasi.
- Top 5: presentasi video call 3–5 menit.
- Dilarang: malicious code, menyerang platform/peserta lain.

## Testnet Aevum (terverifikasi 15 Nov 2026 — lihat `RESEARCH.md`)

| Parameter | Nilai |
|---|---|
| Chain ID | **44005** |
| RPC | **https://rpc-test.qday.info** |
| Gas token | test-$QDAY (tQDAY, tanpa nilai uang) |
| Faucet gas | **https://faucet.qday.info** (klaim pertama; setelah itu widget faucet di Wiki) |
| Explorer | https://explorer-test.qday.info |
| Token pembayaran | **tUSD8** (test stablecoin USD8) |
| Alamat kontrak tUSD8 | **DITEMUKAN 16 Nov 2026** — `0x456569838f1d43009A91ebA4263147Afd7233483` (6 desimal) — lihat `RESEARCH.md` §6 (revisi) |

Jangan tertukar: chain ID 44001 = jaringan QDay Origin (mainnet lama), 44003 = testnet Origin. **Aevum testnet selalu 44005.**

## Akun yang dibutuhkan user (dibuat oleh user sendiri — BUKAN oleh asisten)

Asisten **tidak** mendaftar/membuat akun atas nama siapa pun. Yang perlu disiapkan user:

1. **Akun DoraHacks** — untuk registrasi dan submit entry (tautan ada di halaman MoonHub).
2. **Akun GitHub** — untuk repo publik berisi source code (dibuat saat window dibuka).
3. **Wallet EVM baru khusus testnet** (mis. MetaMask) — hanya untuk testnet, jangan pakai wallet berisi dana asli. Private key-nya hanya untuk deploy testnet dan disimpan di file `.env` lokal yang tidak pernah di-commit.
4. **(Opsional, saat submit)** akun hosting demo / Docker Hub — hanya bila dipilih untuk live deployment; diputuskan saat window dibuka.

Tidak ada pembayaran apa pun: hackathon gratis, testnet gratis, faucet gratis.

## Isi folder ini (dokumen tahap persiapan, 15 Nov 2026)

| File | Isi |
|---|---|
| `README.md` | File ini — status, link, deadline, ringkasan, langkah submit. |
| `ARCHITECTURE.md` | Desain lengkap Aevum PayLink: alur, kontrak, fungsi, event, struktur file yang AKAN dibuat, interface, rencana test. |
| `RESEARCH.md` | Hasil riset testnet + pencarian alamat kontrak tUSD8 (BELUM DITEMUKAN + fallback). |
| `IMPLEMENTATION_PLAN.md` | Checklist implementasi berurutan mulai 16 Nov 13:00 WIB + estimasi waktu. |

## Langkah submit (ringkas — detail di `IMPLEMENTATION_PLAN.md`)

1. **16 Nov 13:00 WIB:** daftar di DoraHacks (oleh user), unduh starter kit resmi, klaim tQDAY dari faucet, cari alamat tUSD8 resmi.
2. Tulis + test kontrak `PayLink` (Foundry), deploy ke Aevum testnet (chain 44005), verifikasi source di explorer.
3. Bangun interface web sederhana (buat + bayar + lacak invoice) + skrip demo.
4. Rekam demo singkat (alur end-to-end + hash transaksi + link explorer).
5. Push repo GitHub publik (README + arsitektur + alamat testnet + cara reproduksi).
6. Submit lewat DoraHacks sebelum 11 Des 15:00 WIB (target internal 9 Des).
7. Bila masuk Top 5: siapkan presentasi 3–5 menit untuk Demo Day 15 Des 13:00 WIB.

## Aturan kepatuhan folder ini

- **Tidak ada file source code** (`.sol`, `.js`, `.ts`, `.py`, dsb.) di folder ini per 15 Nov 2026.
- **Tidak ada secret/key** apa pun yang ditulis ke file mana pun.
- **Tidak ada deploy, tidak ada transaksi, tidak ada pembayaran** pada 15 Nov 2026.
- Semua alamat kontrak / angka yang belum terverifikasi ditandai jelas sebagai BELUM DITEMUKAN / ASUMSI — tidak dikarang.
