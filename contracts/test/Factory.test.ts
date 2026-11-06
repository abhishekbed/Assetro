import { expect } from "chai";
import { ethers } from "hardhat";
import { deployFullSuite, deployModule, CLAIM_TOPICS } from "./helpers/fixtures";
import {
  CountryRestrictModule,
  MaxHolderModule,
  TransferWindowModule,
  SupplyLimitModule,
  MaxBalanceModule,
  DayMonthLimitsModule,
} from "../typechain-types";

describe("TREXFactory", function () {
  it("deploys a full suite and transfers ownership of every contract to the designated owner", async function () {
    const s = await deployFullSuite();

    expect(await s.token.owner()).to.equal(s.deployer.address);
    expect(await s.ir.owner()).to.equal(s.deployer.address);
    expect(await s.mc.owner()).to.equal(s.deployer.address);
  });

  it("wires the token to the identity registry and compliance it deployed", async function () {
    const s = await deployFullSuite();
    expect(await s.token.identityRegistry()).to.equal(await s.ir.getAddress());
    expect(await s.token.compliance()).to.equal(await s.mc.getAddress());
  });

  it("makes the token itself an agent of its own identity registry", async function () {
    const s = await deployFullSuite();
    expect(await s.ir.isAgent(await s.token.getAddress())).to.equal(true);
  });

  it("adds every requested irAgent and tokenAgent", async function () {
    const s = await deployFullSuite();
    expect(await s.ir.isAgent(s.deployer.address)).to.equal(true);
    expect(await s.ir.isAgent(s.agent.address)).to.equal(true);
    expect(await s.token.isAgent(s.agent.address)).to.equal(true);
    // investors are not agents of anything
    expect(await s.token.isAgent(s.alice.address)).to.equal(false);
  });

  it("registers the requested claim topics and trusted issuer", async function () {
    const s = await deployFullSuite();

    const ctr = await ethers.getContractAt("ClaimTopicsRegistry", await s.ir.topicsRegistry());
    expect(await ctr.getClaimTopics()).to.deep.equal([BigInt(CLAIM_TOPICS.KYC)]);

    const tir = await ethers.getContractAt("TrustedIssuersRegistry", await s.ir.issuersRegistry());
    expect(await tir.isTrustedIssuer(await s.claimIssuer.getAddress())).to.equal(true);
  });

  it("binds and configures every requested compliance module atomically in one deployTREXSuite call", async function () {
    const module = await deployModule<CountryRestrictModule>("CountryRestrictModule");
    const calldata = module.interface.encodeFunctionData("batchRestrictCountries", [[156]]);
    const s = await deployFullSuite({
      complianceModules: [await module.getAddress()],
      complianceSettings: [calldata],
    });

    expect(await s.mc.isModuleBound(await module.getAddress())).to.equal(true);
    expect(await module.isCountryRestricted(await s.mc.getAddress(), 156)).to.equal(true);
  });

  it("binds and configures all six deploy-time modules in a single call", async function () {
    // Mirrors exactly what apps/api token-deployment.service.ts and the issuer
    // portal's create wizard build for complianceModules[]/complianceSettings[].
    const countryRestrict = await deployModule<CountryRestrictModule>("CountryRestrictModule");
    const maxHolder = await deployModule<MaxHolderModule>("MaxHolderModule");
    const transferWindow = await deployModule<TransferWindowModule>("TransferWindowModule");
    const supplyLimit = await deployModule<SupplyLimitModule>("SupplyLimitModule");
    const maxBalance = await deployModule<MaxBalanceModule>("MaxBalanceModule");
    const dayMonth = await deployModule<DayMonthLimitsModule>("DayMonthLimitsModule");

    const E18 = (n: number) => ethers.parseUnits(n.toString(), 18);

    const modules = [
      await countryRestrict.getAddress(),
      await maxHolder.getAddress(),
      await transferWindow.getAddress(),
      await supplyLimit.getAddress(),
      await maxBalance.getAddress(),
      // day/month limits needs two setup calls — same address pushed twice
      await dayMonth.getAddress(),
      await dayMonth.getAddress(),
    ];
    const settings = [
      countryRestrict.interface.encodeFunctionData("batchRestrictCountries", [[156]]),
      maxHolder.interface.encodeFunctionData("setMaxHolders", [500]),
      transferWindow.interface.encodeFunctionData("deactivateBlackout", []),
      supplyLimit.interface.encodeFunctionData("setSupplyLimit", [E18(1_000_000)]),
      maxBalance.interface.encodeFunctionData("setMaxBalance", [E18(10_000)]),
      dayMonth.interface.encodeFunctionData("setDailyLimit", [E18(1_000)]),
      dayMonth.interface.encodeFunctionData("setMonthlyLimit", [E18(20_000)]),
    ];

    const s = await deployFullSuite({ complianceModules: modules, complianceSettings: settings });
    const mcAddr = await s.mc.getAddress();

    // all six distinct modules bound (day/month counted once)
    expect(await s.mc.isModuleBound(await countryRestrict.getAddress())).to.equal(true);
    expect(await s.mc.isModuleBound(await maxHolder.getAddress())).to.equal(true);
    expect(await s.mc.isModuleBound(await transferWindow.getAddress())).to.equal(true);
    expect(await s.mc.isModuleBound(await supplyLimit.getAddress())).to.equal(true);
    expect(await s.mc.isModuleBound(await maxBalance.getAddress())).to.equal(true);
    expect(await s.mc.isModuleBound(await dayMonth.getAddress())).to.equal(true);
    expect((await s.mc.getModules()).length).to.equal(6);

    // and every setting actually landed
    expect(await countryRestrict.isCountryRestricted(mcAddr, 156)).to.equal(true);
    expect(await maxHolder.getMaxHolders(mcAddr)).to.equal(500n);
    expect(await supplyLimit.getSupplyLimit(mcAddr)).to.equal(E18(1_000_000));
    expect(await maxBalance.getMaxBalance(mcAddr)).to.equal(E18(10_000));
    expect(await dayMonth.getDailyLimit(mcAddr)).to.equal(E18(1_000));
    expect(await dayMonth.getMonthlyLimit(mcAddr)).to.equal(E18(20_000));
  });

  it("refuses to deploy twice with the same salt", async function () {
    const s = await deployFullSuite();
    const tokenDetails = {
      owner: s.deployer.address,
      name: "Duplicate",
      symbol: "DUP",
      decimals: 18,
      irs: ethers.ZeroAddress,
      ONCHAINID: await s.token.onchainID(),
      irAgents: [],
      tokenAgents: [],
      complianceModules: [],
      complianceSettings: [],
    };
    const claimDetails = { claimTopics: [], issuers: [], issuerClaims: [] };

    await expect(
      s.factory.connect(s.deployer).deployTREXSuite(s.salt, tokenDetails, claimDetails),
    ).to.be.revertedWith("token already deployed");
  });

  it("refuses deployTREXSuite from a non-owner caller", async function () {
    const s = await deployFullSuite();
    const tokenDetails = {
      owner: s.alice.address,
      name: "Rogue",
      symbol: "RGE",
      decimals: 18,
      irs: ethers.ZeroAddress,
      ONCHAINID: await s.token.onchainID(),
      irAgents: [],
      tokenAgents: [],
      complianceModules: [],
      complianceSettings: [],
    };
    const claimDetails = { claimTopics: [], issuers: [], issuerClaims: [] };

    await expect(
      s.factory.connect(s.alice).deployTREXSuite(`${s.salt}-rogue`, tokenDetails, claimDetails),
    ).to.be.reverted;
  });
});
