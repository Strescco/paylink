# BEST-VERSION-PLAN.md — PayLink, Aevum Builder Challenge #1

> Target: 1st place ($800). Submit deadline 11 Dec 2026 15:00 WIB, internal target 9 Dec.
> Current state: PayLink deployed 0x5da6Fa808f3F5C489d3eD49d7dB8bcf85B5Da5A3 (44005), E2E passed, repo github.com/Strescco/paylink, silent demo video done.
> Research date: 16 Nov 2026. All QDay claims below were read live from wiki.qday.info.

## 1. QDay/Aevum platform features — what is REALLY usable on testnet 44005

**Honest headline: QDay says the agent features are "live on testnet", but publishes NO contract addresses, NO endpoints, NO SDK. Nothing below can be integrated via official tooling today.**

| Feature | Claimed status | Usable now? | Source |
|---|---|---|---|
| ERC-4337 smart accounts | "Live on Aevum testnet" | NO — no EntryPoint address, no bundler URL for 44005 published | https://wiki.qday.info/Knowledge/technical/developer-guide/wallet-integration ("Coming Q1 2027"; "EntryPoint and bundler details for the Aevum testnet will be published in the docs") |
| Scoped session keys + spending limits | "Live… policy engine with spending caps and time locks" | NO — same page, no addresses/docs | FAQ 5.3, https://wiki.qday.info/guide/faq ("Step-by-step documentation and contract addresses will be published in the docs") |
| Stablecoin paymaster (gas in USD8) | "Live on Aevum" | NO — no paymaster address published; EOAs still need tQDAY gas (FAQ 3.7) | FAQ 5.1, https://wiki.qday.info/guide/faq |
| x402 facilitator | "Live on Aevum" | NO — no endpoint published; qday.io roadmap itself says "coming soon" | FAQ 5.2, https://wiki.qday.info/guide/faq; https://qday.io/ (roadmap Phase 1.5) |
| ERC-8004 agent identity | Part of Phase 1.5 | NO — "Documentation will be published in the docs when it is available" | FAQ 5.4, https://wiki.qday.info/guide/faq |
| Official SDK `@qday-io/sdk` | Planned Q1 2027 | NO — not on npm | Wallet Integration page, FAQ 5.3 |

**Workaround (the winning move): build the agentic features OURSELVES, on-chain, self-contained.**
- Session keys / spending caps: enforce them inside PayLink (`approveAgent(agent, cap, expiry)` + per-agent spent tracking + revoke) — no QDay infra needed.
- ERC-8004-style identity: deploy a minimal `AgentRegistry` on 44005 ourselves (register + reputation from settled invoices); note in README it follows the ERC-8004 shape and will migrate to QDay's official registry when published.
- x402-style payment: add an HTTP endpoint pattern in the app (`402` + pay-by-invoice-link) using PayLink invoices as the settlement rail; document it as x402-compatible flow, not a claim of using QDay's facilitator.
- Do NOT claim integration with QDay infra that has no published address — judges verify on-chain; a fake claim is worse than an honest self-built one.

## 2. Top 3 upgrades (impact vs effort)

1. **Agent-native invoicing (contract): add `AgentRegistry` + agent spending caps/expiry/revoke in PayLink.** Merchant whitelists an agent address with a per-agent tUSD8 cap and expiry; agent pays invoices within cap; merchant revokes anytime; registry tracks settled-invoice reputation per agent. Fixes criteria 4 (innovation/agentic mechanics) + 5 (platform integration) + 7 (safety: least-privilege, spend caps, expiry, revocation). Effort: medium (1 new contract + tests + redeploy).
2. **Live refund/cancel demo + narrated video + architecture diagram in README.** Re-record demo showing refund after claim window + cancel live on testnet, add voiceover, add diagram to README. Fixes criteria 2 (demo) + 3 (docs). Effort: low.
3. **Fee + business model + tiny reusable JS SDK.** Add a small protocol fee (e.g. 0.5% on settle, capped, merchant-visible) with a business-model + mainnet-roadmap section in README, and ship `paylink-sdk.js` (create/pay/settle/refund wrappers) as a reusable module. Fixes criteria 6 (utility/business) + 8 (ecosystem/reusable components). Effort: low-medium.

## 3. What we will NOT fake

- No real merchants/traction before 9 Dec — say so in README; the agent-registry reputation is demo-verifiable on testnet instead.
- No claim of using QDay's paymaster/facilitator/EntryPoint — none is published; the plan file states this explicitly.

## 4. Build order (slow pace, best version first)

1. AgentRegistry + agent caps in PayLink → tests → redeploy v2 → E2E (agent pays within cap, revoke blocks, cap exceeded reverts).
2. Fee + SDK + README (diagram, business model, roadmap).
3. Re-record narrated demo (refund/cancel live) → YouTube → GitHub docs → DoraHacks submit ~9 Dec.
