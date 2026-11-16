// PayLink — configuration. Single place to update after deploy.
// All values verified against QDay docs / explorer (see docs/TESTNET_ADDRESSES.md).
const CONFIG = {
  // >>> FILL THIS IN AFTER DEPLOY <<<
  // PayLink contract address on Aevum testnet. Empty = not deployed yet:
  // the UI shows a "contract not deployed yet" state instead of breaking.
  PAYLINK_ADDRESS: "0x5da6Fa808f3F5C489d3eD49d7dB8bcf85B5Da5A3",

  // Aevum testnet (QDay) — chain 44005 (0xABE5)
  CHAIN_ID: 44005,
  CHAIN_ID_HEX: "0xabe5",
  CHAIN_NAME: "Aevum Testnet",
  RPC_URL: "https://rpc-test.qday.info",
  EXPLORER_URL: "https://explorer-test.qday.info",
  EXPLORER_TX: "https://explorer-test.qday.info/tx/",
  EXPLORER_ADDRESS: "https://explorer-test.qday.info/address/",
  NATIVE_CURRENCY: { name: "tQDAY", symbol: "tQDAY", decimals: 18 },

  // tUSD8 — verified on-chain (name/symbol tUSD8, decimals 6, totalSupply 12.5M)
  TUSD8_ADDRESS: "0x456569838f1d43009A91ebA4263147Afd7233483",
  TUSD8_SYMBOL: "tUSD8",
  TUSD8_DECIMALS_FALLBACK: 6, // only used before the token is read live

  // Faucets
  FAUCET_GAS_URL: "https://faucet.qday.info", // tQDAY gas (5 tQDAY / 24h)

  // Contract rules (mirror the on-chain constants; read live when possible)
  CLAIM_WINDOW_DAYS: 7,
  MIN_DURATION_HOURS: 1,
  MAX_DURATION_DAYS: 30,
  MAX_MEMO_BYTES: 200,
};
