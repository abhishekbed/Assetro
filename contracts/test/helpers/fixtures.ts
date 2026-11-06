import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  Token,
  IdentityRegistry,
  ModularCompliance,
  TREXFactory,
  TREXImplementationAuthority,
  ClaimIssuer,
  Identity,
} from "../../typechain-types";

export const CLAIM_TOPICS = {
  KYC: 1,
  AML: 2,
  ACCREDITED_INVESTOR: 3,
} as const;

export const KEY_PURPOSE = {
  MANAGEMENT: 1,
  ACTION: 2,
  CLAIM: 3,
} as const;

export interface DeployedSuite {
  deployer: SignerWithAddress;
  agent: SignerWithAddress;
  claimIssuerSigner: SignerWithAddress;
  alice: SignerWithAddress;
  bob: SignerWithAddress;
  charlie: SignerWithAddress;
  outsider: SignerWithAddress;
  factory: TREXFactory;
  ia: TREXImplementationAuthority;
  token: Token;
  ir: IdentityRegistry;
  mc: ModularCompliance;
  claimIssuer: ClaimIssuer;
  salt: string;
  verifyInvestor: (wallet: SignerWithAddress, country?: number) => Promise<Identity>;
}

/** Deploys a bare module contract (no constructor args — all modules here use AbstractModule). */
export async function deployModule<T = unknown>(contractName: string): Promise<T> {
  const c = await (await ethers.getContractFactory(contractName)).deploy();
  return c as unknown as T;
}

/**
 * Deploys a full, real T-REX suite via TREXFactory.deployTREXSuite — the exact
 * same entry point the backend (token-deployment.service.ts) and the issuer
 * portal's wallet-signed deployment flow use in production.
 *
 * The token's own ONCHAINID is pre-deployed and passed in explicitly, so the
 * factory never calls IIdFactory.createTokenIdentity — this lets tests use a
 * throwaway placeholder address for the `idFactory` constructor argument
 * without needing a real IdFactory/Gateway deployment.
 */
export async function deployFullSuite(opts: {
  complianceModules?: string[];
  complianceSettings?: string[];
} = {}): Promise<DeployedSuite> {
  const [deployer, agent, claimIssuerSigner, alice, bob, charlie, outsider] =
    await ethers.getSigners();

  // ── 1. Core implementations ──────────────────────────────────────────────
  const tokenImpl = await (await ethers.getContractFactory("Token")).deploy();
  const ctrImpl = await (await ethers.getContractFactory("ClaimTopicsRegistry")).deploy();
  const irImpl = await (await ethers.getContractFactory("IdentityRegistry")).deploy();
  const irsImpl = await (await ethers.getContractFactory("IdentityRegistryStorage")).deploy();
  const tirImpl = await (await ethers.getContractFactory("TrustedIssuersRegistry")).deploy();
  const mcImpl = await (await ethers.getContractFactory("ModularCompliance")).deploy();

  // ── 2. Implementation authority (reference, version 4.0.0) ──────────────
  const ia = (await (
    await ethers.getContractFactory("TREXImplementationAuthority")
  ).deploy(true, ethers.ZeroAddress, ethers.ZeroAddress)) as unknown as TREXImplementationAuthority;

  await ia.addAndUseTREXVersion(
    { major: 4, minor: 0, patch: 0 },
    {
      tokenImplementation: await tokenImpl.getAddress(),
      ctrImplementation: await ctrImpl.getAddress(),
      irImplementation: await irImpl.getAddress(),
      irsImplementation: await irsImpl.getAddress(),
      tirImplementation: await tirImpl.getAddress(),
      mcImplementation: await mcImpl.getAddress(),
    },
  );

  // ── 3. Factory ────────────────────────────────────────────────────────────
  // idFactory_ is never called (token ONCHAINID is always pre-supplied below),
  // so any non-zero address satisfies the constructor's zero-address check.
  const factory = (await (
    await ethers.getContractFactory("TREXFactory")
  ).deploy(await ia.getAddress(), deployer.address)) as unknown as TREXFactory;

  // ── 4. Token's own ONCHAINID + platform claim issuer ─────────────────────
  const tokenIdentity = await (
    await ethers.getContractFactory("Identity")
  ).deploy(deployer.address, false);

  const claimIssuer = (await (
    await ethers.getContractFactory("ClaimIssuer")
  ).deploy(claimIssuerSigner.address)) as unknown as ClaimIssuer;

  // ── 5. Deploy the suite ───────────────────────────────────────────────────
  const salt = `test-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const tokenDetails = {
    owner: deployer.address,
    name: "Test Security Token",
    symbol: "TST",
    decimals: 18,
    irs: ethers.ZeroAddress,
    ONCHAINID: await tokenIdentity.getAddress(),
    irAgents: [deployer.address, agent.address],
    tokenAgents: [agent.address],
    complianceModules: opts.complianceModules ?? [],
    complianceSettings: opts.complianceSettings ?? [],
  };
  const claimDetails = {
    claimTopics: [CLAIM_TOPICS.KYC],
    issuers: [await claimIssuer.getAddress()],
    issuerClaims: [[CLAIM_TOPICS.KYC]],
  };

  const tx = await factory.deployTREXSuite(salt, tokenDetails, claimDetails);
  const receipt = await tx.wait();

  let tokenAddr = "";
  let irAddr = "";
  let mcAddr = "";
  for (const log of receipt!.logs) {
    try {
      const parsed = factory.interface.parseLog(log as unknown as { topics: string[]; data: string });
      if (parsed?.name === "TREXSuiteDeployed") {
        tokenAddr = parsed.args[0] as string;
        irAddr = parsed.args[1] as string;
        mcAddr = parsed.args[5] as string;
      }
    } catch {
      // not a factory event — ignore
    }
  }
  if (!tokenAddr) throw new Error("TREXSuiteDeployed event not found");

  const token = (await ethers.getContractAt("Token", tokenAddr)) as unknown as Token;
  const ir = (await ethers.getContractAt("IdentityRegistry", irAddr)) as unknown as IdentityRegistry;
  const mc = (await ethers.getContractAt("ModularCompliance", mcAddr)) as unknown as ModularCompliance;

  /**
   * Deploys a real ONCHAINID for `wallet`, has the investor grant the
   * platform claim issuer a CLAIM key (mirrors AuthorizePlatformButton /
   * ClaimIssuanceService in production), issues a signed KYC claim, and
   * registers the identity in the token's IdentityRegistry — exactly the
   * real end-to-end flow, just without the HTTP/DB layer in between.
   */
  async function verifyInvestor(wallet: SignerWithAddress, country = 840): Promise<Identity> {
    const identity = (await (
      await ethers.getContractFactory("Identity")
    ).deploy(wallet.address, false)) as unknown as Identity;
    const identityAddr = await identity.getAddress();

    const claimIssuerKeyHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["address"], [claimIssuerSigner.address]),
    );
    await identity.connect(wallet).addKey(claimIssuerKeyHash, KEY_PURPOSE.CLAIM, 1);

    const topic = CLAIM_TOPICS.KYC;
    const data = "0x";
    const claimIssuerAddr = await claimIssuer.getAddress();
    const dataHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes"],
        [identityAddr, topic, data],
      ),
    );
    const sig = await claimIssuerSigner.signMessage(ethers.getBytes(dataHash));

    await identity
      .connect(claimIssuerSigner)
      .addClaim(topic, 1, claimIssuerAddr, sig, data, "");

    await ir.connect(deployer).registerIdentity(wallet.address, identityAddr, country);

    return identity;
  }

  return {
    deployer,
    agent,
    claimIssuerSigner,
    alice,
    bob,
    charlie,
    outsider,
    factory,
    ia,
    token,
    ir,
    mc,
    claimIssuer,
    salt,
    verifyInvestor,
  };
}
