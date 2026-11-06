/**
 * Register TREXFactory as a token factory in IdFactory via the OIDGateway.
 * This is required so TREXFactory can call IdFactory.createTokenIdentity()
 * when deploying token suites (for auto-creating a token's ONCHAINID).
 */
import { ethers } from "hardhat";

const OID_GATEWAY   = "0xDB279730C8E1842cDf86B13b70aCDe1bB8De51eA";
const TREX_FACTORY  = "0x9780c229d4659bF81C3a54574205C2328d2bF076";
const ID_FACTORY    = "0xE3e472da6629523e06a32Bb85038093cc528F9d6";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Encode IdFactory.addTokenFactory(TREX_FACTORY) call
  const callData = new ethers.Interface(["function addTokenFactory(address _factory) external"])
    .encodeFunctionData("addTokenFactory", [TREX_FACTORY]);

  const gatewayAbi = ["function callFactory(bytes memory data) external"];
  const gateway = new ethers.Contract(OID_GATEWAY, gatewayAbi, deployer);

  console.log("Calling Gateway.callFactory → IdFactory.addTokenFactory(TREXFactory)...");
  const tx = await gateway.callFactory(callData);
  await tx.wait();
  console.log("Done. Tx:", tx.hash);

  // Verify
  const idFactoryAbi = ["function isTokenFactory(address) view returns (bool)"];
  const idFactory = new ethers.Contract(ID_FACTORY, idFactoryAbi, deployer);
  const isRegistered = await idFactory.isTokenFactory(TREX_FACTORY);
  console.log("TREXFactory registered as token factory:", isRegistered);

  if (!isRegistered) throw new Error("Registration failed");
  console.log("\nSuccess — TREXFactory can now call IdFactory.createTokenIdentity()");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
