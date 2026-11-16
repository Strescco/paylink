# PayLink — web interface (`app/`)

Static single-page interface for the PayLink contract on Aevum testnet
(chain 44005). No backend, no build step, no framework — plain HTML/CSS/vanilla JS
+ ethers.js v6 from CDN. All state is read straight from the chain.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure: wallet, create invoice, find invoice, all invoices, how-it-works |
| `app.js` | All logic: connect, network add/switch, create/pay/settle/refund/cancel, invoice list + detail |
| `config.js` | **Single config**: chain, RPC, explorer, tUSD8 address, faucet links, `PAYLINK_ADDRESS` |
| `abi.js` | PayLink ABI copied verbatim from `out/PayLink.sol/PayLink.json` (regenerate after any contract change) |
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

- **`PAYLINK_ADDRESS` in `config.js` is EMPTY — the contract is not deployed yet.**
  The UI shows a clear "contract not deployed yet" banner and disables all
  contract actions instead of breaking. Wallet connect, add-network and the
  faucet links still work.
- **After deploy:** set `PAYLINK_ADDRESS` in `config.js` to the deployed
  address — nothing else needs changing. The UI verifies nothing about the
  address itself; verify it in the explorer first (see `docs/TESTNET_ADDRESSES.md`).

## Features

- Connect wallet (MetaMask / injected provider), add + switch to Aevum testnet (44005)
- Create invoice: amount (tUSD8), optional payer address (blank = anyone), expiry
  1h / 24h / 7d / 30d, memo (max 200 chars)
- Pay: approves **exactly** the invoice amount, then pays (two transactions,
  both hashes + explorer links shown)
- Settle (merchant only), Refund (payer only, after the 7-day claim window),
  Cancel (merchant only, unpaid invoices)
- Invoice list read from the contract (`nextInvoiceId` scan, newest first) +
  single-invoice lookup with shareable deep link (`?invoice=N`) and copy-link button
- Amounts formatted with `decimals()` read live from the tUSD8 token (verified 6);
  all revert reasons mapped to plain-language messages
- Balances: tQDAY (gas) + tUSD8 for the connected wallet

## Tests done (16 Nov 2026, no deployed contract yet)

- `node --check` clean on all three JS files; all assets serve HTTP 200 locally.
- jsdom smoke test, not-deployed path: **12/12 PASS** — banner visible, actions
  disabled, no JS errors, faucet + tUSD8 links present.
- jsdom smoke test, deployed path (stubbed contract, 2 canned invoices):
  **9/9 PASS** — list renders, deep link loads detail, Created pill, pay button,
  amounts with 6 decimals, no JS errors.
- **Not yet tested live:** real wallet connect + real transactions on testnet.
  Do that right after deploy (needs tQDAY gas).
