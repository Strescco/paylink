# TESTNET_ADDRESSES.md — Aevum PayLink (chain 44005)

> Diperbarui 16 Nov 2026 ~13:20 WIB. Semua alamat di bawah diverifikasi di
> https://explorer-test.qday.info sebelum dipakai.

## Token resmi tUSD8 (terverifikasi)

| Item | Nilai |
|---|---|
| Alamat kontrak | `0x456569838f1d43009A91ebA4263147Afd7233483` |
| `name()` / `symbol()` | `tUSD8` / `tUSD8` |
| `decimals()` | **6** |
| `totalSupply()` | 12.500.000 tUSD8 |
| Sumber | QDay Wiki FAQ §3.8 + qday.io/official-links + Wiki MetaMask guide (ketiganya sama) |
| Explorer | https://explorer-test.qday.info/address/0x456569838f1d43009A91ebA4263147Afd7233483 |

## Jaringan

| Item | Nilai |
|---|---|
| Network | QDay Aevum testnet |
| Chain ID | 44005 (0xABE5) |
| RPC | https://rpc-test.qday.info |
| Explorer | https://explorer-test.qday.info |
| Faucet gas (tQDAY) | https://faucet.qday.info |
| Kontrak faucet tQDAY | `0xE5074CBbd046AFb491EB8692abD6cF7ECCC6dEE5` (BUKAN tUSD8) |

## Kontrak PayLink (hasil deploy)

| Item | Nilai |
|---|---|
| Alamat kontrak PayLink | _BELUM DI-DEPLOY — butuh wallet testnet + tQDAY_ |
| Hash transaksi deploy | — |
| Link explorer | — |
| Source terverifikasi | — |

## Cara verifikasi alamat mana pun

1. Buka https://explorer-test.qday.info/address/<alamat>.
2. Pastikan halaman menunjukkan kontrak token dengan symbol yang diharapkan.
3. Jangan pernah memakai alamat dari DM/chat — hanya dari Wiki / qday.io / starter kit resmi.

## Deploy PayLink — 16 Nov 2026 ~13:24 WIB (TERVERIFIKASI ON-CHAIN)
- Kontrak PayLink: 0x5da6Fa808f3F5C489d3eD49d7dB8bcf85B5Da5A3
- Tx deploy: 0xa30301fe90ea044653fde4dd195fd54ae1c19fafca6730983e65e55eece7e141 (receipt status 1)
- Deployer: 0x1F610861eE5fE07fF93DC3408F175390149F8B78 (wallet testnet baru)
- token() on-chain = 0x456569838f1d43009A91ebA4263147Afd7233483 (tUSD8 resmi, desimal 6)
- Explorer: https://explorer-test.qday.info/address/0x5da6Fa808f3F5C489d3eD49d7dB8bcf85B5Da5A3
- Verifikasi source di explorer: BELUM berhasil (2x submit, GUID terakhir 5da6fa808f3f5c489d3ed49d7db8bcf85b5da5a36afaa1e4; getsourcecode masih kosong) — kontrak jalan normal, source bisa dibaca di GitHub.
- Gas dipakai: 1 tQDAY dari Discord /faucet (1 tQDAY + 5 tUSD8, 16 Nov 13:23 WIB). Saldo wallet sesudah deploy: tQDAY ~1.0 (gas testnet nyaris 0).
- Catatan: deploy pertama GAGAL broadcast (forge pakai default sender karena --sender/--private-key tidak di-pass; alamat prediksi 0x5b73... kosong, tidak ada kode). Deploy kedua dengan --sender + --private-key berhasil.
