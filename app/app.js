// PayLink web interface — static, no backend, no build step.
// Reads state straight from the Aevum testnet chain (44005).
// Contract: see config.js (PAYLINK_ADDRESS). Token: tUSD8, decimals read live.
"use strict";

const $ = (id) => document.getElementById(id);

const STATUS_NAMES = ["Created", "Paid", "Settled", "Refunded", "Cancelled", "Expired"];
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Minimal ERC-20 surface needed for tUSD8 (approve / allowance / balance / decimals).
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const state = {
  provider: null,      // signer provider (wallet)
  readProvider: null,  // read-only JSON-RPC (works before wallet connect)
  signer: null,
  account: null,
  chainId: null,
  paylink: null,       // signer-connected contract (null until deployed+connected)
  paylinkRead: null,   // read-only contract
  registry: null,      // signer-connected AgentRegistry (v2)
  registryRead: null,  // read-only AgentRegistry
  token: null,         // signer-connected tUSD8
  tokenRead: null,
  tokenDecimals: CONFIG.TUSD8_DECIMALS_FALLBACK,
  tokenSymbol: CONFIG.TUSD8_SYMBOL,
  deployed: Boolean(CONFIG.PAYLINK_ADDRESS),
  currentInvoiceId: null,
};

// ---------- helpers ----------

function setStatus(msg, kind) {
  const el = $("statusLine");
  el.textContent = msg || "";
  el.className = "status-line" + (kind ? " " + kind : "");
}

function shortAddr(a) {
  return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
}

function fmtAmount(raw) {
  try { return ethers.formatUnits(raw, state.tokenDecimals); }
  catch { return String(raw); }
}

function fmtTime(ts) {
  const d = new Date(Number(ts) * 1000);
  return d.toLocaleString();
}

function fmtCountdown(ts) {
  const diff = Number(ts) - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "passed";
  const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60);
  if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

function explorerTx(hash) { return CONFIG.EXPLORER_TX + hash; }

function txLink(hash) {
  return `<a href="${explorerTx(hash)}" target="_blank" rel="noopener">View on explorer ↗</a> (${shortAddr(hash)})`;
}

// Turn a raw revert / ethers error into a human-readable sentence.
function friendlyError(err) {
  const msg = (err && (err.reason || err.message || String(err))) || "Unknown error";
  if (/user rejected|User denied|ACTION_REJECTED/i.test(msg)) return "Transaction rejected in your wallet.";
  if (/insufficient funds/i.test(msg)) return "Not enough tQDAY for gas. Get test gas from the faucet (link above).";
  const known = {
    InvoiceNotFound: "Invoice not found — check the invoice number.",
    NotCreated: "This invoice is no longer in Created state, so this action is not possible.",
    NotPaid: "This invoice is not Paid, so this action is not possible.",
    ExpiredInvoice: "This invoice has expired — it can no longer be paid.",
    NotDesignatedPayer: "This invoice is addressed to a different payer.",
    MerchantCannotPay: "The merchant cannot pay their own invoice.",
    NotMerchant: "Only the merchant who created this invoice can do that.",
    NotPayer: "Only the payer who paid this invoice can do that.",
    ClaimWindowNotOver: "The 7-day claim window has not passed yet — the merchant can still settle.",
    DurationOutOfRange: "Invoice lifetime must be between 1 hour and 30 days.",
    ZeroAmount: "Amount must be greater than 0.",
    MemoTooLong: "Memo is too long (max 200 characters).",
    SafeERC20FailedOperation: "Token transfer failed — check your tUSD8 balance and approval.",
    AgentNotApproved: "This agent is not approved by the merchant (or was revoked).",
    AgentApprovalExpired: "This agent's approval has expired — ask the merchant to re-approve.",
    AgentCapExceeded: "This payment would exceed the agent's approved spending cap.",
    ZeroAgentAddress: "Agent address must not be empty.",
    ZeroCap: "Spending cap must be greater than 0.",
    AlreadyRegistered: "This address is already registered as an agent.",
    EmptyName: "Agent name must not be empty.",
    AgentNotRegistered: "This address is not registered as an agent.",
    NotAuthorizedPayLink: "This PayLink contract is not authorized in the registry.",
    NotOwner: "Only the registry owner can do that.",
  };
  for (const [key, text] of Object.entries(known)) {
    if (msg.includes(key)) return text;
  }
  if (/allowance|insufficient allowance/i.test(msg)) return "tUSD8 approval too low — approve the exact invoice amount first.";
  return msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
}

async function waitTx(tx, label) {
  setStatus(`⏳ ${label} — waiting for confirmation… (tx ${shortAddr(tx.hash)})`);
  const receipt = await tx.wait();
  return receipt;
}

// ---------- setup ----------

function initReadProvider() {
  try {
    state.readProvider = new ethers.JsonRpcProvider(CONFIG.RPC_URL, CONFIG.CHAIN_ID);
  } catch (e) {
    console.warn("Read-only RPC unavailable:", e);
  }
  if (state.deployed && state.readProvider) {
    state.paylinkRead = new ethers.Contract(CONFIG.PAYLINK_ADDRESS, PAYLINK_ABI, state.readProvider);
    state.tokenRead = new ethers.Contract(CONFIG.TUSD8_ADDRESS, ERC20_ABI, state.readProvider);
    state.registryRead = new ethers.Contract(CONFIG.REGISTRY_ADDRESS, REGISTRY_ABI, state.readProvider);
  }
}

async function refreshTokenMeta() {
  // Read decimals/symbol live from the token (design rule: never hardcode).
  const c = state.tokenRead || state.token;
  if (!c) return;
  try { state.tokenDecimals = Number(await c.decimals()); } catch { /* keep fallback */ }
  try { state.tokenSymbol = await c.symbol(); } catch { /* keep fallback */ }
}

function renderDeployedState() {
  const banner = $("notDeployedBanner");
  const contractEl = $("contractAddress");
  const linkEl = $("contractLink");
  if (!state.deployed) {
    banner.hidden = false;
    contractEl.textContent = "Not deployed yet";
    linkEl.textContent = "not deployed yet";
    $("createBtn").disabled = true;
    $("refreshBtn").disabled = true;
    $("invoiceRows").innerHTML =
      '<tr><td colspan="7" class="muted">PayLink contract not deployed yet — invoices will appear here after deploy.</td></tr>';
  } else {
    banner.hidden = true;
    contractEl.innerHTML =
      `<a href="${CONFIG.EXPLORER_ADDRESS}${CONFIG.PAYLINK_ADDRESS}" target="_blank" rel="noopener">${CONFIG.PAYLINK_ADDRESS}</a>`;
    linkEl.innerHTML =
      `<a href="${CONFIG.EXPLORER_ADDRESS}${CONFIG.PAYLINK_ADDRESS}" target="_blank" rel="noopener">PayLink ↗</a>`;
    $("createBtn").disabled = !state.account;
    $("refreshBtn").disabled = false;
  }
}

// ---------- wallet ----------

async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    setStatus("No wallet found. Install MetaMask (or any EVM wallet) and try again.", "error");
    return;
  }
  try {
    state.provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await state.provider.send("eth_requestAccounts", []);
    state.signer = await state.provider.getSigner();
    state.account = accounts[0];
    const net = await state.provider.getNetwork();
    state.chainId = Number(net.chainId);
    if (state.deployed) {
      state.paylink = new ethers.Contract(CONFIG.PAYLINK_ADDRESS, PAYLINK_ABI, state.signer);
      state.registry = new ethers.Contract(CONFIG.REGISTRY_ADDRESS, REGISTRY_ABI, state.signer);
    }
    state.token = new ethers.Contract(CONFIG.TUSD8_ADDRESS, ERC20_ABI, state.signer);

    $("connectBtn").textContent = shortAddr(state.account);
    $("walletAddress").textContent = state.account;
    $("networkBadge").textContent = state.chainId === CONFIG.CHAIN_ID
      ? "Aevum testnet ✓" : `Chain ${state.chainId} — wrong network`;
    $("networkBadge").className = "badge " + (state.chainId === CONFIG.CHAIN_ID ? "badge-ok" : "badge-warn");
    $("wrongNetworkBanner").hidden = state.chainId === CONFIG.CHAIN_ID;

    await refreshTokenMeta();
    await refreshBalances();
    await refreshInvoiceList();
    setStatus(state.chainId === CONFIG.CHAIN_ID
      ? "Connected to Aevum testnet." : "Connected — but you are on the wrong network. Switch to Aevum testnet.", state.chainId === CONFIG.CHAIN_ID ? "ok" : "error");

    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged", () => window.location.reload());
  } catch (err) {
    setStatus(friendlyError(err), "error");
  }
}

async function addNetwork() {
  if (typeof window.ethereum === "undefined") {
    setStatus("No wallet found. Install MetaMask first.", "error");
    return;
  }
  try {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: CONFIG.CHAIN_ID_HEX,
        chainName: CONFIG.CHAIN_NAME,
        rpcUrls: [CONFIG.RPC_URL],
        blockExplorerUrls: [CONFIG.EXPLORER_URL],
        nativeCurrency: CONFIG.NATIVE_CURRENCY,
      }],
    });
    setStatus("Aevum testnet added to your wallet.", "ok");
  } catch (err) {
    setStatus(friendlyError(err), "error");
  }
}

async function switchNetwork() {
  if (typeof window.ethereum === "undefined") return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CONFIG.CHAIN_ID_HEX }],
    });
  } catch (err) {
    if (err && err.code === 4902) await addNetwork();
    else setStatus(friendlyError(err), "error");
  }
}

async function refreshBalances() {
  if (!state.account) return;
  try {
    const gas = await state.provider.getBalance(state.account);
    $("gasBalance").textContent = `${ethers.formatEther(gas)} tQDAY`;
  } catch { $("gasBalance").textContent = "—"; }
  try {
    const bal = await state.token.balanceOf(state.account);
    $("tokenBalance").textContent = `${fmtAmount(bal)} ${state.tokenSymbol}`;
  } catch { $("tokenBalance").textContent = "—"; }
}

// ---------- invoices ----------

function statusPill(statusIdx) {
  const name = STATUS_NAMES[statusIdx] || "Unknown";
  return `<span class="status-pill st-${name}">${name}</span>`;
}

function actionButtons(inv, effectiveStatus) {
  const me = (state.account || "").toLowerCase();
  const isMerchant = me && inv.merchant.toLowerCase() === me;
  const isPaidBy = me && inv.paidBy && inv.paidBy.toLowerCase() === me;
  const isPayer = me && inv.payer !== ZERO_ADDRESS && inv.payer.toLowerCase() === me;
  const canPay = effectiveStatus === 0 && me && !isMerchant && (inv.payer === ZERO_ADDRESS || isPayer);
  const now = Math.floor(Date.now() / 1000);
  const refundOpen = effectiveStatus === 1 && isPaidBy && now > Number(inv.claimDeadline);
  const btns = [];
  if (effectiveStatus === 0) {
    btns.push(`<button class="btn btn-primary" data-act="pay" ${canPay ? "" : "disabled"}>Approve + Pay</button>`);
    if (isMerchant) btns.push(`<button class="btn btn-danger" data-act="cancel">Cancel invoice</button>`);
  }
  if (effectiveStatus === 1 && isMerchant) {
    // v2: settle takes a 0.5% protocol fee — show the net amount the merchant gets.
    const fee = (BigInt(inv.amount) * 50n) / 10000n;
    const net = BigInt(inv.amount) - fee;
    btns.push(`<button class="btn btn-primary" data-act="settle">Settle — withdraw ${fmtAmount(net)} ${state.tokenSymbol} (0.5% fee ${fmtAmount(fee)})</button>`);
  }
  if (effectiveStatus === 1 && isPaidBy) {
    btns.push(`<button class="btn btn-primary" data-act="refund" ${refundOpen ? "" : "disabled"}>Refund${refundOpen ? "" : " (opens after claim deadline)"}</button>`);
  }
  if (!me) btns.push('<span class="hint">Connect a wallet to act on this invoice.</span>');
  return btns.join(" ");
}

function invoiceDetailHTML(inv, effectiveStatus) {
  const now = Math.floor(Date.now() / 1000);
  const payLeft = effectiveStatus === 0 ? fmtCountdown(inv.expiresAt) : "—";
  const claimLeft = inv.claimDeadline > 0n
    ? (now > Number(inv.claimDeadline) ? "passed — refund open" : fmtCountdown(inv.claimDeadline))
    : "—";
  return `
    <div class="detail-grid">
      <div class="row"><span>Invoice #</span><span>#${inv.id}</span></div>
      <div class="row"><span>Status</span><span>${statusPill(effectiveStatus)}</span></div>
      <div class="row"><span>Amount</span><span>${fmtAmount(inv.amount)} ${state.tokenSymbol}</span></div>
      <div class="row"><span>Merchant</span><span>${inv.merchant}</span></div>
      <div class="row"><span>Payer</span><span>${inv.payer === ZERO_ADDRESS ? "Anyone" : inv.payer}</span></div>
      <div class="row"><span>Paid by</span><span>${inv.paidBy === ZERO_ADDRESS ? "—" : inv.paidBy}</span></div>
      <div class="row"><span>Memo</span><span class="memo">${inv.memo ? escapeHtml(inv.memo) : "—"}</span></div>
      <div class="row"><span>Created</span><span>${fmtTime(inv.createdAt)}</span></div>
      <div class="row"><span>Pay before</span><span>${fmtTime(inv.expiresAt)} (${payLeft})</span></div>
      <div class="row"><span>Claim deadline</span><span>${inv.claimDeadline > 0n ? fmtTime(inv.claimDeadline) + " (" + claimLeft + ")" : "—"}</span></div>
      <div class="row"><span>Token</span><span>${inv.token}</span></div>
    </div>
    <div class="actions" data-invoice="${inv.id}">${actionButtons(inv, effectiveStatus)}</div>
    <p class="hint">Share link: <span id="shareLink"></span></p>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadInvoice(id) {
  const read = state.paylinkRead || state.paylink;
  if (!read) { setStatus("PayLink contract not deployed yet.", "error"); return; }
  try {
    const inv = await read.getInvoice(id);
    const st = Number(await read.getInvoiceStatus(id));
    state.currentInvoiceId = Number(id);
    $("invoiceDetail").innerHTML = invoiceDetailHTML(inv, st);
    const url = new URL(window.location.href);
    url.searchParams.set("invoice", String(id));
    const link = $("shareLink");
    if (link) link.innerHTML = `<a href="${url.toString()}">${url.toString()}</a>`;
  } catch (err) {
    $("invoiceDetail").innerHTML = "";
    setStatus(friendlyError(err), "error");
  }
}

async function refreshInvoiceList() {
  const read = state.paylinkRead || state.paylink;
  const tbody = $("invoiceRows");
  if (!read) return;
  try {
    const next = Number(await read.nextInvoiceId());
    $("invoiceCount").textContent = next > 1 ? `(${next - 1} total)` : "(none yet)";
    if (next <= 1) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No invoices yet — create the first one above.</td></tr>';
      return;
    }
    const rows = [];
    for (let id = next - 1; id >= 1; id--) {
      try {
        const [inv, st] = await Promise.all([read.getInvoice(id), read.getInvoiceStatus(id)]);
        rows.push(`<tr>
          <td>#${inv.id}</td>
          <td>${fmtAmount(inv.amount)} ${state.tokenSymbol}</td>
          <td class="addr">${shortAddr(inv.merchant)}</td>
          <td class="addr">${inv.payer === ZERO_ADDRESS ? "Anyone" : shortAddr(inv.payer)}</td>
          <td>${statusPill(Number(st))}</td>
          <td>${fmtTime(inv.expiresAt)}</td>
          <td><button class="btn btn-small btn-ghost" data-open="${inv.id}">Open</button></td>
        </tr>`);
      } catch { /* skip unreadable rows */ }
    }
    tbody.innerHTML = rows.join("") || '<tr><td colspan="7" class="muted">No invoices found.</td></tr>';
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Could not load invoices: ' + escapeHtml(friendlyError(err)) + "</td></tr>";
  }
}

// ---------- agents (v2) ----------

async function doRegisterAgent(e) {
  e.preventDefault();
  try {
    await requireReady();
    if (!state.registry) throw new Error("AgentRegistry not available.");
    const name = $("agentName").value.trim();
    const metadata = $("agentMetadata").value.trim();
    if (!name) throw new Error("Agent name must not be empty.");
    setStatus("⏳ Registering agent… confirm in your wallet.");
    const tx = await state.registry.registerAgent(name, metadata);
    await waitTx(tx, "Registering agent");
    $("registerResult").innerHTML = `✅ Registered as agent <strong>${escapeHtml(name)}</strong>. ${txLink(tx.hash)}`;
    setStatus(`Registered as agent "${name}".`, "ok");
  } catch (err) {
    setStatus("❌ " + friendlyError(err), "error");
  }
}

async function doApproveAgent(e) {
  e.preventDefault();
  try {
    await requireReady();
    const agentAddr = $("approveAgentAddr").value.trim();
    const capStr = $("approveAgentCap").value.trim();
    const duration = Number($("approveAgentDuration").value);
    if (!ethers.isAddress(agentAddr)) throw new Error("Agent address is not a valid address.");
    if (!capStr || Number(capStr) <= 0) throw new Error("Spending cap must be greater than 0.");
    const cap = ethers.parseUnits(capStr, state.tokenDecimals);
    setStatus(`⏳ Approving agent ${shortAddr(agentAddr)} with cap ${capStr} ${state.tokenSymbol}… confirm in your wallet.`);
    const tx = await state.paylink.approveAgent(agentAddr, cap, duration);
    await waitTx(tx, "Approving agent");
    $("approveResult").innerHTML =
      `✅ Agent <strong>${agentAddr}</strong> approved — cap ${capStr} ${state.tokenSymbol}, ` +
      `valid ${duration >= 86400 ? Math.round(duration / 86400) + " day(s)" : Math.round(duration / 3600) + " hour(s)"}. ${txLink(tx.hash)}`;
    setStatus("Agent approved.", "ok");
  } catch (err) {
    setStatus("❌ " + friendlyError(err), "error");
  }
}

async function doRevokeAgent(agentAddr) {
  try {
    await requireReady();
    setStatus(`⏳ Revoking agent ${shortAddr(agentAddr)}… confirm in your wallet.`);
    const tx = await state.paylink.revokeAgent(agentAddr);
    await waitTx(tx, "Revoking agent");
    setStatus(`✅ Agent ${shortAddr(agentAddr)} revoked. ${txLink(tx.hash)}`, "ok");
    await doAgentLookup(agentAddr);
  } catch (err) {
    setStatus("❌ " + friendlyError(err), "error");
  }
}

async function doAgentLookup(agentAddr) {
  const addr = (agentAddr || $("agentLookupAddr").value.trim());
  const box = $("agentLookupResult");
  const revokeBox = $("revokeBox");
  revokeBox.innerHTML = "";
  try {
    if (!ethers.isAddress(addr)) throw new Error("Agent address is not a valid address.");
    const read = state.registryRead || state.registry;
    const payRead = state.paylinkRead || state.paylink;
    if (!read || !payRead) throw new Error("Contracts not deployed yet.");
    const registered = await read.isRegistered(addr);
    let html = `<div class="detail-grid">
      <div class="row"><span>Agent</span><span>${addr}</span></div>
      <div class="row"><span>Registered</span><span>${registered ? "Yes ✓" : "No"}</span></div>`;
    if (registered) {
      const a = await read.getAgent(addr);
      html += `
      <div class="row"><span>Name</span><span>${escapeHtml(a.name)}</span></div>
      <div class="row"><span>Metadata</span><span>${a.metadataURI ? escapeHtml(a.metadataURI) : "—"}</span></div>
      <div class="row"><span>Settled invoices</span><span>${a.settledCount}</span></div>
      <div class="row"><span>Settled volume</span><span>${fmtAmount(a.settledVolume)} ${state.tokenSymbol}</span></div>`;
    }
    if (state.account) {
      const ap = await payRead.getAgentApproval(state.account, addr);
      const expired = ap.expiry > 0n && Math.floor(Date.now() / 1000) > Number(ap.expiry);
      html += `
      <div class="row"><span>Your approval for this agent</span><span>${ap.cap > 0n ? (ap.active ? (expired ? "Expired" : "Active ✓") : "Revoked") : "None"}</span></div>`;
      if (ap.cap > 0n) {
        html += `
      <div class="row"><span>Cap / spent</span><span>${fmtAmount(ap.cap)} / ${fmtAmount(ap.spent)} ${state.tokenSymbol}</span></div>
      <div class="row"><span>Approval expiry</span><span>${fmtTime(ap.expiry)}</span></div>`;
        if (ap.active) {
          revokeBox.innerHTML = `<button class="btn btn-danger" id="revokeAgentBtn">Revoke this agent</button>`;
          $("revokeAgentBtn").addEventListener("click", () => doRevokeAgent(addr));
        }
      }
    }
    html += `</div>`;
    box.innerHTML = html;
  } catch (err) {
    box.innerHTML = "";
    setStatus("❌ " + friendlyError(err), "error");
  }
}

// ---------- actions ----------

async function requireReady() {
  if (!state.deployed) throw new Error("PayLink contract not deployed yet.");
  if (!state.account) throw new Error("Connect your wallet first.");
  if (state.chainId !== CONFIG.CHAIN_ID) throw new Error("Switch to Aevum testnet (chain 44005) first.");
  return true;
}

async function doCreate(e) {
  e.preventDefault();
  try {
    await requireReady();
    const amountStr = $("createAmount").value.trim();
    const payerRaw = $("createPayer").value.trim();
    const duration = Number($("createDuration").value);
    const memo = $("createMemo").value.trim();
    if (!amountStr || Number(amountStr) <= 0) throw new Error("Amount must be greater than 0.");
    const payer = payerRaw === "" ? ZERO_ADDRESS : payerRaw;
    if (!ethers.isAddress(payer)) throw new Error("Payer address is not a valid address.");
    if (new TextEncoder().encode(memo).length > CONFIG.MAX_MEMO_BYTES) throw new Error("Memo is too long (max 200 characters).");
    const amount = ethers.parseUnits(amountStr, state.tokenDecimals);
    setStatus("⏳ Sending createInvoice… confirm in your wallet.");
    const tx = await state.paylink.createInvoice(payer, amount, duration, memo);
    await waitTx(tx, "Creating invoice");
    // New id = nextInvoiceId - 1 after creation.
    const next = Number(await state.paylinkRead.nextInvoiceId());
    const newId = next - 1;
    $("createResult").innerHTML =
      `✅ Invoice <strong>#${newId}</strong> created. ${txLink(tx.hash)}<br>` +
      `Share it: <a href="${new URL(window.location.href).origin + window.location.pathname}?invoice=${newId}">${window.location.pathname}?invoice=${newId}</a>`;
    setStatus(`Invoice #${newId} created.`, "ok");
    $("createForm").reset();
    await refreshInvoiceList();
    await loadInvoice(newId);
  } catch (err) {
    setStatus("❌ " + friendlyError(err), "error");
  }
}

async function doPay(id) {
  try {
    await requireReady();
    const inv = await state.paylinkRead.getInvoice(id);
    const allowance = await state.token.allowance(state.account, CONFIG.PAYLINK_ADDRESS);
    if (allowance < inv.amount) {
      setStatus(`⏳ Approving exactly ${fmtAmount(inv.amount)} ${state.tokenSymbol}… confirm in your wallet.`);
      const atx = await state.token.approve(CONFIG.PAYLINK_ADDRESS, inv.amount);
      await waitTx(atx, "Approving tUSD8");
      setStatus("Approval confirmed. Now paying…", "ok");
    }
    setStatus("⏳ Paying invoice… confirm in your wallet.");
    const tx = await state.paylink.payInvoice(id);
    await waitTx(tx, "Paying invoice");
    setStatus(`✅ Invoice #${id} paid. ${txLink(tx.hash)}`, "ok");
    $("invoiceDetail").innerHTML += `<p class="result">✅ Paid. ${txLink(tx.hash)}</p>`;
    await refreshBalances();
    await refreshInvoiceList();
    await loadInvoice(id);
  } catch (err) {
    setStatus("❌ " + friendlyError(err), "error");
  }
}

async function doSimple(id, method, label) {
  try {
    await requireReady();
    setStatus(`⏳ ${label}… confirm in your wallet.`);
    const tx = await state.paylink[method](id);
    await waitTx(tx, label);
    setStatus(`✅ ${label} done. ${txLink(tx.hash)}`, "ok");
    await refreshBalances();
    await refreshInvoiceList();
    await loadInvoice(id);
  } catch (err) {
    setStatus("❌ " + friendlyError(err), "error");
  }
}

// ---------- boot ----------

function bindEvents() {
  $("connectBtn").addEventListener("click", connectWallet);
  $("addNetworkBtn").addEventListener("click", addNetwork);
  $("switchNetworkBtn").addEventListener("click", switchNetwork);
  $("createForm").addEventListener("submit", doCreate);
  $("registerAgentForm").addEventListener("submit", doRegisterAgent);
  $("approveAgentForm").addEventListener("submit", doApproveAgent);
  $("agentLookupForm").addEventListener("submit", (e) => { e.preventDefault(); doAgentLookup(); });
  $("refreshBtn").addEventListener("click", async () => { await refreshTokenMeta(); await refreshInvoiceList(); });
  $("lookupForm").addEventListener("submit", (e) => { e.preventDefault(); loadInvoice(Number($("lookupId").value)); });
  $("copyLinkBtn").addEventListener("click", async () => {
    const id = Number($("lookupId").value);
    if (!id) { setStatus("Enter an invoice number first.", "error"); return; }
    const url = new URL(window.location.href);
    url.searchParams.set("invoice", String(id));
    try { await navigator.clipboard.writeText(url.toString()); setStatus("Share link copied.", "ok"); }
    catch { setStatus(url.toString(), "ok"); }
  });
  $("invoiceRows").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open]");
    if (btn) { $("lookupId").value = btn.dataset.open; loadInvoice(Number(btn.dataset.open)); }
  });
  $("invoiceDetail").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    const id = Number(btn.closest(".actions").dataset.invoice);
    const act = btn.dataset.act;
    if (act === "pay") await doPay(id);
    if (act === "settle") await doSimple(id, "settleInvoice", "Settling invoice");
    if (act === "refund") await doSimple(id, "refundInvoice", "Refunding invoice");
    if (act === "cancel") await doSimple(id, "cancelInvoice", "Cancelling invoice");
  });
}

async function boot() {
  if (typeof ethers === "undefined") {
    setStatus("Could not load ethers.js from the CDN — check your connection and reload.", "error");
    return;
  }
  renderDeployedState();
  initReadProvider();
  await refreshTokenMeta();
  bindEvents();
  if (state.deployed) await refreshInvoiceList();
  // Deep link: ?invoice=N opens that invoice on load.
  const params = new URLSearchParams(window.location.search);
  const deep = Number(params.get("invoice"));
  if (deep > 0 && state.deployed) {
    $("lookupId").value = deep;
    await loadInvoice(deep);
  }
  // If a wallet is already authorized, reconnect silently.
  if (typeof window.ethereum !== "undefined") {
    try {
      const accs = await window.ethereum.request({ method: "eth_accounts" });
      if (accs && accs.length > 0) await connectWallet();
    } catch { /* stay disconnected */ }
  }
  // Refresh the open invoice view every 30s so countdowns stay fresh.
  setInterval(() => {
    if (state.currentInvoiceId && state.deployed) loadInvoice(state.currentInvoiceId);
  }, 30000);
}

document.addEventListener("DOMContentLoaded", boot);
