// paylink-sdk.js — tiny reusable client for PayLink v2 on Aevum testnet (chain 44005).
//
// What it is: thin wrappers around the PayLink + AgentRegistry contracts
// (create / pay / settle / refund / cancel invoices; approve / revoke agents;
// register an agent; read reputation). No backend, no API keys — all state is
// on-chain. Bring your own ethers v6 (browser global `ethers`, or
// `require("ethers")` in Node) and your own signer.
//
// What it is NOT: it does not use any QDay paymaster, facilitator or
// EntryPoint — QDay publishes no addresses/endpoints for those on Aevum
// testnet (wiki.qday.info FAQ §5.1–5.4). The agent features here (spending
// caps, expiry, revocation, registry reputation) are enforced by the PayLink
// contracts themselves. The x402-style flow below is a pattern built on top
// of PayLink invoices (HTTP 402 + invoice link), not a claim of using QDay's
// facilitator.
//
// Browser usage:
//   <script src="https://cdn.jsdelivr.net/npm/ethers@6.13.2/dist/ethers.umd.min.js"></script>
//   <script src="paylink-sdk.js"></script>
//   <script>
//     const provider = new ethers.BrowserProvider(window.ethereum);
//     const sdk = new PayLinkSDK(provider, {
//       paylinkAddress: "0x49841BDaA70a41D6a49dE1e87a6EF61215719167",
//       registryAddress: "0x432de42876b6e4416979924FEC83D8B678f50fb3",
//       tokenAddress: "0x456569838f1d43009A91ebA4263147Afd7233483",
//     });
//     await sdk.connect(); // asks the wallet to connect
//     const id = await sdk.createInvoice({ payer: agentAddress, amount: "1.5", expiresInSeconds: 86400, memo: "Logo design" });
//   </script>
//
// Node usage:
//   const { ethers } = require("ethers");
//   const { PayLinkSDK } = require("./paylink-sdk.js");
//   const provider = new ethers.JsonRpcProvider("https://rpc-test.qday.info");
//   const sdk = new PayLinkSDK(provider, { paylinkAddress, registryAddress, tokenAddress });
//   sdk.withSigner(new ethers.Wallet(PRIVATE_KEY, provider));
//
// Amounts: human-readable tUSD8 strings ("1.5") in, base units (6 decimals) on-chain.
// All write methods return the mined receipt's transaction hash (string).
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PayLinkSDK = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var PAYLINK_ABI = [
    "function createInvoice(address payer, uint256 amount, uint256 expiresIn, string memo) returns (uint256)",
    "function payInvoice(uint256 invoiceId)",
    "function settleInvoice(uint256 invoiceId)",
    "function refundInvoice(uint256 invoiceId)",
    "function cancelInvoice(uint256 invoiceId)",
    "function approveAgent(address agent, uint256 cap, uint256 expiresIn)",
    "function revokeAgent(address agent)",
    "function getInvoice(uint256 invoiceId) view returns (tuple(uint256 id, address merchant, address payer, address token, uint256 amount, string memo, uint256 createdAt, uint256 expiresAt, uint256 paidAt, uint256 claimDeadline, address paidBy, uint8 status))",
    "function getInvoiceStatus(uint256 invoiceId) view returns (uint8)",
    "function getAgentApproval(address merchant, address agent) view returns (tuple(uint256 cap, uint256 spent, uint256 expiry, bool active))",
    "function feeFor(uint256 amount) view returns (uint256)",
    "function nextInvoiceId() view returns (uint256)",
    "function token() view returns (address)",
    "function registry() view returns (address)",
    "function feeRecipient() view returns (address)",
    "function FEE_BPS() view returns (uint256)",
    "function CLAIM_WINDOW() view returns (uint256)",
  ];
  var REGISTRY_ABI = [
    "function registerAgent(string name, string metadataURI)",
    "function isRegistered(address agent) view returns (bool)",
    "function getAgent(address agent) view returns (tuple(address owner, string name, string metadataURI, uint256 registeredAt, uint256 settledCount, uint256 settledVolume, bool exists))",
    "function reputation(address agent) view returns (uint256 settledCount, uint256 settledVolume)",
  ];
  var ERC20_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function transfer(address to, uint256 amount) returns (bool)",
  ];

  var STATUS_NAMES = ["Created", "Paid", "Settled", "Refunded", "Cancelled", "Expired"];
  var ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  function PayLinkSDK(provider, opts) {
    if (!provider) throw new Error("PayLinkSDK: provider is required");
    opts = opts || {};
    if (!opts.paylinkAddress) throw new Error("PayLinkSDK: paylinkAddress is required");
    if (!opts.tokenAddress) throw new Error("PayLinkSDK: tokenAddress is required");
    this.ethers = opts.ethers || (typeof ethers !== "undefined" ? ethers : null);
    if (!this.ethers) throw new Error("PayLinkSDK: ethers v6 is required (pass opts.ethers or load it globally)");
    this.provider = provider;
    this.paylinkAddress = opts.paylinkAddress;
    this.registryAddress = opts.registryAddress || ZERO_ADDRESS;
    this.tokenAddress = opts.tokenAddress;
    this.signer = null;
    this.address = null;
    this._decimals = 6; // tUSD8; read live on first use
    this._decimalsLoaded = false;
    this.paylink = new this.ethers.Contract(opts.paylinkAddress, PAYLINK_ABI, provider);
    this.token = new this.ethers.Contract(opts.tokenAddress, ERC20_ABI, provider);
    this.registry = this.registryAddress !== ZERO_ADDRESS
      ? new this.ethers.Contract(this.registryAddress, REGISTRY_ABI, provider)
      : null;
  }

  PayLinkSDK.STATUS_NAMES = STATUS_NAMES;
  PayLinkSDK.ZERO_ADDRESS = ZERO_ADDRESS;

  PayLinkSDK.prototype._requireSigner = function () {
    if (!this.signer) throw new Error("PayLinkSDK: no signer — call connect() or withSigner() first");
    return this.signer;
  };

  PayLinkSDK.prototype._paylinkWrite = function () {
    return this.paylink.connect(this._requireSigner());
  };

  PayLinkSDK.prototype._tokenWrite = function () {
    return this.token.connect(this._requireSigner());
  };

  PayLinkSDK.prototype._decimalsOf = async function () {
    if (!this._decimalsLoaded) {
      try { this._decimals = Number(await this.token.decimals()); } catch (e) { /* keep 6 */ }
      this._decimalsLoaded = true;
    }
    return this._decimals;
  };

  PayLinkSDK.prototype._toBase = async function (humanAmount) {
    return this.ethers.parseUnits(String(humanAmount), await this._decimalsOf());
  };

  PayLinkSDK.prototype._fromBase = async function (baseAmount) {
    return this.ethers.formatUnits(baseAmount, await this._decimalsOf());
  };

  // --- connection ---

  // Browser: ask the injected wallet to connect and use it as the signer.
  PayLinkSDK.prototype.connect = async function () {
    if (typeof this.provider.send !== "function") {
      throw new Error("PayLinkSDK: this provider cannot request accounts — use withSigner() instead");
    }
    await this.provider.send("eth_requestAccounts", []);
    this.signer = await this.provider.getSigner();
    this.address = await this.signer.getAddress();
    return this.address;
  };

  // Node / scripted: use an explicit signer (e.g. ethers.Wallet).
  PayLinkSDK.prototype.withSigner = function (signer) {
    this.signer = signer;
    return signer.getAddress().then((a) => { this.address = a; return a; });
  };

  // --- invoices (writes return the tx hash) ---

  // payer: address string, or null/undefined for an open invoice (anyone may pay).
  // amount: human tUSD8 string, e.g. "1.5". expiresInSeconds: 3600–2592000.
  PayLinkSDK.prototype.createInvoice = async function (opts) {
    var payer = opts.payer || ZERO_ADDRESS;
    var amount = await this._toBase(opts.amount);
    var tx = await this._paylinkWrite().createInvoice(payer, amount, opts.expiresInSeconds, opts.memo || "");
    var rc = await tx.wait();
    if (rc.status !== 1) throw new Error("createInvoice tx failed: " + tx.hash);
    // The new id is nextInvoiceId - 1 after creation.
    var next = await this.paylink.nextInvoiceId();
    return { invoiceId: Number(next) - 1, txHash: tx.hash };
  };

  // Pays an invoice in full. Approves exactly the invoice amount first if needed.
  PayLinkSDK.prototype.payInvoice = async function (invoiceId) {
    var inv = await this.paylink.getInvoice(invoiceId);
    var allowance = await this.token.allowance(this.address, this.paylinkAddress);
    if (allowance < inv.amount) {
      var atx = await this._tokenWrite().approve(this.paylinkAddress, inv.amount);
      var arc = await atx.wait();
      if (arc.status !== 1) throw new Error("approve tx failed: " + atx.hash);
    }
    var tx = await this._paylinkWrite().payInvoice(invoiceId);
    var rc = await tx.wait();
    if (rc.status !== 1) throw new Error("payInvoice tx failed: " + tx.hash);
    return tx.hash;
  };

  // Merchant withdraws a paid invoice (receives amount minus the 0.5% fee).
  PayLinkSDK.prototype.settleInvoice = async function (invoiceId) {
    var tx = await this._paylinkWrite().settleInvoice(invoiceId);
    var rc = await tx.wait();
    if (rc.status !== 1) throw new Error("settleInvoice tx failed: " + tx.hash);
    return tx.hash;
  };

  // Payer refunds a paid invoice after the 7-day claim window (full amount, fee-free).
  PayLinkSDK.prototype.refundInvoice = async function (invoiceId) {
    var tx = await this._paylinkWrite().refundInvoice(invoiceId);
    var rc = await tx.wait();
    if (rc.status !== 1) throw new Error("refundInvoice tx failed: " + tx.hash);
    return tx.hash;
  };

  PayLinkSDK.prototype.cancelInvoice = async function (invoiceId) {
    var tx = await this._paylinkWrite().cancelInvoice(invoiceId);
    var rc = await tx.wait();
    if (rc.status !== 1) throw new Error("cancelInvoice tx failed: " + tx.hash);
    return tx.hash;
  };

  // --- agents (v2) ---

  // Merchant: approve an agent to pay your invoices up to `cap` (human tUSD8),
  // for `expiresInSeconds` (3600–2592000). Re-approving resets spent to 0.
  PayLinkSDK.prototype.approveAgent = async function (agent, cap, expiresInSeconds) {
    var capBase = await this._toBase(cap);
    var tx = await this._paylinkWrite().approveAgent(agent, capBase, expiresInSeconds);
    var rc = await tx.wait();
    if (rc.status !== 1) throw new Error("approveAgent tx failed: " + tx.hash);
    return tx.hash;
  };

  PayLinkSDK.prototype.revokeAgent = async function (agent) {
    var tx = await this._paylinkWrite().revokeAgent(agent);
    var rc = await tx.wait();
    if (rc.status !== 1) throw new Error("revokeAgent tx failed: " + tx.hash);
    return tx.hash;
  };

  // Register the connected wallet as an agent in the AgentRegistry.
  PayLinkSDK.prototype.registerAgent = async function (name, metadataURI) {
    if (!this.registry) throw new Error("PayLinkSDK: no registry configured");
    var tx = await this.registry.connect(this._requireSigner()).registerAgent(name, metadataURI || "");
    var rc = await tx.wait();
    if (rc.status !== 1) throw new Error("registerAgent tx failed: " + tx.hash);
    return tx.hash;
  };

  // --- reads ---

  PayLinkSDK.prototype.getInvoice = async function (invoiceId) {
    var inv = await this.paylink.getInvoice(invoiceId);
    var status = Number(await this.paylink.getInvoiceStatus(invoiceId));
    return {
      id: Number(inv.id),
      merchant: inv.merchant,
      payer: inv.payer,
      token: inv.token,
      amount: await this._fromBase(inv.amount),
      amountBase: inv.amount,
      memo: inv.memo,
      createdAt: Number(inv.createdAt),
      expiresAt: Number(inv.expiresAt),
      paidAt: Number(inv.paidAt),
      claimDeadline: Number(inv.claimDeadline),
      paidBy: inv.paidBy,
      status: STATUS_NAMES[status] || "Unknown",
      statusCode: status,
    };
  };

  PayLinkSDK.prototype.getAgentApproval = async function (merchant, agent) {
    var ap = await this.paylink.getAgentApproval(merchant, agent);
    return {
      cap: await this._fromBase(ap.cap),
      capBase: ap.cap,
      spent: await this._fromBase(ap.spent),
      spentBase: ap.spent,
      expiry: Number(ap.expiry),
      active: ap.active,
    };
  };

  // Reputation of a registered agent: settled invoice count + settled volume (human tUSD8).
  PayLinkSDK.prototype.agentReputation = async function (agent) {
    if (!this.registry) throw new Error("PayLinkSDK: no registry configured");
    var rep = await this.registry.reputation(agent);
    return { settledCount: Number(rep[0]), settledVolume: await this._fromBase(rep[1]) };
  };

  PayLinkSDK.prototype.isAgentRegistered = async function (agent) {
    if (!this.registry) throw new Error("PayLinkSDK: no registry configured");
    return this.registry.isRegistered(agent);
  };

  // Protocol fee (human tUSD8) for a given invoice amount.
  PayLinkSDK.prototype.feeFor = async function (humanAmount) {
    var feeBase = await this.paylink.feeFor(await this._toBase(humanAmount));
    return this._fromBase(feeBase);
  };

  PayLinkSDK.prototype.nextInvoiceId = async function () {
    return Number(await this.paylink.nextInvoiceId());
  };

  PayLinkSDK.prototype.tokenBalance = async function (address) {
    var bal = await this.token.balanceOf(address || this.address);
    return this._fromBase(bal);
  };

  // --- x402-style flow (pattern, not QDay's facilitator) ---
  //
  // A server that wants to be paid can answer an unpaid request with HTTP 402
  // and a PayLink invoice link; the agent then pays it with this SDK:
  //
  //   // server side (pseudo):
  //   //   const { invoiceId } = await sdk.createInvoice({ amount: "0.5", expiresInSeconds: 3600, memo: "API call" });
  //   //   res.status(402).json({ invoiceUrl: invoicePayUrl("https://paylink.example", invoiceId) });
  //   // agent side:
  //   //   await sdk.payInvoice(invoiceIdFrom402Response);
  //
  PayLinkSDK.invoicePayUrl = function (appBaseUrl, invoiceId) {
    return String(appBaseUrl).replace(/\/$/, "") + "/?invoice=" + invoiceId;
  };

  return PayLinkSDK;
});
