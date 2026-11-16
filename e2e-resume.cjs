// PayLink E2E — resume: invoice #1 already created + approved; pay + settle it.
// Run: node e2e-resume.cjs
const fs = require("fs");
const path = require("path");
const { ethers } = require("/home/hatch/workspace/tools/ethers-check/node_modules/ethers");

const DIR = "/home/hatch/workspace/hackathons/aevum-builder-challenge-1";
const RPC = "https://rpc-test.qday.info";
const PAYLINK = "0x5da6Fa808f3F5C489d3eD49d7dB8bcf85B5Da5A3";
const TUSD8 = "0x456569838f1d43009A91ebA4263147Afd7233483";
const EXPLORER = "https://explorer-test.qday.info/tx/";
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
];
const STATUS = ["Created", "Paid", "Settled", "Refunded", "Cancelled", "Expired"];
const log = (s, m) => console.log(`[${s}] ${m}`);

(async () => {
  const provider = new ethers.JsonRpcProvider(RPC);
  const aJson = JSON.parse(fs.readFileSync(path.join(DIR, "testnet-wallet.json"), "utf8"));
  const bJson = JSON.parse(fs.readFileSync(path.join(DIR, "testnet-wallet-payer.json"), "utf8"));
  const walletA = new ethers.Wallet(aJson.privateKey, provider);
  const walletB = new ethers.Wallet(bJson.privateKey, provider);
  log("wallets", `A=${walletA.address} B=${walletB.address}`);

  const tusd8 = new ethers.Contract(TUSD8, ERC20_ABI, provider);
  const paylinkAbi = JSON.parse(fs.readFileSync(path.join(DIR, "out/PayLink.sol/PayLink.json"), "utf8")).abi;
  const paylink = new ethers.Contract(PAYLINK, paylinkAbi, provider);
  const paylinkA = paylink.connect(walletA);
  const paylinkB = paylink.connect(walletB);
  const tusd8B = tusd8.connect(walletB);

  const allowance = await tusd8.allowance(walletB.address, PAYLINK);
  log("allowance", `B -> PayLink = ${allowance} (expect 1000000)`);
  if (allowance !== 1_000_000n) throw new Error("allowance not 1 tUSD8 — approve did not stick");

  // --- B pays invoice #1 ---
  let tx = await paylinkB.payInvoice(1n);
  let rc = await tx.wait();
  log("pay", `tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("payInvoice tx failed");

  let status = Number(await paylink.getInvoiceStatus(1n));
  log("pay", `status after pay: ${STATUS[status]} (expect Paid)`);
  if (status !== 1) throw new Error(`expected Paid, got ${STATUS[status]}`);
  const escrow = await tusd8.balanceOf(PAYLINK);
  log("pay", `PayLink escrow tUSD8=${escrow} (expect 1000000)`);
  const inv = await paylink.getInvoice(1n);
  log("pay", `paidAt=${inv.paidAt} claimDeadline=${inv.claimDeadline} paidBy=${inv.paidBy}`);

  // --- A settles ---
  const aBefore = await tusd8.balanceOf(walletA.address);
  tx = await paylinkA.settleInvoice(1n);
  rc = await tx.wait();
  log("settle", `tx=${tx.hash} status=${rc.status} ${EXPLORER}${tx.hash}`);
  if (rc.status !== 1) throw new Error("settleInvoice tx failed");

  status = Number(await paylink.getInvoiceStatus(1n));
  const aAfter = await tusd8.balanceOf(walletA.address);
  const bAfter = await tusd8.balanceOf(walletB.address);
  log("settle", `status after settle: ${STATUS[status]} (expect Settled)`);
  log("settle", `A tUSD8 ${aBefore} -> ${aAfter} (delta +${aAfter - aBefore}, expect +1000000)`);
  log("settle", `B tUSD8 after: ${bAfter} (expect 0)`);
  if (status !== 2) throw new Error(`expected Settled, got ${STATUS[status]}`);
  if (aAfter - aBefore !== 1_000_000n) throw new Error("A did not receive exactly 1 tUSD8");
  const aQ = await provider.getBalance(walletA.address);
  const bQ = await provider.getBalance(walletB.address);
  log("done", `A tQDAY=${ethers.formatEther(aQ)} B tQDAY=${ethers.formatEther(bQ)}`);
  log("done", "E2E PASS: create -> approve -> pay -> settle, all on-chain");
})().catch((e) => {
  console.error("E2E FAILED:", e.reason || e.message || e);
  if (e.data) console.error("revert data:", e.data);
  process.exit(1);
});
