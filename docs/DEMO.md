# DEMO.md — PayLink live demo (Aevum testnet)

> Demo end-to-end yang benar-benar dijalankan di chain, bukan simulasi.
> Tanggal: 16 Nov 2026 ~13:29 WIB. Semua token testnet (tQDAY + tUSD8), tanpa uang asli.

## Setup

| Item | Nilai |
|---|---|
| Chain | Aevum testnet, chain ID 44005 |
| RPC | https://rpc-test.qday.info |
| Explorer | https://explorer-test.qday.info |
| Kontrak PayLink | [0x5da6Fa808f3F5C489d3eD49d7dB8bcf85B5Da5A3](https://explorer-test.qday.info/address/0x5da6Fa808f3F5C489d3eD49d7dB8bcf85B5Da5A3) |
| Token tUSD8 | [0x456569838f1d43009A91ebA4263147Afd7233483](https://explorer-test.qday.info/address/0x456569838f1d43009A91ebA4263147Afd7233483) (6 desimal) |
| Merchant (wallet A) | 0x1F610861eE5fE07fF93DC3408F175390149F8B78 |
| Payer (wallet B) | 0x21f43E7bf91f155cAd65d16241275850E1630eF0 (dibuat fresh untuk demo) |
| Deploy tx | [0xa30301fe90ea044653fde4dd195fd54ae1c19fafca6730983e65e55eece7e141](https://explorer-test.qday.info/tx/0xa30301fe90ea044653fde4dd195fd54ae1c19fafca6730983e65e55eece7e141) |
| Repo | https://github.com/Strescco/paylink |
| Interface web | `app/` di repo (static, buka `index.html` via server lokal) |
| Script test | `e2e-test.cjs` (full run) + `e2e-resume.cjs` (lanjut dari invoice yang sudah dibuat) |

## Alur demo (yang dijalankan)

### 0. Danai payer
Wallet A mengirim 1 tUSD8 + 0,05 tQDAY ke wallet B (gas untuk transaksi payer).

| Langkah | Tx |
|---|---|
| Kirim 1 tUSD8 (A → B) | [0x574c4e926d556b7c038043fa0ed16501b95984fbb4ae44306e5d2f00f409fd60](https://explorer-test.qday.info/tx/0x574c4e926d556b7c038043fa0ed16501b95984fbb4ae44306e5d2f00f409fd60) |
| Kirim 0,05 tQDAY (A → B) | [0x40d6f40aad44f7a4d1d99979f47df7213335a12746074d2edc5d3f9f5012f4ff](https://explorer-test.qday.info/tx/0x40d6f40aad44f7a4d1d99979f47df7213335a12746074d2edc5d3f9f5012f4ff) |

Saldo B sesudahnya (terverifikasi on-chain): 1,0 tUSD8 + 0,05 tQDAY.

### 1. Merchant membuat invoice #1
`createInvoice(payer=B, amount=1 tUSD8, expiresIn=24 jam, memo="Demo PayLink")`

| | |
|---|---|
| Tx | [0xfba03df882e709f413e4bfc16e80fc25fe632691d19df27c665e8f18afb2ed98](https://explorer-test.qday.info/tx/0xfba03df882e709f413e4bfc16e80fc25fe632691d19df27c665e8f18afb2ed98) |
| Hasil | Invoice #1: merchant=A, payer=B, amount=1.000.000 (1 tUSD8), status **Created** |

### 2. Payer approve tepat 1 tUSD8
`approve(PayLink, 1.000.000)` — tepat sebesar invoice, bukan unlimited.

| | |
|---|---|
| Tx | [0x3e8204db5aa9398fb268dc2f3672e169528b31fddc337738a81561ad3f08e162](https://explorer-test.qday.info/tx/0x3e8204db5aa9398fb268dc2f3672e169528b31fddc337738a81561ad3f08e162) |
| Hasil | Allowance B → PayLink = 1.000.000 (terverifikasi on-chain) |

### 3. Payer membayar invoice #1
`payInvoice(1)`

| | |
|---|---|
| Tx | [0x75efcf6a91eff7df2cb10465379567deb9c00d1b82571b12a8c597bf5494dda1](https://explorer-test.qday.info/tx/0x75efcf6a91eff7df2cb10465379567deb9c00d1b82571b12a8c597bf5494dda1) |
| Hasil | Status **Paid** (via `getInvoiceStatus`); escrow kontrak = 1.000.000 tUSD8; `paidAt` tercatat; `claimDeadline` = paidAt + 7 hari; `paidBy` = B |

### 4. Merchant menarik dana (settle)
`settleInvoice(1)`

| | |
|---|---|
| Tx | [0x025ba92894e09844aee11660362d825bcdee234550bd9364183f487e5d42ee62](https://explorer-test.qday.info/tx/0x025ba92894e09844aee11660362d825bcdee234550bd9364183f487e5d42ee62) |
| Hasil | Status **Settled**; saldo tUSD8 A: 4.000.000 → 5.000.000 (**+1 tUSD8 tepat**); saldo tUSD8 B: 0 |

## Saldo akhir (terverifikasi on-chain)

| Wallet | tUSD8 | tQDAY |
|---|---|---|
| A (merchant) | 5,0 | ~0,9496 |
| B (payer) | 0 | ~0,0498 |

Gas total untuk seluruh demo (6 tx + deploy): ~0,05 tQDAY — gas testnet nyaris gratis.

## Catatan
- Satu kegagalan kecil saat menjalankan script pertama: `tusd8.allowance is not a function` — ABI ERC-20 di script lupa mencantumkan `allowance`. Bukan kegagalan kontrak: transaksi approve-nya sendiri sukses (status 1), dan allowance 1.000.000 terverifikasi on-chain sebelum pay. Script diperbaiki (allowance ditambahkan ke ABI), lalu alur dilanjutkan dari invoice #1 yang sudah dibuat — invoice #1 tetap invoice demo.
- Source verification kontrak di explorer BELUM berhasil (2x submit via forge, getsourcecode masih kosong). Kontrak berjalan normal; source dapat dibaca di GitHub.
- Kasus refund/cancel/expired TIDAK didemokan di testnet kali ini (refund butuh menunggu 7 hari claim window; cancel/expired tercakup di 38/38 forge test lokal).
