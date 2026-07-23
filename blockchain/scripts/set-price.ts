import { ethers } from "hardhat";

async function fetchLiveEthMyr(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=myr",
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json() as { ethereum: { myr: number } };
    const price = Math.round(data.ethereum.myr);
    if (price > 0) return price;
  } catch (e) {
    console.warn("Could not fetch live price:", e instanceof Error ? e.message : e);
  }
  return 0;
}

async function main() {
  const LOAN_ADDR = process.env.LOAN_ADDR;
  if (!LOAN_ADDR) {
    // Try to read from contractConfig
    const fs = await import("fs");
    const path = await import("path");
    const cfg = fs.readFileSync(
      path.resolve(__dirname, "../../web/src/lib/contractConfig.ts"), "utf8"
    );
    const m = cfg.match(/CryptoLoan:\s*"(0x[0-9a-fA-F]+)"/);
    if (!m) { console.error("Could not find CryptoLoan address in contractConfig.ts"); process.exit(1); }
    process.env.LOAN_ADDR = m[1];
  }

  const [owner] = await ethers.getSigners();
  const loan = await ethers.getContractAt("CryptoLoan", process.env.LOAN_ADDR!);

  const current = await (loan as unknown as { ethPrice(): Promise<bigint> }).ethPrice();
  console.log(`Current on-chain price: RM ${current.toString()}`);

  const priceArg = process.env.PRICE ? parseInt(process.env.PRICE) : await fetchLiveEthMyr();
  if (!priceArg || priceArg <= 0) {
    console.error("Could not determine new price. Set PRICE=<number> env var or ensure CoinGecko is reachable.");
    process.exit(1);
  }

  console.log(`Setting price to: RM ${priceArg.toLocaleString()}`);
  const tx = await (loan as unknown as { setEthPrice(p: number): Promise<{ wait(): Promise<unknown> }> }).setEthPrice(priceArg);
  await tx.wait();
  console.log(`✓ ETH price updated to RM ${priceArg.toLocaleString()}`);
}

main().catch(e => { console.error(e); process.exit(1); });
