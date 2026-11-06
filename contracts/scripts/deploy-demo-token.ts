/**
 * Deploy a demo T-REX token suite via TREXGateway.
 *
 * This script:
 *  1. Calls TREXGateway.deployTREXSuite() with ClaimDetails wired to the
 *     platform ClaimIssuer and all 4 claim topics.
 *  2. Verifies that ClaimTopicsRegistry and TrustedIssuersRegistry are
 *     correctly set up on-chain.
 *  3. Prints all suite addresses for use in .env.
 *
 * Claim Topics (ERC-3643 platform standard):
 *   1 = KYC_APPROVED
 *   2 = COUNTRY_OF_RESIDENCE  (ISO 3166-1 numeric)
 *   3 = INVESTOR_CLASSIFICATION  (1=retail, 2=accredited, 3=institutional)
 *   4 = ACCREDITED_STATUS
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const TREX_GATEWAY    = "0xC23B425Ec65BC660De532032af5c57A37B42Aa39";
const TREX_FACTORY    = "0x92e6CC99FFc8472715867388230B99332600641D";
const CLAIM_ISSUER    = "0x69ee75F1E4e65BE904209d2059582cba7B9A930d";

// Claim topic constants
const CLAIM_TOPIC_KYC_APPROVED            = 1n;
const CLAIM_TOPIC_COUNTRY                 = 2n;
const CLAIM_TOPIC_INVESTOR_CLASSIFICATION = 3n;
const CLAIM_TOPIC_ACCREDITED_STATUS       = 4n;

const ALL_CLAIM_TOPICS = [
  CLAIM_TOPIC_KYC_APPROVED,
  CLAIM_TOPIC_COUNTRY,
  CLAIM_TOPIC_INVESTOR_CLASSIFICATION,
  CLAIM_TOPIC_ACCREDITED_STATUS,
];

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("===========================================");
  console.log("  Assetro Platform - Demo Token Deployment");
  console.log("===========================================");
  console.log("Network   :", network.name, `(chainId ${network.chainId})`);
  console.log("Deployer  :", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance   :", ethers.formatEther(balance), "ETH");

  // ─── Build TokenDetails ──────────────────────────────────────────────────
  const tokenDetails = {
    owner: deployer.address,
    name: "Assetro Demo Security Token",
    symbol: "ADST",
    decimals: 0,                // Security tokens typically use 0 decimals
    irs: ethers.ZeroAddress,   // Deploy fresh IRS
    ONCHAINID: ethers.ZeroAddress,
    irAgents: [deployer.address],
    tokenAgents: [deployer.address],
    complianceModules: [],
    complianceSettings: [],
  };

  // ─── Build ClaimDetails ───────────────────────────────────────────────────
  // Register ClaimIssuer as the trusted issuer for ALL 4 claim topics.
  // This means: when a token transfer is validated, the compliance contract
  // will check that the investor's identity has valid claims signed by this
  // ClaimIssuer for the required topics.
  const claimDetails = {
    claimTopics: ALL_CLAIM_TOPICS,
    issuers: [CLAIM_ISSUER],
    issuerClaims: [ALL_CLAIM_TOPICS],   // ClaimIssuer is trusted for all 4 topics
  };

  // ─── Deploy via TREXGateway ──────────────────────────────────────────────
  console.log("\nDeploying demo token suite via TREXGateway...");
  console.log("  Name    :", tokenDetails.name);
  console.log("  Symbol  :", tokenDetails.symbol);
  console.log("  ClaimIssuer registered for topics:", ALL_CLAIM_TOPICS.map(Number));

  const TREXGateway = await ethers.getContractFactory("TREXGateway");
  const gateway = TREXGateway.attach(TREX_GATEWAY) as Awaited<ReturnType<typeof TREXGateway.deploy>>;

  const tx = await gateway.deployTREXSuite(tokenDetails, claimDetails);
  console.log("  Tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("  Confirmed in block:", receipt?.blockNumber);

  // ─── Read deployed addresses from TREXFactory ────────────────────────────
  // The salt used by TREXGateway is: hex(owner) + tokenName
  const salt = ethers.hexlify(deployer.address).toLowerCase() + tokenDetails.name;

  const TREXFactory = await ethers.getContractFactory("TREXFactory");
  const factory = TREXFactory.attach(TREX_FACTORY) as Awaited<ReturnType<typeof TREXFactory.deploy>>;

  const tokenAddress = await factory.getToken(salt);
  console.log("\n  Token deployed at:", tokenAddress);

  // Read the full suite from the token's linked contracts
  const tokenAbi = [
    "function identityRegistry() view returns (address)",
    "function compliance() view returns (address)",
  ];
  const token = new ethers.Contract(tokenAddress, tokenAbi, deployer);
  const irAddress = await token.identityRegistry();
  const mcAddress = await token.compliance();

  const irAbi = [
    "function topicsRegistry() view returns (address)",
    "function issuersRegistry() view returns (address)",
    "function identityStorage() view returns (address)",
  ];
  const ir = new ethers.Contract(irAddress, irAbi, deployer);
  const ctrAddress = await ir.topicsRegistry();
  const tirAddress = await ir.issuersRegistry();
  const irsAddress = await ir.identityStorage();

  // ─── Verify claim topics were set ────────────────────────────────────────
  const ctrAbi = ["function getClaimTopics() view returns (uint256[])"];
  const ctr = new ethers.Contract(ctrAddress, ctrAbi, deployer);
  const registeredTopics = await ctr.getClaimTopics();
  console.log("\n  ClaimTopicsRegistry topics:", registeredTopics.map(Number));

  // ─── Verify ClaimIssuer was registered ───────────────────────────────────
  const tirAbi = ["function isTrustedIssuer(address) view returns (bool)"];
  const tir = new ethers.Contract(tirAddress, tirAbi, deployer);
  const isTrusted = await tir.isTrustedIssuer(CLAIM_ISSUER);
  console.log("  ClaimIssuer trusted in TIR:", isTrusted);

  if (!isTrusted) {
    throw new Error("ClaimIssuer was NOT registered in TrustedIssuersRegistry — check ClaimDetails");
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  const suite = {
    Token: tokenAddress,
    IdentityRegistry: irAddress,
    IdentityRegistryStorage: irsAddress,
    ClaimTopicsRegistry: ctrAddress,
    TrustedIssuersRegistry: tirAddress,
    ModularCompliance: mcAddress,
  };

  console.log("\n===========================================");
  console.log("  Demo Token Suite Deployed & Verified");
  console.log("===========================================");
  console.log(JSON.stringify(suite, null, 2));

  // Save to deployments
  const deploymentsDir = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const outFile = path.join(deploymentsDir, `sepolia-demo-token-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    network: network.name,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    token: { name: tokenDetails.name, symbol: tokenDetails.symbol, decimals: tokenDetails.decimals },
    claimTopics: ALL_CLAIM_TOPICS.map(Number),
    claimIssuer: CLAIM_ISSUER,
    suite,
  }, null, 2));
  console.log("\nSaved to:", outFile);

  console.log("\n# ─── Add these to your root .env ───────────────────────────────");
  console.log(`\n# Demo Token Suite (Sepolia)`);
  console.log(`NEXT_PUBLIC_DEMO_TOKEN_ADDRESS_11155111=${suite.Token}`);
  console.log(`NEXT_PUBLIC_DEMO_IR_ADDRESS_11155111=${suite.IdentityRegistry}`);
  console.log(`NEXT_PUBLIC_DEMO_CTR_ADDRESS_11155111=${suite.ClaimTopicsRegistry}`);
  console.log(`NEXT_PUBLIC_DEMO_TIR_ADDRESS_11155111=${suite.TrustedIssuersRegistry}`);
  console.log(`NEXT_PUBLIC_DEMO_MC_ADDRESS_11155111=${suite.ModularCompliance}`);
  console.log(`NEXT_PUBLIC_DEMO_IRS_ADDRESS_11155111=${suite.IdentityRegistryStorage}`);
  console.log("# ───────────────────────────────────────────────────────────────");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
