# RESEARCH.md — Riset Testnet Aevum + Pencarian Alamat Kontrak tUSD8

> Riset dilakukan **15 November 2026** (sebelum build window dibuka).
> Sumber yang dikutip di bawah ini benar-benar dibuka/dibaca pada tanggal tersebut.
> Apa pun yang tidak ditemukan ditulis sebagai BELUM DITEMUKAN — tidak ada alamat yang dikarang.

## 1. Ringkasan hasil

| Item | Status | Nilai / catatan |
|---|---|---|
| Chain ID Aevum testnet | ✅ TERKONFIRMASI | **44005** |
| RPC Aevum testnet | ✅ TERKONFIRMASI | **https://rpc-test.qday.info** |
| Faucet gas testnet | ✅ TERKONFIRMASI | **https://faucet.qday.info** |
| Gas token | ✅ TERKONFIRMASI | test-$QDAY (tQDAY), tanpa nilai uang |
| Explorer Aevum testnet | ✅ TERKONFIRMASI | **https://explorer-test.qday.info** |
| Token pembayaran | ✅ TERKONFIRMASI (keberadaannya) | **tUSD8** — test stablecoin USD8 di Aevum testnet |
| **Alamat kontrak tUSD8** | ❌ **BELUM DITEMUKAN** | Tidak ada alamat yang diterbitkan di sumber resmi yang berhasil dibuka/dicari hari ini |
| Halaman hackathon + timeline + hadiah | ✅ TERKONFIRMASI | MoonHub (lihat §2.4) |
| Aturan code-window | ✅ TERKONFIRMASI (verbatim) | "All code must be developed during the build window." |

## 2. Konfirmasi testnet (dengan sumber)

### 2.1 Chain ID 44005, RPC, faucet — sumber: qday.io (situs resmi QDay)

Dibuka 15 Nov 2026. Halaman utama qday.io menyatakan:

- "Aevum Testnet is live · Chain ID 44005"
- Langkah developer: "Add the network Chain ID 44005 · RPC rpc-test.qday.info"
- "Get testnet tQDAY — Claim gas from the onchain faucet. faucet.qday.info"
- "Deploy your contract — Ship with Foundry, Hardhat or Remix, then verify it on the explorer."
- Roadmap di halaman yang sama: "Enhanced Payment on Aevum Testnet — Phase 1.5: modular Polygon CDK upgrade is live; x402 facilitator and stablecoin paymaster coming soon." (Artinya: fitur x402/paymaster BELUM live — desain v1 PayLink sengaja tidak bergantung pada fitur itu.)
- "1 Gwei = 10⁻⁹ tQDAY" (satuan gas).

Sumber: https://qday.io/

### 2.2 Konfirmasi silang — panduan "Aevum Testnet: How do I get started?" (PQA Labs, Medium, 16 Okt 2026)

Dibuka dan dibaca penuh 15 Nov 2026. Poin yang dikonfirmasi:

- Tiga chain ID QDay yang aktif: `44001` = jaringan Origin mainnet, `44003` = testnet Origin, **`44005` = Aevum Testnet**. Penulis menekankan: "If your wallet or script shows a chain ID other than 44005, stop and fix it before you sign anything."
- Aevum EVM-compatible: Solidity, MetaMask, Remix, Foundry, Hardhat, ethers.js, viem, wagmi — semuanya bekerja seperti di Ethereum; yang diubah hanya endpoint.
- Faucet: widget di Wiki memanggil kontrak faucet; klaim PERTAMA harus lewat `faucet.qday.info` karena klaim lewat widget adalah transaksi yang butuh gas, sementara wallet baru bersaldo nol. Faucet memberlakukan cooldown per alamat dan hanya menerima klaim dari EOA (bukan dari kontrak).
- Gas mengikuti model EIP-1559 (base fee + priority fee).
- Verifikasi kontrak: explorer Aevum memakai Blockscout; perintah verifikasi Foundry memakai `--chain-id 44005`, `--verifier blockscout`, `--verifier-url https://explorer-test.qday.info/api`.
- **Peringatan penting:** beberapa contoh kode di Wiki bagian Technical masih memakai `https://rpc.qday.io` dan chain ID `44001` (nilai mainnet Origin). Untuk Aevum Testnet, ganti ke `https://rpc-test.qday.info` dan `44005`.
- FAQ Wiki (dirujuk panduan ini): "The FAQ also lists ERC-20 test tokens on Aevum, including USD8, QDay's USD-pegged stablecoin (FAQ 3.8). Confirm any token address on the explorer before you build against it, and never reuse token addresses from the original network's testnet (44003) on Aevum."
- Fitur stablecoin payment, x402, agent wallet, dan registrasi agen dinyatakan "coming, with documentation, tools and examples to be published when each one launches (FAQ section 5)".

Sumber: https://pqalabs.medium.com/aevum-testnet-how-do-i-get-started-qday-4dd0a6d64a34

### 2.3 Explorer + tUSD8 disebut — sumber: QDay Wiki, User Guide

Dibuka 15 Nov 2026: https://wiki.qday.info/guide/handbook/user-guide/

- Tabel explorer: "Testnet (QDay Aevum) | explorer-test.qday.info" dan "QDay Mainnet | In development".
- "Address details — see tQDAY, WABEL, and **tUSD8** balances, history, and verified contract source when available."
- Ini mengkonfirmasi tUSD8 adalah token yang dikenal explorer Aevum testnet (saldo tUSD8 bisa dilihat di halaman alamat), TETAPI halaman ini **tidak memuat alamat kontraknya**.

### 2.4 Hackathon — sumber: MoonHub (dibuka 15 Nov 2026)

https://moonhub.tools/hackathons/aevum-builder-challenge-1-aabed41f03e2

- "Aevum Builder Challenge #1 is a free, online hackathon for developers worldwide. Builders are challenged to ship practical stablecoin payment related applications on the Aevum testnet (the official testnet for QDay.io) using tUSD8. Participants deliver one end-to-end flow — including a smart contract, a simple interface or script, verified source code, and a short demo."
- Timeline: "16 Nov, 14:00 HKT (06:00 UTC): Registration opens; starter kit released." / "16 Nov – 11 Dec: Build period" / "11 Dec, 16:00 HKT (08:00 UTC): Submissions close" / "12 – 14 Dec: Judging period." / "15 Dec, 14:00 HKT (06:00 UTC): Demo Day: Top 5 finalist presentations and winner announcements."
- Hadiah: total $1,500 USDT — 1st $800, 2nd $500, 3rd $200.
- Starter kit: https://drive.google.com/file/d/1YL574BFJTnZ9Z-WzkZMyuQnWNUOgUJ6l/view?usp=sharing
- Build Constraints (verbatim): "All code must be developed during the build window. All smart contracts must run on the Aevum testnet with test tokens only (no tokens are issued or promised)."
- Submit: repo GitHub publik + bukti integrasi Aevum + live deployment/Docker + dokumentasi + video pitch/demo (Top 5 presentasi 3–5 menit via video call).
- Tim: solo atau 2–4 orang.
- Pemenang: fast track ke program builder mainnet (mainnet Feb 2027).

### 2.5 Alamat kontrak FAUCET (bukan tUSD8 — jangan tertukar)

Panduan PQA Labs §2.2 di atas menyebut satu alamat kontrak: **`0xE5074CBbd046AFb491EB8692abD6cF7ECCC6dEE5`** — itu adalah **kontrak faucet tQDAY**, yang tercantum di halaman "Official contract addresses" Wiki.

**Alamat ini BUKAN alamat tUSD8.** Jangan pernah memakai alamat faucet sebagai alamat token pembayaran. Alamat ini dicatat di sini hanya agar tidak terjadi kebingungan saat membaca halaman alamat resmi nanti.

## 3. Pencarian alamat kontrak tUSD8 — HASIL: BELUM DITEMUKAN

### 3.1 Di mana sudah dicari (15 Nov 2026)

| # | Tempat dicari | Cara | Hasil |
|---|---|---|---|
| 1 | qday.io (situs resmi) | Dibuka dan dibaca penuh | Tidak ada alamat kontrak token apa pun di halaman utama |
| 2 | QDay Wiki — User Guide (wiki.qday.info/guide/handbook/user-guide/) | Dibuka dan dibaca penuh | tUSD8 disebut sebagai saldo yang bisa dilihat di explorer; alamat tidak dicantumkan |
| 3 | Panduan PQA Labs / Medium (16 Okt 2026) | Dibuka dan dibaca penuh | Merujuk ke FAQ 3.8 Wiki untuk daftar token test ERC-20 termasuk USD8, dan ke halaman "Official contract addresses" Wiki — tetapi TIDAK menulis alamat tUSD8 itu sendiri |
| 4 | Pencarian web `"tUSD8" QDay Aevum` | browser.search | Tidak ada hasil berisi alamat; hasil relevan hanya Wiki User Guide + situs USD8 umum (usd8.io — stablecoin di Abelian/QDay Origin, bukan alamat testnet Aevum) |
| 5 | Pencarian web `Aevum tUSD8 stablecoin contract address testnet` | browser.search | Tidak ada hasil relevan (hasil didominasi token lain: TST, USDT, USDC, Aave) |
| 6 | Pencarian web `site:qday.io Aevum testnet tUSD8 OR stablecoin` | browser.search | Hanya qday.io; tidak ada halaman alamat token |
| 7 | Pencarian web `QDay Wiki official contract addresses Aevum tUSD8 faucet` | browser.search | Tidak ada hasil berisi alamat tUSD8 |
| 8 | Halaman hackathon MoonHub | Dibuka dan dibaca penuh | Menyebut tUSD8 sebagai token yang dipakai, tanpa alamat kontrak |

### 3.2 Mengapa alamat ini belum ditemukan (penjelasan jujur)

- Halaman "Official contract addresses" Wiki dirujuk oleh panduan, tetapi URL langsung halaman itu tidak diperoleh dari hasil pencarian hari ini dan **tidak ditebak** (menebak URL berisiko membuka halaman palsu/berbeda).
- FAQ Wiki bagian 3.8 (daftar token test ERC-20 termasuk USD8) juga dirujuk panduan, tetapi isi lengkap FAQ tidak berhasil dibuka/dibaca hari ini.
- Kemungkinan besar alamat tUSD8 diterbitkan di **starter kit resmi** yang baru dirilis saat registrasi dibuka (16 Nov 14:00 HKT) — yaitu SETELAH riset ini dibuat. Itu konsisten dengan timeline MoonHub ("starter kit released" bersamaan dengan pembukaan registrasi).

### 3.3 Yang TIDAK dilakukan

- Tidak memakai alamat dari situs USD8 umum (usd8.io / usd8.ai) sebagai alamat tUSD8 Aevum — situs-situs itu membahas USD8 di Abelian / QDay Origin / HyperEVM, bukan Aevum testnet chain 44005, dan tidak memuat alamat testnet Aevum.
- Tidak memakai alamat faucet `0xE5074C…dEE5` sebagai alamat token.
- Tidak menebak/mengarang alamat apa pun.

## 4. Rencana fallback (bila alamat resmi belum ada saat window dibuka)

Rencana ini sudah tertanam di desain (`ARCHITECTURE.md` §3.5, §7) dan diulang di sini agar tidak hilang:

1. **Langkah pertama 16 Nov 13:00 WIB:** unduh starter kit resmi dari tautan MoonHub dan baca isinya — kemungkinan besar alamat tUSD8 ada di sana.
2. **Langkah kedua:** buka halaman "Official contract addresses" dan FAQ 3.8 di QDay Wiki (navigasi dari wiki.qday.info, bukan dari tebakan URL), dan cari "tUSD8" / "USD8" di halaman tersebut.
3. **Langkah ketiga:** cari token di explorer https://explorer-test.qday.info — cari berdasarkan nama/symbol "tUSD8" / "USD8" di kolom pencarian explorer; verifikasi `name()`, `symbol()`, `decimals()`, dan total supply di halaman kontrak sebelum dipakai.
4. **Langkah keempat (bila 1–3 gagal):** tanyakan lewat kanal resmi QDay (grup Telegram resmi yang dirujuk FAQ 7.6 / kanal dukungan di Wiki) — jangan pernah menerima alamat dari DM atau akun yang mengaku "support".
5. **Sementara itu, JANGAN blokir pekerjaan:** tulis dan uji kontrak terhadap **MockTUSD8 lokal** (token ERC-20 tiruan, file rencana `contracts/mocks/MockTUSD8.sol`) — kontrak PayLink menerima alamat token lewat constructor, jadi mengganti mock dengan alamat resmi hanya berarti deploy ulang dengan parameter berbeda, tanpa mengubah kode kontrak. Begitu alamat resmi ditemukan dan diverifikasi, lakukan satu putaran test integrasi di testnet terhadap token asli sebelum submit.
6. **Aturan verifikasi alamat (wajib sebelum dipakai):** alamat harus (a) berasal dari sumber resmi QDay/Aevum (Wiki / starter kit / explorer), (b) di explorer terlihat sebagai kontrak token dengan symbol tUSD8/USD8, (c) `decimals()`/`symbol()`/`name()` dibaca dan dicatat. Bila dua sumber resmi memberi alamat berbeda, BERHENTI dan cari tahu penyebabnya — jangan pilih salah satu secara acak.

## 5. Parameter jaringan — tabel final untuk build

| Parameter | Nilai | Status |
|---|---|---|
| Network name | QDay Aevum (testnet) | Terkonfirmasi |
| Chain ID | 44005 (0xABF5 hex) | Terkonfirmasi (qday.io + panduan PQA Labs) |
| RPC URL | https://rpc-test.qday.info | Terkonfirmasi (qday.io + panduan PQA Labs) |
| Currency symbol | tQDAY (test-$QDAY) | Terkonfirmasi |
| Currency decimals | 18 (native) | Standar EVM; dikonfirmasi ulang saat tambah network |
| Block explorer | https://explorer-test.qday.info | Terkonfirmasi (Wiki + panduan) |
| Faucet | https://faucet.qday.info | Terkonfirmasi (qday.io + panduan) |
| Faucet contract (tQDAY) | 0xE5074CBbd046AFb491EB8692abD6cF7ECCC6dEE5 | Terkonfirmasi dari panduan PQA Labs — INI FAUCET, BUKAN tUSD8 |
| Token pembayaran | tUSD8 | Keberadaan terkonfirmasi (Wiki + MoonHub); alamat BELUM DITEMUKAN |
| Alamat kontrak tUSD8 | — | **BELUM DITEMUKAN (15 Nov 2026)** |

**Jangan tertukar dengan jaringan lain:** 44001 = QDay Origin mainnet, 44003 = QDay Origin testnet. Alamat/kontrak/saldo tidak berpindah antar jaringan.

## 6. Catatan untuk revisi dokumen ini

### ✅ REVISI 16 Nov 2026 ~13:15 WIB — ALAMAT tUSD8 DITEMUKAN

Alamat tUSD8 resmi **ditemukan dan terverifikasi**:

| Item | Nilai |
|---|---|
| Alamat kontrak tUSD8 | **`0x456569838f1d43009A91ebA4263147Afd7233483`** |
| Chain | QDay Aevum testnet, chain ID 44005 |
| `name()` (on-chain, via RPC) | `tUSD8` |
| `symbol()` (on-chain, via RPC) | `tUSD8` |
| `decimals()` (on-chain, via RPC) | **6** |
| `totalSupply()` (on-chain, via RPC) | 12.500.000 tUSD8 (0x2ED1BFBEE00 base unit) |
| Explorer | https://explorer-test.qday.info/address/0x456569838f1d43009A91ebA4263147Afd7233483 |

**Tiga sumber resmi independen yang semuanya memberi alamat yang SAMA:**
1. QDay Wiki FAQ §3.8 "Which tokens are available on Aevum?" — https://wiki.qday.info/guide/faq
2. qday.io Official Links & Addresses — https://qday.io/official-links (terverifikasi terakhir 10 Nov 2026)
3. QDay Wiki MetaMask User Guide, "Token Contract Address List" — https://wiki.qday.info/guide/handbook/user-guide/metamask/

Verifikasi on-chain dilakukan 16 Nov 2026 via `eth_call` ke RPC https://rpc-test.qday.info (chainId 0xabe5 = 44005): `name()`/`symbol()`/`decimals()`/`totalSupply()` semuanya terbaca dan konsisten dengan dokumen resmi. **Status BELUM DITEMUKAN di `README.md` + `ARCHITECTURE.md` §3.5 SUDAH DICORET** — desimal tUSD8 = **6** (bukan asumsi lagi).

**Implikasi untuk build:**
- `MockTUSD8.sol` memakai desimal 6 agar test lokal identik dengan token asli.
- Test memakai jumlah dalam satuan terkecil 6 desimal (10 tUSD8 = 10.000.000).
- `script/Deploy.s.sol` memakai alamat di atas sebagai default via `TUSD8_ADDRESS`.
- Mock tetap HANYA untuk test lokal — deploy testnet memakai alamat resmi ini.
