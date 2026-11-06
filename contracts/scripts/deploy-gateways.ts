import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// New addresses from Step 3 deployment
const TREX_FACTORY   = "0x2c50461DF40dCb5B77FfD13BC8685F76f3598dc4";
const ID_FACTORY     = "0x426E98F361B3CD424665eab7D81CccdF9fc1fe14";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("===========================================");
  console.log("  Assetro Platform - Gateway Deployment");
  console.log("===========================================");
  console.log("Network   :", network.name, `(chainId ${network.chainId})`);
  console.log("Deployer  :", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance   :", ethers.formatEther(balance), "ETH");

  // ─── TREXGateway ─────────────────────────────────────────────────────────
  // Controls who can deploy new T-REX token suites via TREXFactory.
  console.log("\n[1/2] Deploying TREXGateway...");
  const TREXGateway = await ethers.getContractFactory("TREXGateway");
  const trexGateway = await TREXGateway.deploy(TREX_FACTORY, false);
  await trexGateway.waitForDeployment();
  const trexGatewayAddress = await trexGateway.getAddress();
  console.log("  TREXGateway :", trexGatewayAddress);

  // Transfer TREXFactory ownership to TREXGateway
  console.log("  Transferring TREXFactory ownership to TREXGateway...");
  const TREXFactoryContract = await ethers.getContractFactory("TREXFactory");
  const trexFactory = TREXFactoryContract.attach(TREX_FACTORY) as Awaited<ReturnType<typeof TREXFactoryContract.deploy>>;
  const tx1 = await trexFactory.transferOwnership(trexGatewayAddress);
  await tx1.wait();
  console.log("  TREXFactory ownership transferred.");

  // ─── ONCHAINID Gateway ───────────────────────────────────────────────────
  // Controls who can create investor identities via IdFactory.
  // Deployer is added as an approved signer so the backend can create identities.
  console.log("\n[2/2] Deploying ONCHAINID Gateway...");
  const Gateway = await ethers.getContractFactory("Gateway");
  const oidGateway = await Gateway.deploy(ID_FACTORY, [deployer.address]);
  await oidGateway.waitForDeployment();
  const oidGatewayAddress = await oidGateway.getAddress();
  console.log("  ONCHAINID Gateway   :", oidGatewayAddress);

  // Transfer IdFactory ownership to ONCHAINID Gateway
  console.log("  Transferring IdFactory ownership to ONCHAINID Gateway...");
  const IdFactory = await ethers.getContractFactory("IdFactory");
  const idFactory = IdFactory.attach(ID_FACTORY) as Awaited<ReturnType<typeof IdFactory.deploy>>;
  const tx2 = await idFactory.transferOwnership(oidGatewayAddress);
  await tx2.wait();
  console.log("  IdFactory ownership transferred.");

  // ─── Save & print ─────────────────────────────────────────────────────────

  const deploymentsDir = path.resolve(__dirname, "../deployments");
  const outFile = path.join(deploymentsDir, `sepolia-gateways-${Date.now()}.json`);
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      TREXFactory: TREX_FACTORY,
      TREXGateway: trexGatewayAddress,
      IdFactory: ID_FACTORY,
      OIDGateway: oidGatewayAddress,
    },
  }, null, 2));

  console.log("\n===========================================");
  console.log("  Complete");
  console.log("===========================================");
  console.log("  TREXGateway (new) :", trexGatewayAddress);
  console.log("  OIDGateway (new)  :", oidGatewayAddress);
  console.log("\nSaved to:", outFile);

  console.log("\n# ─── Add these to your root .env ───────────────────────────────");
  console.log(`TREX_GATEWAY_ADDRESS=${trexGatewayAddress}`);
  console.log(`NEXT_PUBLIC_TREX_GATEWAY_ADDRESS_11155111=${trexGatewayAddress}`);
  console.log(`OID_GATEWAY_ADDRESS=${oidGatewayAddress}`);
  console.log(`NEXT_PUBLIC_OID_GATEWAY_ADDRESS_11155111=${oidGatewayAddress}`);
  console.log("# ───────────────────────────────────────────────────────────────");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
