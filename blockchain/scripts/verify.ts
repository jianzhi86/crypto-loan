import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const configPath = path.join(__dirname, "../../src/lib/contractConfig.ts");
  if (!fs.existsSync(configPath)) {
    throw new Error("contractConfig.ts not found — run deploy first");
  }

  const content = fs.readFileSync(configPath, "utf8");

  const loanMatch = content.match(/CryptoLoan:\s*"(0x[0-9a-fA-F]+)"/);
  const myrMatch  = content.match(/MockMYR:\s*"(0x[0-9a-fA-F]+)"/);
  const priceMatch = content.match(/ETH_PRICE_MYR\s*=\s*(\d+)/);

  if (!loanMatch || !myrMatch || !priceMatch) {
    throw new Error("Could not parse contract addresses from contractConfig.ts");
  }

  const loanAddress = loanMatch[1];
  const myrAddress  = myrMatch[1];
  const ethPrice    = priceMatch[1];

  console.log("Verifying CryptoLoan at:", loanAddress);
  await run("verify:verify", {
    address: loanAddress,
    constructorArguments: [Number(ethPrice)],
    contract: "contracts/CryptoLoan.sol:CryptoLoan",
  });
  console.log("CryptoLoan verified\n");

  console.log("Verifying MockMYR at:", myrAddress);
  await run("verify:verify", {
    address: myrAddress,
    constructorArguments: [],
    contract: "contracts/MockMYR.sol:MockMYR",
  });
  console.log("MockMYR verified\n");

  console.log("All contracts verified on Etherscan.");
}

main().catch(e => { console.error(e); process.exitCode = 1; });
