import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying compliance modules with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "(chainId:", network.chainId.toString(), ")");

  // ── Deploy CountryRestrictModule ─────────────────────────────────────────
  console.log("\nDeploying CountryRestrictModule...");
  const CountryRestrictModule = await ethers.getContractFactory("CountryRestrictModule");
  const countryRestrictModule = await CountryRestrictModule.deploy();
  await countryRestrictModule.waitForDeployment();
  const countryRestrictAddress = await countryRestrictModule.getAddress();
  console.log("CountryRestrictModule deployed to:", countryRestrictAddress);

  // ── Deploy MaxHolderModule ────────────────────────────────────────────────
  console.log("\nDeploying MaxHolderModule...");
  const MaxHolderModule = await ethers.getContractFactory("MaxHolderModule");
  const maxHolderModule = await MaxHolderModule.deploy();
  await maxHolderModule.waitForDeployment();
  const maxHolderAddress = await maxHolderModule.getAddress();
  console.log("MaxHolderModule deployed to:", maxHolderAddress);

  // ── Deploy TransferWindowModule ───────────────────────────────────────────
  console.log("\nDeploying TransferWindowModule...");
  const TransferWindowModule = await ethers.getContractFactory("TransferWindowModule");
  const transferWindowModule = await TransferWindowModule.deploy();
  await transferWindowModule.waitForDeployment();
  const transferWindowAddress = await transferWindowModule.getAddress();
  console.log("TransferWindowModule deployed to:", transferWindowAddress);

  // ── Deploy SupplyLimitModule ──────────────────────────────────────────────
  console.log("\nDeploying SupplyLimitModule...");
  const SupplyLimitModule = await ethers.getContractFactory("SupplyLimitModule");
  const supplyLimitModule = await SupplyLimitModule.deploy();
  await supplyLimitModule.waitForDeployment();
  const supplyLimitAddress = await supplyLimitModule.getAddress();
  console.log("SupplyLimitModule deployed to:", supplyLimitAddress);

  // ── Deploy MaxBalanceModule ───────────────────────────────────────────────
  console.log("\nDeploying MaxBalanceModule...");
  const MaxBalanceModule = await ethers.getContractFactory("MaxBalanceModule");
  const maxBalanceModule = await MaxBalanceModule.deploy();
  await maxBalanceModule.waitForDeployment();
  const maxBalanceAddress = await maxBalanceModule.getAddress();
  console.log("MaxBalanceModule deployed to:", maxBalanceAddress);

  // ── Deploy DayMonthLimitsModule ───────────────────────────────────────────
  console.log("\nDeploying DayMonthLimitsModule...");
  const DayMonthLimitsModule = await ethers.getContractFactory("DayMonthLimitsModule");
  const dayMonthLimitsModule = await DayMonthLimitsModule.deploy();
  await dayMonthLimitsModule.waitForDeployment();
  const dayMonthLimitsAddress = await dayMonthLimitsModule.getAddress();
  console.log("DayMonthLimitsModule deployed to:", dayMonthLimitsAddress);

  // ── Deploy ExchangeMonthlyLimitsModule ────────────────────────────────────
  console.log("\nDeploying ExchangeMonthlyLimitsModule...");
  const ExchangeMonthlyLimitsModule = await ethers.getContractFactory("ExchangeMonthlyLimitsModule");
  const exchangeMonthlyLimitsModule = await ExchangeMonthlyLimitsModule.deploy();
  await exchangeMonthlyLimitsModule.waitForDeployment();
  const exchangeMonthlyLimitsAddress = await exchangeMonthlyLimitsModule.getAddress();
  console.log("ExchangeMonthlyLimitsModule deployed to:", exchangeMonthlyLimitsAddress);

  // ── Deploy TransferFeeModule ──────────────────────────────────────────────
  console.log("\nDeploying TransferFeeModule...");
  const TransferFeeModule = await ethers.getContractFactory("TransferFeeModule");
  const transferFeeModule = await TransferFeeModule.deploy();
  await transferFeeModule.waitForDeployment();
  const transferFeeAddress = await transferFeeModule.getAddress();
  console.log("TransferFeeModule deployed to:", transferFeeAddress);

  // ── Deploy SenderWhitelistModule ─────────────────────────────────────────
  console.log("\nDeploying SenderWhitelistModule...");
  const SenderWhitelistModule = await ethers.getContractFactory("SenderWhitelistModule");
  const senderWhitelistModule = await SenderWhitelistModule.deploy();
  await senderWhitelistModule.waitForDeployment();
  const senderWhitelistAddress = await senderWhitelistModule.getAddress();
  console.log("SenderWhitelistModule deployed to:", senderWhitelistAddress);

  // ── Save addresses ─────────────────────────────────────────────────────────
  const deploymentsDir = path.resolve(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const output = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    CountryRestrictModule: countryRestrictAddress,
    MaxHolderModule: maxHolderAddress,
    TransferWindowModule: transferWindowAddress,
    SupplyLimitModule: supplyLimitAddress,
    MaxBalanceModule: maxBalanceAddress,
    DayMonthLimitsModule: dayMonthLimitsAddress,
    ExchangeMonthlyLimitsModule: exchangeMonthlyLimitsAddress,
    TransferFeeModule: transferFeeAddress,
    SenderWhitelistModule: senderWhitelistAddress,
  };

  const outputPath = path.resolve(deploymentsDir, "sepolia-modules.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log("\nAddresses saved to:", outputPath);

  console.log("\n=== Deployment Summary ===");
  console.log("CountryRestrictModule       :", countryRestrictAddress);
  console.log("MaxHolderModule             :", maxHolderAddress);
  console.log("TransferWindowModule        :", transferWindowAddress);
  console.log("SupplyLimitModule           :", supplyLimitAddress);
  console.log("MaxBalanceModule            :", maxBalanceAddress);
  console.log("DayMonthLimitsModule        :", dayMonthLimitsAddress);
  console.log("ExchangeMonthlyLimitsModule :", exchangeMonthlyLimitsAddress);
  console.log("TransferFeeModule           :", transferFeeAddress);
  console.log("SenderWhitelistModule       :", senderWhitelistAddress);
  console.log("=========================");

  console.log("\nAdd the following to your .env:");
  console.log(`COUNTRY_RESTRICT_MODULE_ADDRESS=${countryRestrictAddress}`);
  console.log(`MAX_HOLDER_MODULE_ADDRESS=${maxHolderAddress}`);
  console.log(`TRANSFER_WINDOW_MODULE_ADDRESS=${transferWindowAddress}`);
  console.log(`SUPPLY_LIMIT_MODULE_ADDRESS=${supplyLimitAddress}`);
  console.log(`MAX_BALANCE_MODULE_ADDRESS=${maxBalanceAddress}`);
  console.log(`DAY_MONTH_LIMITS_MODULE_ADDRESS=${dayMonthLimitsAddress}`);
  console.log(`EXCHANGE_MONTHLY_LIMITS_MODULE_ADDRESS=${exchangeMonthlyLimitsAddress}`);
  console.log(`TRANSFER_FEE_MODULE_ADDRESS=${transferFeeAddress}`);
  console.log(`SENDER_WHITELIST_MODULE_ADDRESS=${senderWhitelistAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
