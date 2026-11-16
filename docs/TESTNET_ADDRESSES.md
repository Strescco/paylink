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

## Kontrak PayLink v2 (hasil deploy 16 Nov 2026 ~15:00 WIB)

| Item | Nilai |
|---|---|
| PayLink v2 | `0x49841BDaA70a41D6a49dE1e87a6EF61215719167` |
| Deploy tx | `0x7dab31e9ea93a2ae405737e5597a010b61c9aac50e4aad5cb1b073e34dde570f` (status 1) |
| AgentRegistry | `0x432de42876b6e4416979924FEC83D8B678f50fb3` |
| Registry deploy tx | `0xaa97d36795dfbc1e776c27f68617379dba8b02af4912e1605689c98b7ab893b0` (status 1) |
| Authorize PayLink tx | `0xba6b4f3379f15490a751491487ba3e4f1387eb0bd0ae8146984b0fd7bbe3a2e1` (status 1) |
| Fee | 0,5% (50 bps) on settle → fee recipient = deployer (wallet A) |
| Token / registry / feeRecipient | terverifikasi on-chain via `cast call` (token = tUSD8 resmi, registry = alamat di atas, feeRecipient = wallet A, FEE_BPS = 50, authorized = true) |
| Source terverifikasi | Belum (Blockscout gagal 2× di v1; coba lagi untuk v2) |
| Explorer PayLink v2 | https://explorer-test.qday.info/address/0x49841BDaA70a41D6a49dE1e87a6EF61215719167 |
| Explorer AgentRegistry | https://explorer-test.qday.info/address/0x432de42876b6e4416979924FEC83D8B678f50fb3 |

### E2E v2 live (16 Nov 2026, `e2e-test-v2.cjs`) — PASS

Merchant A `0x1F610861eE5fE07fF93DC3408F175390149F8B78`, agent B `0x21f43E7bf91f155cAd65d16241275850E1630eF0`:

| Langkah | Tx |
|---|---|
| Fund 2 tUSD8 A→B | `0xc334ec163a7037e68cde764814d104364ae1af7a5fc1375d4bc04f2685d03db6` |
| B register agent | `0x19e6d01d37f687cd1649c366d956d98cc07319988140ec553f1b6923480d7920` |
| A approve B (cap 2 tUSD8, 7 hari) | `0xc845b164be252889c8b178c36c1886aa565c5641c200ec181fea66f2e5f08606` |
| Invoice #1 create (1 tUSD8) | `0x0dfaa1aadd02a85490e616255ec690f7fad9b5b56359a894de742ad7c61c5005` |
| Invoice #1 pay (spent 1/2) | `0x2c679a72b98a6fdd082fdc16379f7907d4e2cf9c5c6019e6bb74f1022e4a4b94` |
| Invoice #2 create (1 tUSD8) | `0x16265b5ef3f222f1f91f7c026cfcd8cc39b567ad3e8ddf519e2c4935e4e8796d` |
| Invoice #2 pay (spent 2/2 = cap) | `0x085000fcd5e03a5b5346aaa7f7d256f8c8d4de6e2e456d36b5ca3e0fbd562ef5` |
| Invoice #3 create (over-cap test) | `0xf216ca6a33487312bb24801c2b5e88cb54d1765c2d39e538865e5b38fa1cf735` |
| Pay #3 → revert `AgentCapExceeded` (static call, no tx) | — |
| A revoke B | `0xf36442f03489b1bc37df8def0fa578ce8b7c3a4b1c1b32f8cf9a63a7cfc3a322` |
| Invoice #4 create (revoked test) | `0x73a81ca41cb8b31267388e005a9d7348cda97126e07e82b4701845bf699ee43b` |
| Pay #4 → revert `AgentNotApproved` (static call, no tx) | — |
| Settle #1 (fee 0.005, net 0.995, reputasi 1 / 1.0) | `0x986cbcfc71fc753ac1b3790c7e85362872d064cb9c802943d4672459326dbe1f` |
| Settle #2 (reputasi 2 / 2.0) | `0xc33d81f42410f5f8674e058f18e10ad1ed6f7b49b34aeda818afd5ad97e81067` |

Saldo akhir: A 5.0 tUSD8, B 0, escrow 0. Gas A tersisa ~0.948 tQDAY, B ~0.049 tQDAY.

### v1 (superseded — disimpan untuk arsip)

| Item | Nilai |
|---|---|
| PayLink v1 | `0x5da6Fa808f3F5C489d3eD49d7dB8bcf85B5Da5A3` |
| Deploy tx v1 | `0xa30301fe90ea044653fde4dd195fd54ae1c19fafca6730983e65e55eece7e141` |

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
