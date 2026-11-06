import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying token suite with account:", deployer.address);

  // Configuration - customize these for your deployment
  const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "";
  const TENANT_ID = process.env.TENANT_ID || "default-tenant";
  const TOKEN_NAME = process.env.TOKEN_NAME || "Assetro Security Token";
  const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || "TST";
  const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || "18");
  const TOKEN_OWNER = process.env.TOKEN_OWNER || deployer.address;

  if (!FACTORY_ADDRESS) {
    console.error("Error: FACTORY_ADDRESS environment variable is required");
    console.error("Usage: FACTORY_ADDRESS=0x... TENANT_ID=my-tenant npx hardhat run scripts/deploy-token.ts --network <network>");
    process.exit(1);
  }

  console.log("\n--- Configuration ---");
  console.log("Factory:", FACTORY_ADDRESS);
  console.log("Tenant ID:", TENANT_ID);
  console.log("Token Name:", TOKEN_NAME);
  console.log("Token Symbol:", TOKEN_SYMBOL);
  console.log("Token Decimals:", TOKEN_DECIMALS);
  console.log("Token Owner:", TOKEN_OWNER);

  // Connect to factory
  const factory = await ethers.getContractAt("TokenFactory", FACTORY_ADDRESS);

  // Deploy token suite
  console.log("\nDeploying token suite...");
  const tx = await factory.deployTokenSuite(
    TENANT_ID,
    TOKEN_NAME,
    TOKEN_SYMBOL,
    TOKEN_DECIMALS,
    TOKEN_OWNER
  );

  const receipt = await tx.wait();
  console.log("Transaction hash:", receipt?.hash);

  // Fetch deployment addresses
  const deployment = await factory.getDeployment(TENANT_ID);

  console.log("\n--- Token Suite Deployed ---");
  console.log("Token (Proxy):", deployment.token);
  console.log("Token Implementation:", deployment.tokenImplementation);
  console.log("Identity Registry:", deployment.identityRegistry);
  console.log("Claim Topics Registry:", deployment.claimTopicsRegistry);
  console.log("Trusted Issuers Registry:", deployment.trustedIssuersRegistry);
  console.log("Modular Compliance:", deployment.modularCompliance);

  console.log("\n--- Deployment Complete ---");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Tenant:", TENANT_ID);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
