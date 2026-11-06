import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying TokenFactory with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Deploy TokenFactory
  const TokenFactory = await ethers.getContractFactory("TokenFactory");
  const factory = await TokenFactory.deploy();
  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log("TokenFactory deployed to:", factoryAddress);

  const implAddress = await factory.tokenImplementation();
  console.log("Token implementation deployed to:", implAddress);

  console.log("\n--- Deployment Summary ---");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("TokenFactory:", factoryAddress);
  console.log("Token Implementation:", implAddress);
  console.log("Deployer:", deployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
