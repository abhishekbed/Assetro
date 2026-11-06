import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const CHECKPOINT_FILE = path.resolve(__dirname, "../deployments/sepolia-partial.json");

// Load existing checkpoint to resume deployment
function loadCheckpoint(): Record<string, string> {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8"));
    console.log("Resuming from checkpoint:", CHECKPOINT_FILE);
    return data.contracts || {};
  }
  return {};
}

// Save checkpoint after each deployment
function saveCheckpoint(contracts: Record<string, string>, deployer: string, chainId: number) {
  const data = {
    network: "sepolia",
    chainId,
    deployer,
    updatedAt: new Date().toISOString(),
    contracts,
    status: "in-progress",
  };
  fs.mkdirSync(path.dirname(CHECKPOINT_FILE), { recursive: true });
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
}

async function deployOrReuse(
  name: string,
  deployFn: () => Promise<string>,
  checkpoint: Record<string, string>
): Promise<string> {
  if (checkpoint[name]) {
    console.log(`  [SKIP] ${name} already deployed: ${checkpoint[name]}`);
    return checkpoint[name];
  }
  const address = await deployFn();
  checkpoint[name] = address;
  return address;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log("===========================================");
  console.log("  Assetro Platform - Full T-REX Deployment");
  console.log("===========================================");
  console.log("Network   :", network.name, `(chainId ${chainId})`);
  console.log("Deployer  :", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance   :", ethers.formatEther(balance), "ETH");

  if (balance === 0n) {
    throw new Error("Deployer has 0 ETH — fund the wallet before deploying");
  }

  const checkpoint = loadCheckpoint();
  const save = () => saveCheckpoint(checkpoint, deployer.address, chainId);

  // ─── 1-6: T-REX Implementation Contracts ────────────────────────────────

  console.log("\n[1/13] Token implementation...");
  await deployOrReuse("TokenImplementation", async () => {
    const Token = await ethers.getContractFactory("Token");
    const c = await Token.deploy();
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log("  Deployed:", addr);
    return addr;
  }, checkpoint);
  save();

  console.log("\n[2/13] ClaimTopicsRegistry implementation...");
  await deployOrReuse("CTRImplementation", async () => {
    const CTR = await ethers.getContractFactory("ClaimTopicsRegistry");
    const c = await CTR.deploy();
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log("  Deployed:", addr);
    return addr;
  }, checkpoint);
  save();

  console.log("\n[3/13] IdentityRegistry implementation...");
  await deployOrReuse("IRImplementation", async () => {
    const IR = await ethers.getContractFactory("IdentityRegistry");
    const c = await IR.deploy();
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log("  Deployed:", addr);
    return addr;
  }, checkpoint);
  save();

  console.log("\n[4/13] IdentityRegistryStorage implementation...");
  await deployOrReuse("IRSImplementation", async () => {
    const IRS = await ethers.getContractFactory("IdentityRegistryStorage");
    const c = await IRS.deploy();
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log("  Deployed:", addr);
    return addr;
  }, checkpoint);
  save();

  console.log("\n[5/13] TrustedIssuersRegistry implementation...");
  await deployOrReuse("TIRImplementation", async () => {
    const TIR = await ethers.getContractFactory("TrustedIssuersRegistry");
    const c = await TIR.deploy();
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log("  Deployed:", addr);
    return addr;
  }, checkpoint);
  save();

  console.log("\n[6/13] ModularCompliance implementation...");
  await deployOrReuse("MCImplementation", async () => {
    const MC = await ethers.getContractFactory("ModularCompliance");
    const c = await MC.deploy();
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log("  Deployed:", addr);
    return addr;
  }, checkpoint);
  save();

  // ─── 7: TREXImplementationAuthority ─────────────────────────────────────

  console.log("\n[7/13] TREXImplementationAuthority (reference)...");
  let iaIsNew = false;
  const iaAddress = await deployOrReuse("TREXImplementationAuthority", async () => {
    const IA = await ethers.getContractFactory("TREXImplementationAuthority");
    const ia = await IA.deploy(true, ethers.ZeroAddress, ethers.ZeroAddress);
    await ia.waitForDeployment();
    iaIsNew = true;
    const addr = await ia.getAddress();
    console.log("  Deployed:", addr);
    return addr;
  }, checkpoint);
  save();

  // Add version 4.0.0 to IA if it's freshly deployed
  if (iaIsNew) {
    const IA = await ethers.getContractFactory("TREXImplementationAuthority");
    const ia = IA.attach(iaAddress) as Awaited<ReturnType<typeof IA.deploy>>;
    const version = { major: 4, minor: 0, patch: 0 };
    const trexContracts = {
      tokenImplementation: checkpoint["TokenImplementation"],
      ctrImplementation: checkpoint["CTRImplementation"],
      irImplementation: checkpoint["IRImplementation"],
      irsImplementation: checkpoint["IRSImplementation"],
      tirImplementation: checkpoint["TIRImplementation"],
      mcImplementation: checkpoint["MCImplementation"],
    };
    console.log("  Adding version 4.0.0 to IA...");
    const tx = await ia.addAndUseTREXVersion(version, trexContracts);
    await tx.wait();
    console.log("  Version 4.0.0 set.");
  }

  // ─── 8-9: ONCHAINID Infrastructure ──────────────────────────────────────

  console.log("\n[8/13] ONCHAINID Identity implementation...");
  await deployOrReuse("IdentityImplementation", async () => {
    const Identity = await ethers.getContractFactory("Identity");
    const c = await Identity.deploy(deployer.address, true);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log("  Deployed:", addr);
    return addr;
  }, checkpoint);
  save();

  console.log("\n[9/13] ONCHAINID ImplementationAuthority...");
  await deployOrReuse("OIDImplementationAuthority", async () => {
    const OIDImplAuth = await ethers.getContractFactory("ImplementationAuthority");
    const c = await OIDImplAuth.deploy(checkpoint["IdentityImplementation"]);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log("  Deployed:", addr);
    return addr;
  }, checkpoint);
  save();

  // ─── 10: IdFactory ──────────────────────────────────────────────────────

  console.log("\n[10/13] IdFactory...");
  const idFactoryAddress = await deployOrReuse("IdFactory", async () => {
    const IdFactory = await ethers.getContractFactory("IdFactory");
    const c = await IdFactory.deploy(checkpoint["OIDImplementationAuthority"]);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log("  Deployed:", addr);
    return addr;
  }, checkpoint);
  save();

  // ─── 11: TREXFactory ────────────────────────────────────────────────────

  console.log("\n[11/13] TREXFactory...");
  let trexFactoryIsNew = false;
  const trexFactoryAddress = await deployOrReuse("TREXFactory", async () => {
    const TREXFactory = await ethers.getContractFactory("TREXFactory");
    const c = await TREXFactory.deploy(iaAddress, idFactoryAddress);
    await c.waitForDeployment();
    trexFactoryIsNew = true;
    const addr = await c.getAddress();
    console.log("  Deployed:", addr);
    return addr;
  }, checkpoint);
  save();

  if (trexFactoryIsNew) {
    const IA = await ethers.getContractFactory("TREXImplementationAuthority");
    const ia = IA.attach(iaAddress) as Awaited<ReturnType<typeof IA.deploy>>;
    console.log("  Setting TREXFactory on IA...");
    const tx = await ia.setTREXFactory(trexFactoryAddress);
    await tx.wait();
    console.log("  Done.");
  }

  // ─── 12: IAFactory ──────────────────────────────────────────────────────

  console.log("\n[12/13] IAFactory...");
  let iaFactoryIsNew = false;
  const iaFactoryAddress = await deployOrReuse("IAFactory", async () => {
    const IAFactoryContract = await ethers.getContractFactory("IAFactory");
    const c = await IAFactoryContract.deploy(trexFactoryAddress);
    await c.waitForDeployment();
    iaFactoryIsNew = true;
    const addr = await c.getAddress();
    console.log("  Deployed:", addr);
    return addr;
  }, checkpoint);
  save();

  if (iaFactoryIsNew) {
    const IA = await ethers.getContractFactory("TREXImplementationAuthority");
    const ia = IA.attach(iaAddress) as Awaited<ReturnType<typeof IA.deploy>>;
    console.log("  Setting IAFactory on IA...");
    const tx = await ia.setIAFactory(iaFactoryAddress);
    await tx.wait();
    console.log("  Done.");
  }

  // ─── 13: Platform ClaimIssuer ────────────────────────────────────────────

  console.log("\n[13/13] Platform ClaimIssuer...");
  const claimIssuerAddress = await deployOrReuse("ClaimIssuer", async () => {
    const ClaimIssuer = await ethers.getContractFactory("ClaimIssuer");
    const c = await ClaimIssuer.deploy(deployer.address);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log("  Deployed:", addr);
    return addr;
  }, checkpoint);
  save();

  // ─── Final checkpoint: mark complete ────────────────────────────────────

  const finalData = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: checkpoint,
    status: "complete",
  };
  const finalFile = path.resolve(__dirname, `../deployments/sepolia-${Date.now()}.json`);
  fs.writeFileSync(finalFile, JSON.stringify(finalData, null, 2));

  // ─── Summary ──────────────────────────────────────────────────────────────

  console.log("\n===========================================");
  console.log("  Deployment Complete");
  console.log("===========================================");
  console.log(JSON.stringify(checkpoint, null, 2));
  console.log("\nDeployment saved to:", finalFile);

  const c = checkpoint;
  console.log("\n# ─── Add these to your root .env ───────────────────────────────");
  console.log(`\n# T-REX (Sepolia - chainId 11155111)`);
  console.log(`NEXT_PUBLIC_TREX_FACTORY_ADDRESS_11155111=${c["TREXFactory"]}`);
  console.log(`TREX_FACTORY_ADDRESS=${c["TREXFactory"]}`);
  console.log(`\n# ONCHAINID`);
  console.log(`NEXT_PUBLIC_ID_FACTORY_ADDRESS_11155111=${c["IdFactory"]}`);
  console.log(`ID_FACTORY_ADDRESS=${c["IdFactory"]}`);
  console.log(`\n# Platform ClaimIssuer`);
  console.log(`NEXT_PUBLIC_CLAIM_ISSUER_ADDRESS_11155111=${c["ClaimIssuer"]}`);
  console.log(`CLAIM_ISSUER_ADDRESS=${c["ClaimIssuer"]}`);
  console.log(`\n# T-REX IA`);
  console.log(`TREX_IA_ADDRESS=${c["TREXImplementationAuthority"]}`);
  console.log("# ───────────────────────────────────────────────────────────────");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
