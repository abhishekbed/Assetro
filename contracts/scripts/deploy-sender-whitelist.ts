/**
 * Redeploys SenderWhitelistModule on its own.
 *
 * Needed after changing the module's semantics so that an empty whitelist means
 * "no restriction" instead of blocking every transfer. Module instances are
 * shared platform-wide, so this replaces the address referenced by
 * SENDER_WHITELIST_MODULE_ADDRESS / NEXT_PUBLIC_SENDER_WHITELIST_MODULE_ADDRESS.
 */
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("Network :", network.name, `(chainId ${network.chainId})`);
  console.log("Deployer:", deployer.address);
  console.log("Balance :", ethers.formatEther(balance), "ETH");

  const previous = process.env.SENDER_WHITELIST_MODULE_ADDRESS;
  if (previous) console.log("Previous:", previous);

  const factory = await ethers.getContractFactory("SenderWhitelistModule");
  const module = await factory.deploy();
  await module.waitForDeployment();
  const address = await module.getAddress();

  // sanity check the freshly deployed bytecode
  const name = await module.name();
  const countForUnusedCompliance = await module.whitelistedSenderCount(ethers.ZeroAddress);

  console.log("\nSenderWhitelistModule deployed:", address);
  console.log("  name()                     :", name);
  console.log("  whitelistedSenderCount(0x0):", countForUnusedCompliance.toString(), "(0 = restriction dormant)");

  console.log("\n# ─── Update these in the root .env ──────────────────────────");
  console.log(`SENDER_WHITELIST_MODULE_ADDRESS=${address}`);
  console.log(`NEXT_PUBLIC_SENDER_WHITELIST_MODULE_ADDRESS=${address}`);
  console.log("# ────────────────────────────────────────────────────────────");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
