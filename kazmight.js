import dotenv from "dotenv";
dotenv.config();
import { readFile, writeFile } from "fs/promises";
import fs from "fs";
import { ethers } from "ethers";
import CryptoBotUI from "./CryptoBotUI.js";


const L1_NETWORK = {
  name: "Sepolia ETH",
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  explorer: "https://sepolia.etherscan.io/tx/",
  contract: "0x956962C34687A954e611A83619ABaA37Ce6bC78A",
  abi: [
    {
      type: "function",
      name: "depositTransaction",
      stateMutability: "payable",
      inputs: [
        { internalType: "address", name: "_to", type: "address" },
        { internalType: "uint256", name: "_value", type: "uint256" },
        { internalType: "uint64", name: "_gasLimit", type: "uint64" },
        { internalType: "bool", name: "_isCreation", type: "bool" },
        { internalType: "bytes", name: "_data", type: "bytes" }
      ],
      outputs: []
    }
  ]
};

const L2_NETWORK = {
  name: "Giwa Sepolia",
  rpcUrl: "https://sepolia-rpc.giwa.io",
  explorer: "https://sepolia-explorer.giwa.io/tx/",
  contract: "0x4200000000000000000000000000000000000016",
  abi: [
    {
      type: "function",
      name: "initiateWithdrawal",
      stateMutability: "payable",
      inputs: [
        { internalType: "address", name: "_target", type: "address" },
        { internalType: "uint256", name: "_gasLimit", type: "uint256" },
        { internalType: "bytes", name: "_data", type: "bytes" }
      ],
      outputs: []
    }
  ]
};


const FACTORY_ADDRESS = "0x6BeC646B360e0F054FD833EDD56BC9289F0a60CA"; 
const DEPLOYMENT_FEE_WEI = 1_000_000_000_000_000n; 
const DEFAULT_DECIMALS = 18;

const FACTORY_ABI = [
  {
    type: "function",
    name: "createToken",
    stateMutability: "payable",
    inputs: [
      { name: "n", type: "string" },
      { name: "s", type: "string" },
      { name: "d", type: "uint8" },
      { name: "humanSupply", type: "uint256" }
    ],
    outputs: [{ name: "tokenAddr", type: "address" }]
  },
  {
    type: "event",
    name: "TokenCreated",
    inputs: [
      { indexed: true, name: "creator", type: "address" },
      { indexed: false, name: "token", type: "address" },
      { indexed: false, name: "name", type: "string" },
      { indexed: false, name: "symbol", type: "string" },
      { indexed: false, name: "decimals", type: "uint8" },
      { indexed: false, name: "supply", type: "uint256" }
    ],
    anonymous: false
  }
];

const ERC20_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] }
];


const ui = new CryptoBotUI({
  title: "Giwa Bridge + ERC20 Dashboard",
  menuItems: [
    "1) Bridge L1 -> L2",
    "2) Bridge L2 -> L1",
    "3) Deploy ERC-20 (Giwa)",
    "4) Send ERC-20 to Random (Giwa)",
    "5) Exit"
  ],
  tickerText1: "GIWA TESTNET",
  tickerText2: "Invictuslabs - Airdrops",
  nativeSymbol: "ETH"
});


const TOKENS_FILE = "tokens.json";
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const asEther = (bigint) => Number(ethers.formatEther(bigint));
const parseUnits = (val, decimals) => ethers.parseUnits(String(val), decimals);


class Cancelled extends Error { constructor() { super("CANCELLED"); this.name = "CANCELLED"; } }
const isCancelled = (e) => e && (e.name === "CANCELLED" || e.message === "CANCELLED");
async function promptNum(label, initial) {
  const n = await ui.promptNumber(label, initial);
  if (n === null || !Number.isFinite(n)) throw new Cancelled();
  return n;
}
async function promptInt(label, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = await ui.promptNumber(label, "");
  if (n === null || !Number.isFinite(n)) throw new Cancelled();
  const i = Math.floor(n);
  if (i < min || i > max) throw new Cancelled();
  return i;
}
async function promptText(label, initial) {
  const s = await ui.promptText(label, initial);
  if (s === null) throw new Cancelled();
  return String(s).trim();
}
async function pickIndexOrCancel(arr, label) {
  if (!Array.isArray(arr) || arr.length === 0) throw new Error(`${label}: empty list`);
  if (arr.length === 1) return 0;
  const n = await ui.promptNumber(`Pick ${label} index [0..${arr.length - 1}] -> `);
  if (n === null || !Number.isFinite(n)) throw new Cancelled();
  const i = Math.floor(n);
  if (i < 0 || i >= arr.length) throw new Cancelled();
  return i;
}
async function ensureTokensStore() {
  if (!fs.existsSync(TOKENS_FILE)) {
    await writeFile(TOKENS_FILE, JSON.stringify({ tokens: [] }, null, 2));
  }
}
async function loadTokens() {
  await ensureTokensStore();
  const raw = await readFile(TOKENS_FILE, "utf8");
  return JSON.parse(raw);
}
async function saveTokens(data) {
  await writeFile(TOKENS_FILE, JSON.stringify(data, null, 2));
}


let providerL1 = null;
let providerL2 = null;

async function getProvider(rpcUrl) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  await provider.getBlockNumber();
  return provider;
}
async function getBalance(address, provider) {
  return await provider.getBalance(address);
}
async function getGasPriceGwei(provider) {
  const fee = await provider.getFeeData();
  const maxFee = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
  return Number(ethers.formatUnits(maxFee, "gwei"));
}
async function sendWithRetries(txRequestFn, { retries = 5, backoffMs = 1000 }) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const tx = await txRequestFn();
      const receipt = await tx.wait();
      return { tx, receipt };
    } catch (e) {
      lastErr = e;
      await sleep(backoffMs * Math.pow(2, i));
    }
  }
  throw lastErr;
}


async function performDeposit({ wallet, toAddress, amountEth }) {
  const contract = new ethers.Contract(L1_NETWORK.contract, L1_NETWORK.abi, wallet);
  const provider = wallet.provider;

  const value = ethers.parseEther(String(amountEth));
  const gasEst = await contract.depositTransaction.estimateGas(toAddress, value, 21000n, false, "0x", { value });
  const fee = await provider.getFeeData();
  const gasLimit = (gasEst * 12n) / 10n;

  const txReq = () =>
    contract.depositTransaction(toAddress, value, 21000n, false, "0x", {
      value,
      gasLimit,
      maxFeePerGas: fee.maxFeePerGas ?? undefined,
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? undefined
    });

  return await sendWithRetries(txReq, {});
}

async function performWithdraw({ wallet, toAddress, amountEth }) {
  const contract = new ethers.Contract(L2_NETWORK.contract, L2_NETWORK.abi, wallet);
  const provider = wallet.provider;

  const value = ethers.parseEther(String(amountEth));
  const gasEst = await contract.initiateWithdrawal.estimateGas(toAddress, 21000n, "0x", { value });
  const fee = await provider.getFeeData();
  const gasLimit = (gasEst * 12n) / 10n;

  const txReq = () =>
    contract.initiateWithdrawal(toAddress, 21000n, "0x", {
      value,
      gasLimit,
      maxFeePerGas: fee.maxFeePerGas ?? undefined,
      maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? undefined
    });

  return await sendWithRetries(txReq, {});
}


async function deployErc20({ wallet, name, symbol, decimals, humanSupply }) {
  if (!FACTORY_ADDRESS) throw new Error("FACTORY_ADDRESS is empty (set in index.js).");
  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, wallet);

  const supplyHumanBig = BigInt(humanSupply);
  const tx = await factory.createToken(name, symbol, decimals, supplyHumanBig, {
    value: DEPLOYMENT_FEE_WEI
  });
  const stopTimer = ui.startTimer("Waiting deployment");
  const rcpt = await tx.wait();
  stopTimer();

  
  let tokenAddr = null;
  const iface = new ethers.Interface(FACTORY_ABI);
  for (const log of rcpt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === "TokenCreated") {
        tokenAddr = parsed.args.token;
        break;
      }
    } catch {}
  }
  return { tokenAddr, txHash: tx.hash, blockNumber: rcpt.blockNumber };
}


function randomAddress() {
  return ethers.Wallet.createRandom().address;
}

async function sendErc20Random({ wallet, tokenAddress, amountHuman, decimals, times, minDelay, maxDelay }) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

  const amountUnits = parseUnits(amountHuman, decimals);
  const name = await token.name();
  const sym = await token.symbol();

  ui.log("info", `Token: ${name} (${sym}) @ ${tokenAddress}`);
  ui.log("info", `Amount: ${amountHuman} (${amountUnits} units), Times=${times}, Delay=[${minDelay},${maxDelay}]s`);

  for (let i = 0; i < times; i++) {
    const to = randomAddress();
    try {
      const gasEst = await token.transfer.estimateGas(to, amountUnits);
      const fee = await wallet.provider.getFeeData();
      const gasLimit = (gasEst * 12n) / 10n;

      const tx = await token.transfer(to, amountUnits, {
        gasLimit,
        maxFeePerGas: fee.maxFeePerGas ?? undefined,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? undefined
      });

      ui.pendingTx += 1;
      ui.updateStats({ pendingTx: ui.pendingTx });
      const stopTimer = ui.startTimer(`Sending ${sym} [${i + 1}/${times}]`);
      const rcpt = await tx.wait();
      stopTimer();
      ui.pendingTx = Math.max(0, ui.pendingTx - 1);
      ui.transactionCount += 1;
      ui.updateStats({
        pendingTx: ui.pendingTx,
        transactionCount: ui.transactionCount,
        successRate: ((ui.transactionCount - ui.failedTx) / Math.max(1, ui.transactionCount)) * 100
      });

      ui.log("success", `[#${i + 1}/${times}] Sent to ${to} | Block ${rcpt.blockNumber} | Tx ${tx.hash}`);
      ui.log("info", `${L2_NETWORK.explorer}${tx.hash}`);
    } catch (e) {
      ui.failedTx += 1;
      ui.transactionCount += 1;
      ui.pendingTx = Math.max(0, ui.pendingTx - 1);
      ui.updateStats({
        failedTx: ui.failedTx,
        pendingTx: ui.pendingTx,
        transactionCount: ui.transactionCount,
        successRate: ((ui.transactionCount - ui.failedTx) / Math.max(1, ui.transactionCount)) * 100
      });
      ui.log("failed", `[#${i + 1}/${times}] ${e?.message || e}`);
    }

    if (i < times - 1) {
      const delay =
        minDelay === maxDelay
          ? minDelay
          : Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      await ui.countdown(delay * 1000, "Delay");
    }
  }
}


 async function refreshWalletPanelDual(activeWallet, provL1 = providerL1, provL2 = providerL2) {
   const addr = await activeWallet.getAddress();
   const [balL1, balL2, gasL1, gasL2, nonceL1, nonceL2] = await Promise.all([
     getBalance(addr, provL1),
     getBalance(addr, provL2),
     getGasPriceGwei(provL1),
     getGasPriceGwei(provL2),
     provL1.getTransactionCount(addr, "latest"),
     provL2.getTransactionCount(addr, "latest")
   ]);
   ui.updateWallet({
     address: addr,
     l1Network: L1_NETWORK.name,
     l2Network: L2_NETWORK.name,
     l1Symbol: "ETH",
     l2Symbol: "ETH",
     nativeBalanceL1: `${asEther(balL1).toFixed(6)} ETH`,
     nativeBalanceL2: `${asEther(balL2).toFixed(6)} ETH`,
     nonceL1: `${nonceL1}`,
     nonceL2: `${nonceL2}`
   });
   ui.updateStats({ currentGasPrice: gasL2 }); 
 }


async function refreshTokensPanel(activeWallet) {
  const addr = await activeWallet.getAddress();
  const store = await loadTokens();
  const tokens = store.tokens.slice(0, 10);

  const enriched = [];
  for (let i = 0; i < Math.min(10, tokens.length); i++) {
    const t = tokens[i];
    try {
      const c = new ethers.Contract(t.address, ERC20_ABI, activeWallet);
      const [sym, balRaw, dec, name] = await Promise.all([
        c.symbol(),
        c.balanceOf(addr),
        c.decimals(),
        c.name().catch(() => t.name || "")
      ]);
      const human = Number(ethers.formatUnits(balRaw, dec));
      enriched.push({ enabled: true, name: name || t.name || "-", symbol: sym || t.symbol || "-", balance: human.toLocaleString() });
    } catch {
      enriched.push({ enabled: true, name: t.name || "-", symbol: t.symbol || "-", balance: "-" });
    }
  }
  while (enriched.length < 10) enriched.push({ enabled: false, name: "-", symbol: "-", balance: "-" });
  ui.setTokens(enriched);
}


async function runBridge({ direction, bridgeCount, amountEth, minDelay, maxDelay, wallets }) {
  ui.setActive(true);

  for (const w of wallets) {
    const addr = await w.getAddress();
    ui.log("bridge", `Address ${addr}`);

    await refreshWalletPanelDual(w);

    try {
      const bal = await getBalance(addr, direction === 1 ? providerL1 : providerL2);
      ui.log("info", `Balance: ${asEther(bal)} ETH | Amount: ${amountEth} ETH`);

      if (bal < ethers.parseEther(String(amountEth))) {
        ui.log("warning", "Insufficient balance, skipped.");
        continue;
      }

      for (let i = 0; i < bridgeCount; i++) {
        ui.log("bridge", `Run ${i + 1} / ${bridgeCount}`);

        try {
          ui.pendingTx += 1;
          ui.updateStats({ pendingTx: ui.pendingTx });

          let tx, receipt;
          if (direction === 1) {
            const res = await performDeposit({ wallet: w, toAddress: addr, amountEth });
            tx = res.tx; receipt = res.receipt;
            ui.log("success", `L1 -> L2 | Block ${receipt.blockNumber} | Tx ${tx.hash}`);
            ui.log("info", `${L1_NETWORK.explorer}${tx.hash}`);
          } else {
            const res = await performWithdraw({ wallet: w, toAddress: addr, amountEth });
            tx = res.tx; receipt = res.receipt;
            ui.log("success", `L2 -> L1 | Block ${receipt.blockNumber} | Tx ${tx.hash}`);
            ui.log("info", `${L2_NETWORK.explorer}${tx.hash}`);
          }

          ui.transactionCount += 1;
          ui.pendingTx = Math.max(0, ui.pendingTx - 1);
          ui.updateStats({
            transactionCount: ui.transactionCount,
            pendingTx: ui.pendingTx,
            successRate: ((ui.transactionCount - ui.failedTx) / Math.max(1, ui.transactionCount)) * 100
          });
        } catch (e) {
          ui.failedTx += 1;
          ui.transactionCount += 1;
          ui.pendingTx = Math.max(0, ui.pendingTx - 1);
          ui.updateStats({
            failedTx: ui.failedTx,
            pendingTx: ui.pendingTx,
            transactionCount: ui.transactionCount,
            successRate: ((ui.transactionCount - ui.failedTx) / Math.max(1, ui.transactionCount)) * 100
          });
          ui.log("failed", e?.message || String(e));
        }

        if (i < bridgeCount - 1) {
          const delay =
            minDelay === maxDelay
              ? minDelay
              : Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          await ui.countdown(delay * 1000, "Delay");
        }
      }
    } catch (e) {
      ui.log("failed", e?.message || String(e));
    }
  }

  ui.setActive(false);
  ui.log("completed", "All accounts processed. Back to menu.");
}

async function deployTokenFlow(walletsL2List) {
  ui.setActive(true);
  try {
    const idx = await pickIndexOrCancel(walletsL2List, "deployment wallet");
    const wallet = walletsL2List[idx];
    await refreshWalletPanelDual(wallet);

    const name = await promptText("Token name:");
    const symbol = await promptText("Token symbol (ticker):");
    let decs = await promptInt(`Decimals (0..36)`, 0, 36);
    if (!Number.isFinite(decs)) decs = DEFAULT_DECIMALS;

    const supplyHuman = await promptNum("Total supply Tokens:");
    if (supplyHuman <= 0) throw new Cancelled();

    const { tokenAddr, txHash, blockNumber } = await deployErc20({
      wallet,
      name,
      symbol,
      decimals: decs,
      humanSupply: supplyHuman
    });

    if (!tokenAddr) {
      ui.log("warning", `Deployed but token address not found in event. Tx ${txHash}`);
      ui.setActive(false);
      return;
    }

    ui.log("success", `Deployed ${name} (${symbol}) @ ${tokenAddr} | Block ${blockNumber}`);
    ui.log("info", `${L2_NETWORK.explorer}${txHash}`);

    const store = await loadTokens();
    store.tokens.push({
      address: tokenAddr,
      name,
      symbol,
      decimals: decs,
      deployer: await wallet.getAddress(),
      txHash,
      createdAt: new Date().toISOString()
    });
    await saveTokens(store);

    await refreshTokensPanel(wallet);

    const sendAns = await ui.promptText("Send this token to random addresses now? (y/n)", "n");
    if (sendAns !== null && String(sendAns).toLowerCase().startsWith("y")) {
      const amt = await promptNum("Amount per Tokens:");
      const times = await promptInt("Number of transfers:", 1);
      const minD = await promptInt("Min delay (seconds):", 0);
      const maxD = await promptInt("Max delay (seconds):", minD);

      await sendErc20Random({
        wallet,
        tokenAddress: tokenAddr,
        amountHuman: amt,
        decimals: decs,
        times,
        minDelay: Math.max(0, minD || 0),
        maxDelay: Math.max(minD || 0, maxD || 0)
      });
    }
  } catch (e) {
    if (isCancelled(e)) ui.log("warning", "Cancelled by user.");
    else ui.log("failed", e?.message || String(e));
  }
  ui.setActive(false);
}

async function sendTokenMenu(walletsL2List) {
  ui.setActive(true);
  try {
    const store = await loadTokens();
    if (!store.tokens.length) {
      ui.log("warning", "No saved tokens yet. Deploy one first.");
      return;
    }

    
    await refreshTokensPanel(walletsL2List[0]);

    const tokIdx = await pickIndexOrCancel(store.tokens, "token");
    const tok = store.tokens[tokIdx];

    const wIdx = await pickIndexOrCancel(walletsL2List, "sender wallet");
    const wallet = walletsL2List[wIdx];
    await refreshWalletPanelDual(wallet);

    const amountHuman = await promptNum("Amount Tokens:");
    const times = await promptInt("Number of transfers:", 1);
    const minDelay = await promptInt("Min delay (seconds):", 0);
    const maxDelay = await promptInt("Max delay (seconds):", minDelay);

    await sendErc20Random({
      wallet,
      tokenAddress: tok.address,
      amountHuman,
      decimals: tok.decimals,
      times,
      minDelay: Math.max(0, minDelay || 0),
      maxDelay: Math.max(minDelay || 0, maxDelay || 0)
    });

    await refreshTokensPanel(wallet);
  } catch (e) {
    if (isCancelled(e)) ui.log("warning", "Cancelled by user.");
    else ui.log("failed", e?.message || String(e));
  }
  ui.setActive(false);
}


async function main() {
  const keysRaw = process.env.PRIVATE_KEYS || process.env.PRIVATE_KEY || "";
  const lines = keysRaw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) {
    ui.log("error", "No private keys found. Set PRIVATE_KEYS or PRIVATE_KEY in .env");
    return;
  }

  
  providerL1 = await getProvider(L1_NETWORK.rpcUrl);
  providerL2 = await getProvider(L2_NETWORK.rpcUrl);

  
  const walletsL1 = lines.map((pk) => new ethers.Wallet(pk, providerL1));
  const walletsL2 = lines.map((pk) => new ethers.Wallet(pk, providerL2));

  
  await refreshWalletPanelDual(walletsL2[0]);
  await refreshTokensPanel(walletsL2[0]);

  
  setInterval(async () => {
    try {
      const gas = await getGasPriceGwei(providerL2);
      ui.updateStats({ currentGasPrice: gas });
    } catch {}
  }, 10_000);

  
  ui.on("menu:select", async (_label, index) => {
    try {
      switch (index) {
        case 0: { 
          const bridgeCount = await promptInt("Bridge Count:", 1);
          const amountEth = await promptNum("ETH Amount:");
          const minDelay = await promptInt("Min delay (s):", 0);
          const maxDelay = await promptInt("Max delay (s):", minDelay);
          await runBridge({
            direction: 1,
            bridgeCount,
            amountEth,
            minDelay,
            maxDelay,
            wallets: walletsL1
          });
          break;
        }
        case 1: { 
          const bridgeCount = await promptInt("Bridge Count:", 1);
          const amountEth = await promptNum("ETH Amount:");
          const minDelay = await promptInt("Min delay (s):", 0);
          const maxDelay = await promptInt("Max delay (s):", minDelay);
          await runBridge({
            direction: 2,
            bridgeCount,
            amountEth,
            minDelay,
            maxDelay,
            wallets: walletsL2
          });
          break;
        }
        case 2: { 
          await deployTokenFlow(walletsL2);
          break;
        }
        case 3: { 
          await sendTokenMenu(walletsL2);
          break;
        }
        case 4: { 
          ui.destroy(0);
          break;
        }
        default:
          break;
      }
    } catch (e) {
      if (isCancelled(e)) ui.log("warning", "Cancelled by user.");
      else ui.log("failed", e?.message || String(e));
    }
  });
}

main().catch((e) => {
  ui.log("error", e?.message || String(e));
  process.exit(1);
});
