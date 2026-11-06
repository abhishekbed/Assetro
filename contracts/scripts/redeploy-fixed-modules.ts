import { ethers } from "hardhat";

/**
 * Redeploys the compliance modules after the audit fixes.
 *
 * Safe to run: no live token currently has any module bound, so no rebinding
 * or migration is required — only the *_MODULE_ADDRESS env vars change.
 */
const MODULES = [
  ["CountryRestrictModule", "COUNTRY_RESTRICT_MODULE_ADDRESS"],
  ["MaxHolderModule", "MAX_HOLDER_MODULE_ADDRESS"],
  ["TransferWindowModule", "TRANSFER_WINDOW_MODULE_ADDRESS"],
  ["SupplyLimitModule", "SUPPLY_LIMIT_MODULE_ADDRESS"],
  ["MaxBalanceModule", "MAX_BALANCE_MODULE_ADDRESS"],
  ["DayMonthLimitsModule", "DAY_MONTH_LIMITS_MODULE_ADDRESS"],
  ["ExchangeMonthlyLimitsModule", "EXCHANGE_MONTHLY_LIMITS_MODULE_ADDRESS"],
  ["TransferFeeModule", "TRANSFER_FEE_MODULE_ADDRESS"],
  ["SenderWhitelistModule", "SENDER_WHITELIST_MODULE_ADDRESS"],
] as const;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("deployer:", deployer.address);
  console.log("balance :", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  const out: Record<string, string> = {};
  for (const [name, envKey] of MODULES) {
    // The Sepolia endpoint drops connections intermittently; retry rather than
    // abandoning a half-finished deployment.
    let addr = "";
    for (let attempt = 1; attempt <= 4 && !addr; attempt++) {
      try {
        const f = await ethers.getContractFactory(name);
        const c = await f.deploy();
        await c.waitForDeployment();
        addr = await c.getAddress();
      } catch (e) {
        console.log(`  ${name} attempt ${attempt} failed: ${(e as Error).message.slice(0, 80)}`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    if (!addr) throw new Error(`could not deploy ${name}`);
    out[envKey] = addr;
    console.log(`${name.padEnd(30)} ${addr}`);
  }

  console.log("\n# ── paste into .env ──");
  for (const [, envKey] of MODULES) console.log(`${envKey}=${out[envKey]}`);
  for (const [, envKey] of MODULES) console.log(`NEXT_PUBLIC_${envKey}=${out[envKey]}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
