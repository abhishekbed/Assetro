import { run, ethers } from "hardhat";

async function verifyContract(address: string, constructorArguments: unknown[] = []) {
  try {
    console.log(`Verifying ${address}...`);
    await run("verify:verify", {
      address,
      constructorArguments,
    });
    console.log(`Verified: ${address}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("already verified")) {
      console.log(`Already verified: ${address}`);
    } else {
      console.error(`Failed to verify ${address}:`, message);
    }
  }
}

async function main() {
  const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || "";
  const TENANT_ID = process.env.TENANT_ID || "";

  if (!FACTORY_ADDRESS) {
    console.error("Error: FACTORY_ADDRESS environment variable is required");
    process.exit(1);
  }

  // Verify the factory
  console.log("--- Verifying TokenFactory ---");
  await verifyContract(FACTORY_ADDRESS, []);

  // If tenant ID is provided, verify the full suite
  if (TENANT_ID) {
    console.log(`\n--- Verifying Token Suite for tenant: ${TENANT_ID} ---`);

    const factory = await ethers.getContractAt("TokenFactory", FACTORY_ADDRESS);
    const deployment = await factory.getDeployment(TENANT_ID);

    // Verify Token Implementation
    console.log("\nVerifying Token implementation...");
    await verifyContract(deployment.tokenImplementation, []);

    // Verify Token Proxy
    console.log("\nVerifying Token proxy...");
    // Proxy constructor args: (implementation, initData)
    // We skip proxy verification as it is auto-detected by Etherscan

    // Verify Identity Registry
    console.log("\nVerifying Identity Registry...");
    const token = await ethers.getContractAt("Token", deployment.token);
    const tokenOwner = await token.owner();
    await verifyContract(deployment.identityRegistry, [tokenOwner]);

    // Verify Claim Topics Registry
    console.log("\nVerifying Claim Topics Registry...");
    await verifyContract(deployment.claimTopicsRegistry, [tokenOwner]);

    // Verify Trusted Issuers Registry
    console.log("\nVerifying Trusted Issuers Registry...");
    await verifyContract(deployment.trustedIssuersRegistry, [tokenOwner]);

    // Verify Modular Compliance
    console.log("\nVerifying Modular Compliance...");
    await verifyContract(deployment.modularCompliance, [tokenOwner]);
  }

  console.log("\n--- Verification Complete ---");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
