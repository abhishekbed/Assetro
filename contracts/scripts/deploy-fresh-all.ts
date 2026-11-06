import { ethers, network as hardhatNetwork } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const MODULE_NAMES = [
  "CountryRestrictModule",
  "MaxHolderModule",
  "TransferWindowModule",
  "SupplyLimitModule",
  "MaxBalanceModule",
  "DayMonthLimitsModule",
  "ExchangeMonthlyLimitsModule",
  "TransferFeeModule",
  "SenderWhitelistModule",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const rpcNetwork = await ethers.provider.getNetwork();
  const chainId = Number(rpcNetwork.chainId);

  if (!deployer) {
    throw new Error("No deployer configured. Add a funded testnet private key to the root .env.local file.");
  }
  if (hardhatNetwork.name === "arcTestnet" && chainId !== 5042002) {
    throw new Error(`Refusing to deploy: arcTestnet RPC returned chain ID ${chainId}, expected 5042002.`);
  }

  if (network.chainId === 5042n) {
    throw new Error("Arc mainnet deployments are disabled; use Arc Testnet (chain ID 5042002).");
  }

  const checkpointPath = path.resolve(
    __dirname,
    `../deployments/${hardhatNetwork.name}-resume-checkpoint.json`,
  );
  const contracts: Record<string, string> = fs.existsSync(checkpointPath)
    ? JSON.parse(fs.readFileSync(checkpointPath, "utf8"))
    : {};
  const alreadyHad = new Set(Object.keys(contracts));
  if (alreadyHad.size > 0) {
    console.log("Resuming from checkpoint:", checkpointPath);
    console.log("Already deployed:", [...alreadyHad].join(", "));
  }
  const saveCheckpoint = () => fs.writeFileSync(checkpointPath, JSON.stringify(contracts, null, 2));

  console.log("===========================================");
  console.log("  Assetro Platform - Fresh Full Deployment");
  console.log("===========================================");
  console.log("Network   :", hardhatNetwork.name, `(chainId ${chainId})`);
  console.log("Deployer  :", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  const nativeSymbol = chainId === 5042002 ? "test USDC" : "native token";
  console.log("Balance   :", ethers.formatEther(balance), nativeSymbol);
  if (balance === 0n) {
    throw new Error(`Deployer has no ${nativeSymbol}; fund the wallet before deploying`);
  }

  async function deploy(label: string, factoryName: string, ...args: any[]) {
    const Factory = await ethers.getContractFactory(factoryName);
    if (contracts[label]) {
      console.log(`\n[${label}] Already deployed, reusing ${contracts[label]}`);
      return Factory.attach(contracts[label]);
    }
    console.log(`\n[${label}] Deploying ${factoryName}...`);
    const c = await Factory.deploy(...args);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    contracts[label] = addr;
    console.log(`  ${label} -> ${addr}`);
    saveCheckpoint();
    return c;
  }

  // ---- 1-6: T-REX implementations ----
  await deploy("TokenImplementation", "Token");
  await deploy("CTRImplementation", "ClaimTopicsRegistry");
  await deploy("IRImplementation", "IdentityRegistry");
  await deploy("IRSImplementation", "IdentityRegistryStorage");
  await deploy("TIRImplementation", "TrustedIssuersRegistry");
  await deploy("MCImplementation", "ModularCompliance");

  // ---- 7: TREXImplementationAuthority (reference, new) ----
  const ia = await deploy(
    "TREXImplementationAuthority",
    "TREXImplementationAuthority",
    true,
    ethers.ZeroAddress,
    ethers.ZeroAddress
  );
  if (!alreadyHad.has("TREXImplementationAuthority")) {
    console.log("  Registering version 4.0.0 on IA...");
    const version = { major: 4, minor: 0, patch: 0 };
    const trexContracts = {
      tokenImplementation: contracts["TokenImplementation"],
      ctrImplementation: contracts["CTRImplementation"],
      irImplementation: contracts["IRImplementation"],
      irsImplementation: contracts["IRSImplementation"],
      tirImplementation: contracts["TIRImplementation"],
      mcImplementation: contracts["MCImplementation"],
    };
    await (await (ia as any).addAndUseTREXVersion(version, trexContracts)).wait();
    console.log("  Version 4.0.0 set.");
  }

  // ---- 8-9: ONCHAINID infra ----
  await deploy("IdentityImplementation", "Identity", deployer.address, true);
  await deploy("OIDImplementationAuthority", "ImplementationAuthority", contracts["IdentityImplementation"]);

  // ---- 10: IdFactory ----
  await deploy("IdFactory", "IdFactory", contracts["OIDImplementationAuthority"]);

  // ---- 11: TREXFactory ----
  const trexFactory = await deploy(
    "TREXFactory",
    "TREXFactory",
    contracts["TREXImplementationAuthority"],
    contracts["IdFactory"]
  );
  if (!alreadyHad.has("TREXFactory")) {
    console.log("  Setting TREXFactory on IA...");
    await (await (ia as any).setTREXFactory(contracts["TREXFactory"])).wait();
  }

  // ---- 12: IAFactory ----
  await deploy("IAFactory", "IAFactory", contracts["TREXFactory"]);
  if (!alreadyHad.has("IAFactory")) {
    console.log("  Setting IAFactory on IA...");
    await (await (ia as any).setIAFactory(contracts["IAFactory"])).wait();
  }

  // ---- 13: Platform ClaimIssuer ----
  await deploy("ClaimIssuer", "ClaimIssuer", deployer.address);

  // ---- 14: TREXGateway ----
  const trexGatewayIsNew = !alreadyHad.has("TREXGateway");
  const trexGateway = await deploy("TREXGateway", "TREXGateway", contracts["TREXFactory"], false);
  if (trexGatewayIsNew) {
    console.log("  Transferring TREXFactory ownership to TREXGateway...");
    await (await (trexFactory as any).transferOwnership(contracts["TREXGateway"])).wait();
    console.log("  Authorizing deployer on TREXGateway...");
    await (await (trexGateway as any).addDeployer(deployer.address)).wait();
  }

  // ---- 15: ONCHAINID Gateway ----
  const IdFactoryFactory = await ethers.getContractFactory("IdFactory");
  const idFactory = IdFactoryFactory.attach(contracts["IdFactory"]);
  const oidGatewayIsNew = !alreadyHad.has("OIDGateway");
  const oidGateway = await deploy("OIDGateway", "Gateway", contracts["IdFactory"], [deployer.address]);
  if (oidGatewayIsNew) {
    console.log("  Transferring IdFactory ownership to OIDGateway...");
    await (await (idFactory as any).transferOwnership(contracts["OIDGateway"])).wait();
  }

  // ---- 16: register TREXFactory as a token factory on IdFactory (via gateway) ----
  const isRegisteredAlready = await (idFactory as any).isTokenFactory(contracts["TREXFactory"]);
  if (!isRegisteredAlready) {
    console.log("\n  Registering TREXFactory as token factory on IdFactory...");
    const callData = new ethers.Interface(["function addTokenFactory(address _factory) external"]).encodeFunctionData(
      "addTokenFactory",
      [contracts["TREXFactory"]]
    );
    await (await (oidGateway as any).callFactory(callData)).wait();
  }
  const isRegistered = await (idFactory as any).isTokenFactory(contracts["TREXFactory"]);
  console.log("  TREXFactory registered as token factory:", isRegistered);
  if (!isRegistered) {
    throw new Error("Failed to register TREXFactory as token factory on IdFactory");
  }

  // ---- 17: compliance modules ----
  for (const moduleName of MODULE_NAMES) {
    await deploy(moduleName, moduleName);
  }

  // ---- save ----
  const deploymentsDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const outFile = path.join(deploymentsDir, `${hardhatNetwork.name}-fresh-${Date.now()}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        network: hardhatNetwork.name,
        chainId,
        deployer: deployer.address,
        deployedAt: new Date().toISOString(),
        contracts,
        status: "complete",
      },
      null,
      2
    )
  );

  console.log("\n===========================================");
  console.log("  Deployment Complete");
  console.log("===========================================");
  console.log(JSON.stringify(contracts, null, 2));
  console.log("\nSaved to:", outFile);

  // machine-readable marker line for the orchestrating shell script
  console.log("\n__DEPLOYMENT_JSON_START__");
  console.log(JSON.stringify(contracts));
  console.log("__DEPLOYMENT_JSON_END__");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
