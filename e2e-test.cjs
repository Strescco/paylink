// PayLink live E2E test — Aevum testnet (chain 44005). Testnet tokens only.
// A = merchant (existing testnet wallet), B = payer (created fresh here).
// Run: node e2e-test.cjs   (keys are read from the 0600 wallet files, never printed)
const fs = require("fs");
const path = require("path");
const { ethers } = require("/home/hatch/workspace/tools/ethers-check/node_modules/ethers");

const DIR = "/home/hatch/workspace/hackathons/aevum-builder-challenge-1";
const RPC = "https://rpc-test.qday.info";
const PAYLINK = "0x5da6Fa808f3F5C489d3eD49d7dB8bcf85B5Da5A3";
const TUSD8 = "0x456569838f1d43009A91ebA4263147Afd7233483";
const EXPLORER = "https://explorer-test.qday.info/tx/";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];
const STATUS = ["Created", "Paid", "Settled", "Refunded", "Cancelled", "Expired"];

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const chainId = (await provider.getNetwork()).chainId;
  log("net", `chainId=${chainId} (expect 44005)`);
  if (chainId !== 44005n) throw new Error("wrong chain");

  // --- Wallet A (merchant) ---
  const aJson = JSON.parse(fs.readFileSync(path.join(DIR, "testnet-wallet.json"), "utf8"));
  const walletA = new ethers.Wallet(aJson.privateKey, provider);
  log("A", `merchant ${walletA.address}`);

  // --- Wallet B (payer) — create fresh, save 0600 ---
  const bPath = path.join(DIR, "testnet-wallet-payer.json");
  let walletB;
  if (fs.existsSync(bPath)) {
    const bJson = JSON.parse(fs.readFileSync(bPath, "utf8"));
    walletB = new ethers.Wallet(bJson.privateKey, provider);
    log("B", `reusing existing payer wallet ${walletB.address}`);
  } else {
    walletB = ethers.Wallet.createRandom(provider);
    const out = {
      address: walletB.address,
      privateKey: walletB.privateKey,
      mnemonic: walletB.mnemonic.phrase,
      chain: "Aevum testnet 44005 (payer for PayLink E2E demo)",
    };
    fs.writeFileSync(bPath, JSON.stringify(out, null, 2), { mode: 0o600 });
    fs.chmodSync(bPath, 0o600);
    log("B", `created payer wallet ${walletB.address} (saved 0600)`);
  }

  const tusd8 = new ethers.Contract(TUSD8, ERC20_ABI, provider);
  const paylinkAbi = JSON.parse(
    fs.readFileSync(path.join(DIR, "out/PayLink.sol/PayLink.json"), "utf8")
  ).abi;
  const paylink = new ethers.Contract(PAYLINK, paylinkAbi, provider);
  const paylinkA = paylink.connect(walletA);
  const paylinkB = paylink.connect(walletB);
  const tusd8A = tusd8.connect(walletA);
  const tusd8B = tusd8.connect(walletB);

  const aTusd8Before = await tusd8.balanceOf(walletA.address);
  const aQdayBefore = await provider.getBalance(walletA.address);
  log("bal", `A before: tUSD8=${aTusd8Before} (${ethers.formatUnits(aTusd8Before, 6)}), tQDAY=${ethers.formatEther(aQdayBefore)}`);

  // --- Fund B: 1 tUSD8 + 0.05 tQDAY from A ---
  let tx = await tusd8A.transfer(walletB.address, 1_000_000n);
  let rc = await tx.wait();
  log("fund-tusd8", `tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("tUSD8 fund tx failed");

  tx = await walletA.sendTransaction({ to: walletB.address, value: ethers.parseEther("0.05") });
  rc = await tx.wait();
  log("fund-tqday", `tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("tQDAY fund tx failed");

  const bTusd8 = await tusd8.balanceOf(walletB.address);
  const bQday = await provider.getBalance(walletB.address);
  log("bal", `B after fund: tUSD8=${bTusd8} (${ethers.formatUnits(bTusd8, 6)}), tQDAY=${ethers.formatEther(bQday)}`);
  if (bTusd8 !== 1_000_000n) throw new Error("B tUSD8 != 1");
  if (bQday < ethers.parseEther("0.04")) throw new Error("B tQDAY too low");

  // --- A creates invoice #1: payer=B, 1 tUSD8, 24h, memo ---
  const nextId = await paylink.nextInvoiceId();
  log("create", `nextInvoiceId=${nextId} (expect 1)`);
  tx = await paylinkA.createInvoice(walletB.address, 1_000_000n, 86400n, "Demo PayLink");
  rc = await tx.wait();
  log("create", `tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("createInvoice tx failed");
  const created = rc.logs.map((l) => { try { return paylink.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "InvoiceCreated");
  const invoiceId = created ? created.args.id : nextId;
  log("create", `invoiceId=${invoiceId}`);

  let inv = await paylink.getInvoice(invoiceId);
  log("create", `invoice: merchant=${inv.merchant} payer=${inv.payer} amount=${inv.amount} status=${STATUS[Number(await paylink.getInvoiceStatus(invoiceId))]}`);

  // --- B approves exactly 1 tUSD8, then pays ---
  tx = await tusd8B.approve(PAYLINK, 1_000_000n);
  rc = await tx.wait();
  log("approve", `tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("approve tx failed");
  const allowance = await tusd8.allowance(walletB.address, PAYLINK);
  log("approve", `allowance=${allowance} (expect 1000000)`);

  tx = await paylinkB.payInvoice(invoiceId);
  rc = await tx.wait();
  log("pay", `tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("payInvoice tx failed");

  let status = Number(await paylink.getInvoiceStatus(invoiceId));
  log("pay", `status after pay: ${STATUS[status]} (expect Paid)`);
  if (status !== 1) throw new Error(`expected Paid, got ${STATUS[status]}`);

  const escrow = await tusd8.balanceOf(PAYLINK);
  log("pay", `PayLink escrow tUSD8=${escrow} (expect 1000000)`);

  // --- A settles ---
  const aTusd8BeforeSettle = await tusd8.balanceOf(walletA.address);
  tx = await paylinkA.settleInvoice(invoiceId);
  rc = await tx.wait();
  log("settle", `tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("settleInvoice tx failed");

  status = Number(await paylink.getInvoiceStatus(invoiceId));
  const aTusd8After = await tusd8.balanceOf(walletA.address);
  const bTusd8After = await tusd8.balanceOf(walletB.address);
  log("settle", `status after settle: ${STATUS[status]} (expect Settled)`);
  log("settle", `A tUSD8 ${aTusd8BeforeSettle} -> ${aTusd8After} (delta +${aTusd8After - aTusd8BeforeSettle}, expect +1000000)`);
  log("settle", `B tUSD8 after: ${bTusd8After} (expect 0)`);
  if (status !== 2) throw new Error(`expected Settled, got ${STATUS[status]}`);
  if (aTusd8After - aTusd8BeforeSettle !== 1_000_000n) throw new Error("A did not receive exactly 1 tUSD8");

  const aQdayAfter = await provider.getBalance(walletA.address);
  const bQdayAfter = await provider.getBalance(walletB.address);
  log("done", `A tQDAY ${ethers.formatEther(aQdayBefore)} -> ${ethers.formatEther(aQdayAfter)}`);
  log("done", `B tQDAY ${ethers.formatEther(bQday)} -> ${ethers.formatEther(bQdayAfter)}`);
  log("done", "E2E PASS: create -> approve -> pay -> settle, all on-chain");
})().catch((e) => {
  console.error("E2E FAILED:", e.reason || e.message || e);
  if (e.data) console.error("revert data:", e.data);
  process.exit(1);
});
