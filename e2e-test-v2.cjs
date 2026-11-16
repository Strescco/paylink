// PayLink v2 live E2E test — Aevum testnet (chain 44005). Testnet tokens only.
// A = merchant + fee recipient (existing testnet wallet), B = agent (existing payer wallet).
// Run: node e2e-test-v2.cjs   (keys are read from the 0600 wallet files, never printed)
const fs = require("fs");
const path = require("path");
const { ethers } = require("/home/hatch/workspace/tools/ethers-check/node_modules/ethers");

const DIR = "/home/hatch/workspace/hackathons/aevum-builder-challenge-1";
const RPC = "https://rpc-test.qday.info";
const PAYLINK = "0x49841BDaA70a41D6a49dE1e87a6EF61215719167";
const REGISTRY = "0x432de42876b6e4416979924FEC83D8B678f50fb3";
const TUSD8 = "0x456569838f1d43009A91ebA4263147Afd7233483";
const EXPLORER = "https://explorer-test.qday.info/tx/";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];
const STATUS = ["Created", "Paid", "Settled", "Refunded", "Cancelled", "Expired"];

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

// Expect a static call to revert with a given custom error name.
async function expectRevert(staticCallFn, errorName, contractInterface, label) {
  try {
    await staticCallFn();
    throw new Error(`${label}: expected revert ${errorName}, but call SUCCEEDED`);
  } catch (e) {
    if (e.message && e.message.includes("expected revert")) throw e;
    // ethers v6: custom error data is in e.data (0x + 4-byte selector).
    let parsed = null;
    try { parsed = contractInterface.parseError(e.data); } catch { /* ignore */ }
    if (parsed && parsed.name === errorName) {
      log("revert", `${label}: reverted with ${errorName} as expected`);
      return;
    }
    // Fallback: match the selector directly.
    const selector = ethers.id(`${errorName}()`).slice(0, 10);
    if (e.data && e.data.slice(0, 10).toLowerCase() === selector.toLowerCase()) {
      log("revert", `${label}: reverted with ${errorName} as expected (selector match)`);
      return;
    }
    throw new Error(`${label}: expected revert ${errorName}, got ${e.reason || e.message || e}`);
  }
}

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const chainId = (await provider.getNetwork()).chainId;
  log("net", `chainId=${chainId} (expect 44005)`);
  if (chainId !== 44005n) throw new Error("wrong chain");

  const aJson = JSON.parse(fs.readFileSync(path.join(DIR, "testnet-wallet.json"), "utf8"));
  const walletA = new ethers.Wallet(aJson.privateKey, provider);
  const bJson = JSON.parse(fs.readFileSync(path.join(DIR, "testnet-wallet-payer.json"), "utf8"));
  const walletB = new ethers.Wallet(bJson.privateKey, provider);
  log("A", `merchant + fee recipient ${walletA.address}`);
  log("B", `agent ${walletB.address}`);

  const tusd8 = new ethers.Contract(TUSD8, ERC20_ABI, provider);
  const paylinkAbi = JSON.parse(
    fs.readFileSync(path.join(DIR, "out/PayLink.sol/PayLink.json"), "utf8")
  ).abi;
  const registryAbi = JSON.parse(
    fs.readFileSync(path.join(DIR, "out/AgentRegistry.sol/AgentRegistry.json"), "utf8")
  ).abi;
  const paylink = new ethers.Contract(PAYLINK, paylinkAbi, provider);
  const registry = new ethers.Contract(REGISTRY, registryAbi, provider);
  const paylinkA = paylink.connect(walletA);
  const paylinkB = paylink.connect(walletB);
  const registryB = registry.connect(walletB);
  const tusd8A = tusd8.connect(walletA);
  const tusd8B = tusd8.connect(walletB);

  // Sanity: v2 wiring on-chain.
  log("wire", `token=${await paylink.token()} registry=${await paylink.registry()} feeRecipient=${await paylink.feeRecipient()} FEE_BPS=${await paylink.FEE_BPS()}`);
  if ((await paylink.token()).toLowerCase() !== TUSD8.toLowerCase()) throw new Error("token mismatch");
  if ((await paylink.registry()).toLowerCase() !== REGISTRY.toLowerCase()) throw new Error("registry mismatch");
  if ((await paylink.feeRecipient()).toLowerCase() !== walletA.address.toLowerCase()) throw new Error("feeRecipient mismatch");
  if (await registry.authorizedPayLinks(PAYLINK) !== true) throw new Error("PayLink not authorized in registry");

  const aTusd8Before = await tusd8.balanceOf(walletA.address);
  log("bal", `A tUSD8 before: ${aTusd8Before} (${ethers.formatUnits(aTusd8Before, 6)})`);

  // --- Fund B: 2 tUSD8 from A (B already has ~0.05 tQDAY gas) ---
  let tx = await tusd8A.transfer(walletB.address, 2_000_000n);
  let rc = await tx.wait();
  log("fund", `2 tUSD8 A->B tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("fund tx failed");
  if ((await tusd8.balanceOf(walletB.address)) !== 2_000_000n) throw new Error("B tUSD8 != 2");

  // --- 1. B registers as an agent ---
  tx = await registryB.registerAgent("InvoiceBot-01", "");
  rc = await tx.wait();
  log("register", `tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("registerAgent tx failed");
  if (!(await registry.isRegistered(walletB.address))) throw new Error("B not registered");

  // --- 2. A approves B: cap 2 tUSD8, expiry 7 days ---
  tx = await paylinkA.approveAgent(walletB.address, 2_000_000n, 7n * 86400n);
  rc = await tx.wait();
  log("approve-agent", `tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("approveAgent tx failed");
  let ap = await paylink.getAgentApproval(walletA.address, walletB.address);
  log("approve-agent", `cap=${ap.cap} spent=${ap.spent} active=${ap.active}`);
  if (ap.cap !== 2_000_000n || ap.spent !== 0n || !ap.active) throw new Error("approval fields wrong");

  async function createAndPay(amount) {
    const nextId = await paylink.nextInvoiceId();
    tx = await paylinkA.createInvoice(walletB.address, amount, 86400n, "Agent job - v2 E2E");
    rc = await tx.wait();
    if (rc.status !== 1) throw new Error("createInvoice tx failed");
    const id = nextId;
    log("create", `invoice #${id} amount=${amount} tx=${tx.hash} ${EXPLORER}${tx.hash}`);
    tx = await tusd8B.approve(PAYLINK, amount);
    rc = await tx.wait();
    if (rc.status !== 1) throw new Error("approve tx failed");
    tx = await paylinkB.payInvoice(id);
    rc = await tx.wait();
    log("pay", `invoice #${id} paid tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
    if (rc.status !== 1) throw new Error("payInvoice tx failed");
    const st = Number(await paylink.getInvoiceStatus(id));
    if (st !== 1) throw new Error(`invoice #${id} expected Paid, got ${STATUS[st]}`);
    ap = await paylink.getAgentApproval(walletA.address, walletB.address);
    log("pay", `invoice #${id} Paid; agent spent=${ap.spent} / cap=${ap.cap}`);
    return id;
  }

  // --- 3. Agent pays invoice #1 (1 tUSD8) and #2 (1 tUSD8) — spent hits cap exactly ---
  const id1 = await createAndPay(1_000_000n);
  if (ap.spent !== 1_000_000n) throw new Error("spent after #1 != 1 tUSD8");
  const id2 = await createAndPay(1_000_000n);
  if (ap.spent !== 2_000_000n) throw new Error("spent after #2 != 2 tUSD8 (cap)");

  // --- 4. Invoice #3: agent pay must REVERT (cap exceeded) — static call, no gas ---
  let nextId = await paylink.nextInvoiceId();
  tx = await paylinkA.createInvoice(walletB.address, 1_000_000n, 86400n, "Agent job - over cap");
  rc = await tx.wait();
  if (rc.status !== 1) throw new Error("createInvoice #3 tx failed");
  const id3 = nextId;
  log("create", `invoice #${id3} (over-cap test) tx=${tx.hash} ${EXPLORER}${tx.hash}`);
  await expectRevert(
    () => paylinkB.payInvoice.staticCall(id3),
    "AgentCapExceeded",
    paylink.interface,
    `pay #${id3} over cap`
  );
  if (Number(await paylink.getInvoiceStatus(id3)) !== 0) throw new Error("#3 should still be Created");

  // --- 5. A revokes B; invoice #4 pay must REVERT (not approved) ---
  tx = await paylinkA.revokeAgent(walletB.address);
  rc = await tx.wait();
  log("revoke", `tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("revokeAgent tx failed");
  if ((await paylink.getAgentApproval(walletA.address, walletB.address)).active) throw new Error("approval still active after revoke");
  nextId = await paylink.nextInvoiceId();
  tx = await paylinkA.createInvoice(walletB.address, 1_000_000n, 86400n, "Agent job - revoked");
  rc = await tx.wait();
  if (rc.status !== 1) throw new Error("createInvoice #4 tx failed");
  const id4 = nextId;
  log("create", `invoice #${id4} (revoked test) tx=${tx.hash} ${EXPLORER}${tx.hash}`);
  await expectRevert(
    () => paylinkB.payInvoice.staticCall(id4),
    "AgentNotApproved",
    paylink.interface,
    `pay #${id4} after revoke`
  );
  if (Number(await paylink.getInvoiceStatus(id4)) !== 0) throw new Error("#4 should still be Created");

  // --- 6. A settles #1: fee split + reputation ---
  const aBefore1 = await tusd8.balanceOf(walletA.address);
  tx = await paylinkA.settleInvoice(id1);
  rc = await tx.wait();
  log("settle", `invoice #${id1} tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("settle #1 tx failed");
  // Decode events: FeeCollected (fee 5000) + ERC20 Transfers (995000 merchant + 5000 fee).
  const feeEvents = rc.logs.map((l) => { try { return paylink.interface.parseLog(l); } catch { return null; } }).filter((e) => e && e.name === "FeeCollected");
  if (feeEvents.length !== 1 || feeEvents[0].args.fee !== 5000n) throw new Error(`FeeCollected event wrong: ${JSON.stringify(feeEvents.map((e) => e.args.fee))}`);
  log("settle", `FeeCollected fee=${feeEvents[0].args.fee} (expect 5000 = 0.5% of 1 tUSD8)`);
  const transfers = rc.logs.map((l) => { try { return tusd8.interface.parseLog(l); } catch { return null; } }).filter((e) => e && e.name === "Transfer");
  const amounts = transfers.map((e) => e.args.value.toString()).sort();
  log("settle", `Transfer amounts in receipt: ${amounts.join(", ")} (expect 5000 + 995000)`);
  if (amounts.join(",") !== "5000,995000") throw new Error("settle transfer amounts wrong");
  const aAfter1 = await tusd8.balanceOf(walletA.address);
  log("settle", `A tUSD8 ${aBefore1} -> ${aAfter1} (delta +${aAfter1 - aBefore1}, expect +1000000 = 995000 merchant + 5000 fee)`);
  if (aAfter1 - aBefore1 !== 1_000_000n) throw new Error("A settle #1 delta wrong");
  if (Number(await paylink.getInvoiceStatus(id1)) !== 2) throw new Error("#1 should be Settled");
  let rep = await registry.reputation(walletB.address);
  log("reputation", `agent settledCount=${rep[0]} volume=${rep[1]} (expect 1 / 1000000)`);
  if (rep[0] !== 1n || rep[1] !== 1_000_000n) throw new Error("reputation after #1 wrong");

  // --- 7. A settles #2: reputation grows to 2 ---
  tx = await paylinkA.settleInvoice(id2);
  rc = await tx.wait();
  log("settle", `invoice #${id2} tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("settle #2 tx failed");
  rep = await registry.reputation(walletB.address);
  log("reputation", `agent settledCount=${rep[0]} volume=${rep[1]} (expect 2 / 2000000)`);
  if (rep[0] !== 2n || rep[1] !== 2_000_000n) throw new Error("reputation after #2 wrong");

  // --- Final balances ---
  const aFinal = await tusd8.balanceOf(walletA.address);
  const bFinal = await tusd8.balanceOf(walletB.address);
  const escrow = await tusd8.balanceOf(PAYLINK);
  log("done", `A tUSD8=${aFinal} (${ethers.formatUnits(aFinal, 6)}, expect 5.0: 5 - 2 fund + 1 + 1 settle)`);
  log("done", `B tUSD8=${bFinal} (expect 0)`);
  log("done", `PayLink escrow=${escrow} (expect 0)`);
  if (aFinal !== 5_000_000n) throw new Error("A final balance wrong");
  if (bFinal !== 0n) throw new Error("B final balance wrong");
  if (escrow !== 0n) throw new Error("escrow not empty");
  const aQday = await provider.getBalance(walletA.address);
  const bQday = await provider.getBalance(walletB.address);
  log("done", `A tQDAY=${ethers.formatEther(aQday)} B tQDAY=${ethers.formatEther(bQday)}`);
  log("done", "E2E v2 PASS: register -> approve -> pay x2 (cap) -> cap-exceeded revert -> revoke -> revoked revert -> settle x2 (fee + reputation)");
})().catch((e) => {
  console.error("E2E v2 FAILED:", e.reason || e.message || e);
  if (e.data) console.error("revert data:", e.data);
  process.exit(1);
});
