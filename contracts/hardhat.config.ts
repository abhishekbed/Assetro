import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-gas-reporter";
import "solidity-coverage";
import * as dotenv from "dotenv";
import * as path from "path";

// Deployment configuration comes only from the root .env.local file.
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

function normalizePrivateKey(value?: string): string {
  if (!value?.trim()) {
    throw new Error("DEPLOYER_PRIVATE_KEY must be set in the root .env.local file.");
  }
  const privateKey = value.trim();
  return privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
}

const DEPLOYER_ACCOUNTS = process.env.DEPLOYER_PRIVATE_KEY?.trim()
  ? [normalizePrivateKey(process.env.DEPLOYER_PRIVATE_KEY)]
  : [];
const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  process.env.ETHEREUM_TESTNET_RPC_URL ||
  "https://rpc.sepolia.org";
const ARC_TESTNET_RPC_URL =
  process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network";
const ARC_TESTNET_CHAIN_ID = Number(process.env.ARC_TESTNET_CHAIN_ID || "5042002");
if (ARC_TESTNET_CHAIN_ID !== 5042002) {
  throw new Error("ARC_TESTNET_CHAIN_ID must be 5042002; Arc mainnet deployments are disabled.");
}
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.17",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: DEPLOYER_ACCOUNTS,
      chainId: 11155111,
    },
    arcTestnet: {
      url: ARC_TESTNET_RPC_URL,
      accounts: DEPLOYER_ACCOUNTS,
      chainId: 5042002,
    },
    polygon: {
      url: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
      accounts: DEPLOYER_ACCOUNTS,
      chainId: 137,
    },
    mumbai: {
      url:
        process.env.MUMBAI_RPC_URL ||
        "https://rpc-mumbai.maticvigil.com",
      accounts: DEPLOYER_ACCOUNTS,
      chainId: 80001,
    },
    bharat: {
      url: process.env.BHARAT_RPC_URL || "http://127.0.0.1:8545",
      accounts: DEPLOYER_ACCOUNTS,
      chainId: Number(process.env.BHARAT_CHAIN_ID || "1337"),
    },
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      sepolia: ETHERSCAN_API_KEY,
      polygon: POLYGONSCAN_API_KEY,
      polygonMumbai: POLYGONSCAN_API_KEY,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: COINMARKETCAP_API_KEY,
    outputFile: "gas-report.txt",
    noColors: true,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
