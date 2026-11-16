# PayLink — web interface (`app/`)

Static single-page interface for the PayLink contract on Aevum testnet
(chain 44005). No backend, no build step, no framework — plain HTML/CSS/vanilla JS
+ ethers.js v6 from CDN. All state is read straight from the chain.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure: wallet, create invoice, agents (v2), find invoice, all invoices, how-it-works |
| `app.js` | All logic: connect, network add/switch, create/pay/settle/refund/cancel, invoice list + detail, agent register/approve/revoke/lookup |
| `config.js` | **Single config**: chain, RPC, explorer, tUSD8 address, faucet links, `PAYLINK_ADDRESS` (v2), `REGISTRY_ADDRESS` |
| `abi.js` | PayLink v2 + AgentRegistry ABIs generated from `out/*.json` (regenerate after any contract change) |
| `paylink-sdk.js` | Reusable client module (browser + Node): create/pay/settle/refund/cancel, agent approve/revoke/register, reputation reads, x402-style invoice links |
| `styles.css` | Dark, responsive (desktop + phone) |

## Run / preview

```bash
cd app
python3 -m http.server 8000
# open http://localhost:8000/ in a browser with MetaMask (or any injected EVM wallet)
```

No install step. The page also works opened directly as a file, but a local
server is recommended (some wallets block `file://` pages).

## Current state (16 Nov 2026)

- **PayLink v2 DEPLOYED on Aevum testnet:** `0x49841BDaA70a41D6a49dE1e87a6EF61215719167`
  (deploy tx `0x7dab31e9ea93a2ae405737e5597a010b61c9aac50e4aad5cb1b073e34dde570f`).
- **AgentRegistry DEPLOYED:** `0x432de42876b6e4416979924FEC83D8B678f50fb3`
  (deploy tx `0xaa97d36795dfbc1e776c27f68617379dba8b02af4912e1605689c98b7ab893b0`).
  PayLink is authorized in the registry (tx `0xba6b4f3379f15490a751491487ba3e4f1387eb0bd0ae8146984b0fd7bbe3a2e1`).
- **`PAYLINK_ADDRESS` + `REGISTRY_ADDRESS` in `config.js` are set** — the UI is live.
  Verify both contracts in the explorer (see `docs/TESTNET_ADDRESSES.md`).

## Features

- Connect wallet (MetaMask / injected provider), add + switch to Aevum testnet (44005)
- Create invoice: amount (tUSD8), optional payer address (blank = anyone), expiry
  1h / 24h / 7d / 30d, memo (max 200 chars)
- Pay: approves **exactly** the invoice amount, then pays (two transactions,
  both hashes + explorer links shown)
- Settle (merchant only), Refund (payer only, after the 7-day claim window),
  Cancel (merchant only, unpaid invoices)
- **v2 — Agents:** register as an agent, merchant approves an agent with a
  spending cap + expiry, revoke anytime, look up an agent's approval
  (cap/spent/expiry) and on-chain reputation (settled count + volume).
  Settle shows the net amount after the 0.5% protocol fee.
- Invoice list read from the contract (`nextInvoiceId` scan, newest first) +
  single-invoice lookup with shareable deep link (`?invoice=N`) and copy-link button
- Amounts formatted with `decimals()` read live from the tUSD8 token (verified 6);
  all revert reasons mapped to plain-language messages
- Balances: tQDAY (gas) + tUSD8 for the connected wallet

## Tests done (16 Nov 2026)

- `node --check` clean on all JS files; all assets serve HTTP 200 locally.
- jsdom smoke test, not-deployed path: **12/12 PASS** — banner visible, actions
  disabled, no JS errors, faucet + tUSD8 links present.
- jsdom smoke test, deployed path (stubbed contract, 2 canned invoices):
  **9/9 PASS** — list renders, deep link loads detail, Created pill, pay button,
  amounts with 6 decimals, no JS errors.
- **Live E2E v2 on testnet (16 Nov 2026, `e2e-test-v2.cjs`): PASS** — register
  agent → approve (cap 2 tUSD8) → pay 2× 1 tUSD8 (spent hits cap) →
  over-cap pay reverts `AgentCapExceeded` → revoke → pay reverts
  `AgentNotApproved` → settle ×2 (fee 0.005 tUSD8 each, reputation 2 / 2.0 tUSD8),
  final balances reconcile (merchant 5.0, agent 0, escrow 0).
